import type { Tender } from "../prozorro/client";
import { ItemRow, sequelize, SyncState, TenderRow } from "./models";

const OFFSET_KEY = "feed_offset";

/** Offset to continue the feed from, null on the very first run. */
export async function getOffset(): Promise<string | null> {
  const row = await SyncState.findByPk(OFFSET_KEY);
  return row?.value ?? null;
}

export async function saveOffset(offset: string): Promise<void> {
  await SyncState.upsert({ key: OFFSET_KEY, value: offset });
}

/** Which of these API ids are already stored. */
export async function findSeenIds(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await TenderRow.findAll({
    where: { id: ids },
    attributes: ["id"],
  });
  return new Set(rows.map((row) => row.id));
}

export interface TenderEntry {
  tender: Tender;
  words: string[];
  cpv: string[];
}

/** Stores tenders with their items, skips the ones we already have. Returns how many were new. */
export async function saveTenders(entries: TenderEntry[]): Promise<number> {
  const known = await findSeenIds(entries.map((entry) => entry.tender.id));
  const fresh = entries.filter((entry) => !known.has(entry.tender.id));
  if (fresh.length === 0) return 0;

  // tenders and items go in together or not at all
  await sequelize.transaction(async (transaction) => {
    await TenderRow.bulkCreate(
      fresh.map(({ tender, words, cpv }) => ({
        id: tender.id,
        tenderNumber: tender.tenderID,
        title: tender.title.trim(),
        procuringEntity: tender.procuringEntity.name.trim(),
        budgetAmount: tender.value ? String(tender.value.amount) : null,
        currency: tender.value?.currency ?? null,
        tenderPeriodEnd: tender.tenderPeriod
          ? new Date(tender.tenderPeriod.endDate)
          : null,
        status: tender.status,
        matchedWords: words,
        matchedCpv: cpv,
        isMatched: words.length > 0 || cpv.length > 0,
      })),
      { transaction },
    );

    await ItemRow.bulkCreate(
      fresh.flatMap(({ tender }) =>
        (tender.items ?? []).map((item) => ({
          tenderId: tender.id,
          description: item.description.trim(),
          quantity: item.quantity === undefined ? null : String(item.quantity),
          unit: item.unit?.name ?? null,
          cpvCode: item.classification.id,
        })),
      ),
      { transaction },
    );
  });

  return fresh.length;
}
