import { config } from "./config";
import { initDb, sequelize } from "./db/models";
import {
  findSeenIds,
  getOffset,
  purgeOldSeen,
  saveOffset,
  saveTenders,
  type TenderEntry,
} from "./db/store";
import { findCpvMatches } from "./filter/cpv";
import { createMatcher } from "./filter/matcher";
import {
  fetchTender,
  offsetHoursAgo,
  tenderUrl,
  type Tender,
} from "./prozorro/client";
import { fetchActiveSince } from "./prozorro/sync";
import { mapInBatches } from "./utils/batch";

const CHUNK_SIZE = 200;
const findWords = createMatcher(config.blocks, config.exclude);

console.time("run");
await initDb();

// continue where the last run stopped, the very first run starts 24 hours back
const startOffset = (await getOffset()) ?? offsetHoursAgo(24);
const feed = await fetchActiveSince(startOffset);

// details are loaded only for tenders we haven't seen yet
const seen = await findSeenIds(feed.items.map((item) => item.id));
const fresh = feed.items.filter((item) => !seen.has(item.id));
console.log(`active: ${feed.items.length}, new: ${fresh.length}`);

const failures: string[] = [];
const hits: TenderEntry[] = [];
let stored = 0;

// load and save chunk by chunk: a crash or Ctrl+C loses at most one chunk
for (let i = 0; i < fresh.length; i += CHUNK_SIZE) {
  const chunk = fresh.slice(i, i + CHUNK_SIZE);

  const loaded = await mapInBatches(
    chunk,
    5,
    async (item) => {
      try {
        return await fetchTender(item.id);
      } catch (error) {
        // one failed request shouldn't sink the whole run
        failures.push((error as Error).message);
        return null;
      }
    },
    300,
  );

  const entries: TenderEntry[] = loaded
    .filter((t): t is Tender => t !== null)
    .map((tender) => {
      const words = findWords(tender);
      const cpv = findCpvMatches(tender, config.cpv);
      // keyword AND cpv works like a manual search, otherwise either is enough
      const matched = config.requireCpv
        ? words.length > 0 && cpv.length > 0
        : words.length > 0 || cpv.length > 0;
      return { tender, words, cpv, matched };
    });

  stored += await saveTenders(entries);
  hits.push(...entries.filter((entry) => entry.matched));
  console.log(
    `progress: ${Math.min(i + CHUNK_SIZE, fresh.length)}/${fresh.length}`,
  );
}

const purged = await purgeOldSeen();
console.log(`stored in full: ${stored}, old seen marks purged: ${purged}`);

// move the offset only if everything loaded, otherwise the failed ones would be lost
if (failures.length === 0) {
  await saveOffset(feed.nextOffset);
} else {
  console.error(
    `failed: ${failures.length}, offset not moved, first: ${failures[0]}`,
  );
}

console.log(`matched: ${hits.length}`);

// just a peek, the real report will go to Telegram
for (const { tender, words, cpv } of hits.slice(0, 5)) {
  console.log("---");
  console.log(`${tender.tenderID} | ${tender.title.trim()}`);
  console.log("words:", words.join(", ") || "-");
  console.log("cpv:", cpv.join(", ") || "-");
  console.log(
    "budget:",
    tender.value?.amount ?? "no budget",
    tender.value?.currency ?? "",
  );
  console.log("link:", tenderUrl(tender.tenderID));
}

await sequelize.close();
console.timeEnd("run");
