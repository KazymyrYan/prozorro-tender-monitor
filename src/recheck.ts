import { config } from "./config";
import { initDb, ItemRow, sequelize, TenderRow } from "./db/models";
import { findCpvMatches } from "./filter/cpv";
import { createMatcher } from "./filter/matcher";

// re-runs the current search config over the stored tenders, writes nothing
const showAll = process.argv.includes("--all");
const findWords = createMatcher(config.blocks, config.exclude);

// "UA-2026-10-22-012829-a" -> "012829", the short number used in conversations
const shortNumber = (tenderNumber: string) =>
  tenderNumber.split("-")[4] ?? tenderNumber;

await initDb();

const rows = await TenderRow.findAll({ order: [["firstSeenAt", "ASC"]] });
const items = await ItemRow.findAll();

const itemsByTender = new Map<string, ItemRow[]>();
for (const item of items) {
  itemsByTender.set(item.tenderId, [
    ...(itemsByTender.get(item.tenderId) ?? []),
    item,
  ]);
}

let same = 0;
let changed = 0;
let dropped = 0;

for (const row of rows) {
  const tender = {
    title: row.title,
    items: (itemsByTender.get(row.id) ?? []).map((item) => ({
      description: item.description,
      classification: { id: item.cpvCode },
    })),
  };

  const words = findWords(tender);
  const cpv = findCpvMatches(tender, config.cpv);
  const matched = config.requireCpv
    ? words.length > 0 && cpv.length > 0
    : words.length > 0 || cpv.length > 0;

  const before = [...row.matchedWords].sort().join(", ");
  const after = [...words].sort().join(", ");

  let status = "same";
  if (!matched) status = "DROPPED";
  else if (before !== after) status = "CHANGED";

  if (status === "same") same++;
  else if (status === "DROPPED") dropped++;
  else changed++;

  if (status !== "same" || showAll) {
    console.log(
      `${status} ${shortNumber(row.tenderNumber)} | ${row.title.trim().slice(0, 70)}`,
    );
    if (status !== "same") console.log(`  was: ${before}\n  now: ${after || "-"}`);
  }
}

console.log(
  `total: ${rows.length}, same: ${same}, changed: ${changed}, dropped: ${dropped}`,
);

await sequelize.close();
