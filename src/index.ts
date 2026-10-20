import { CPV_CODES, KEYWORDS } from "./config";
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

const feed = await fetchActiveSince(offsetHoursAgo(2));
console.log("active tenders:", feed.items.length);

const failures: string[] = [];

const loaded = await mapInBatches(
  feed.items,
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

if (failures.length > 0) {
  console.error(`failed: ${failures.length}, first: ${failures[0]}`);
}

// a tender is interesting if a keyword OR a CPV code matched
const matched = tenders
  .map((tender) => ({
    tender,
    words: findMatches(tender, KEYWORDS),
    cpv: findCpvMatches(tender, CPV_CODES),
  }))
  .filter(({ words, cpv }) => words.length > 0 || cpv.length > 0);

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

console.timeEnd("run");