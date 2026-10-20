import { CPV_CODES, KEYWORDS } from "./config";
import { sequelize, initDb } from "./db/models";
import { findSeenIds, getOffset, saveOffset, saveTenders } from "./db/store";
import { findCpvMatches } from "./filter/cpv";
import { findMatches } from "./filter/matcher";
import {
  fetchTender,
  offsetHoursAgo,
  tenderUrl,
  type Tender,
} from "./prozorro/client";
import { fetchActiveSince } from "./prozorro/sync";
import { mapInBatches } from "./utils/batch";

console.time("run");
await initDb();

// continue where the last run stopped, the very first run starts 24 hours back
const startOffset = (await getOffset()) ?? offsetHoursAgo(24);
const feed = await fetchActiveSince(startOffset);

// details are loaded only for tenders we haven't stored yet
const seen = await findSeenIds(feed.items.map((item) => item.id));
const fresh = feed.items.filter((item) => !seen.has(item.id));
console.log(`active: ${feed.items.length}, new: ${fresh.length}`);

const failures: string[] = [];

const loaded = await mapInBatches(
  fresh,
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

// drop the failed ones (null)
const tenders = loaded.filter((t): t is Tender => t !== null);

const entries = tenders.map((tender) => ({
  tender,
  words: findMatches(tender, KEYWORDS),
  cpv: findCpvMatches(tender, CPV_CODES),
}));

await saveTenders(entries);

// move the offset only if everything loaded, otherwise the failed ones would be lost
if (failures.length === 0) {
  await saveOffset(feed.nextOffset);
} else {
  console.error(
    `failed: ${failures.length}, offset not moved, first: ${failures[0]}`,
  );
}

const matched = entries.filter(
  ({ words, cpv }) => words.length > 0 || cpv.length > 0,
);
console.log(`loaded: ${tenders.length}, matched: ${matched.length}`);

for (const { tender, words, cpv } of matched) {
  const value = tender.value;
  console.log("---");
  console.log(`${tender.tenderID} | ${tender.title.trim()}`);
  console.log("words:", words.join(", ") || "-");
  console.log("cpv:", cpv.join(", ") || "-");
  console.log(
    "budget:",
    value ? `${value.amount} ${value.currency}` : "no budget",
  );
  console.log("link:", tenderUrl(tender.tenderID));
}

await sequelize.close();
console.timeEnd("run");
