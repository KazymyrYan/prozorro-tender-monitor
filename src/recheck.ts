import { config } from "./config";
import { initDb, ItemRow, sequelize, TenderRow } from "./db/models";
import { findCpvMatches } from "./filter/cpv";
import { createMatcher } from "./filter/matcher";

// re-runs the current search config over the stored tenders
// without --apply nothing is written, only the difference is printed
const showAll = process.argv.includes("--all");
const apply = process.argv.includes("--apply");
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
const droppedIds: string[] = [];
const changes: { id: string; words: string[] }[] = [];

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
  else if (status === "DROPPED") droppedIds.push(row.id);
  else changes.push({ id: row.id, words });

  if (status !== "same" || showAll) {
    console.log(
      `${status} ${shortNumber(row.tenderNumber)} | ${row.title.trim().slice(0, 70)}`,
    );
    if (status !== "same") console.log(`  was: ${before}\n  now: ${after || "-"}`);
  }
}

console.log(
  `total: ${rows.length}, same: ${same}, changed: ${changes.length}, dropped: ${droppedIds.length}`,
);

if (!apply) {
  console.log("preview only, add --apply to write");
} else {
  // only tenders not sent yet matter: hide them from the digest, the rows stay
  let hidden = 0;
  if (droppedIds.length > 0) {
    [hidden] = await TenderRow.update(
      { notifiedAt: new Date() },
      { where: { id: droppedIds, notifiedAt: null } },
    );
  }

  // the first matched word decides the digest block, so keep it in line with the config
  let regrouped = 0;
  for (const { id, words } of changes) {
    const [count] = await TenderRow.update(
      { matchedWords: words },
      { where: { id, notifiedAt: null } },
    );
    regrouped += count;
  }

  console.log(`applied: hidden ${hidden}, regrouped ${regrouped}`);
}

await sequelize.close();
