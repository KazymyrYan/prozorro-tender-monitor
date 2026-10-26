import { publicationDate, type Tender } from "../prozorro/client";
import {
  AwardRow,
  ItemRow,
  SeenRow,
  sequelize,
  SyncState,
  TenderRow,
} from "./models";

const OFFSET_KEY = "feed_offset";

/** Offset to continue the feed from, null on the very first run. */
export async function getOffset(): Promise<string | null> {
  const row = await SyncState.findByPk(OFFSET_KEY);
  return row?.value ?? null;
}

export async function saveOffset(offset: string): Promise<void> {
  await SyncState.upsert({ key: OFFSET_KEY, value: offset });
}

/** Which of these API ids were already processed. */
export async function findSeenIds(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await SeenRow.findAll({
    where: { id: ids },
    attributes: ["id"],
  });
  return new Set(rows.map((row) => row.id));
}

export interface TenderEntry {
  tender: Tender;
  words: string[];
  cpv: string[];
  matched: boolean;
}

/**
 * Remembers every tender as seen, but stores full data (with items) only for matched ones.
 * The caller must pass tenders that are not seen yet. Returns how many were stored in full.
 */
export async function saveTenders(entries: TenderEntry[]): Promise<number> {
  if (entries.length === 0) return 0;

  const matched = entries.filter((entry) => entry.matched);

  // seen marks, tenders and items go in together or not at all
  await sequelize.transaction(async (transaction) => {
    await SeenRow.bulkCreate(
      entries.map(({ tender }) => ({ id: tender.id })),
      { ignoreDuplicates: true, transaction },
    );
    if (matched.length === 0) return;

    await TenderRow.bulkCreate(
      matched.map(({ tender, words, cpv }) => ({
        id: tender.id,
        tenderNumber: tender.tenderID,
        title: tender.title.trim(),
        procuringEntity: tender.procuringEntity.name.trim(),
        procuringEntityEdrpou: tender.procuringEntity.identifier?.id ?? null,
        procuringEntityRegion: tender.procuringEntity.address?.region ?? null,
        procurementMethodType: tender.procurementMethodType,
        // some procedures have a value object without an amount
        budgetAmount:
          typeof tender.value?.amount === "number"
            ? String(tender.value.amount)
            : null,
        currency: tender.value?.currency ?? null,
        tenderPeriodEnd: tender.tenderPeriod?.endDate
          ? new Date(tender.tenderPeriod.endDate)
          : null,
        publishedAt: publicationDate(tender),
        status: tender.status,
        dateModified: new Date(tender.dateModified),
        matchedWords: words,
        matchedCpv: cpv,
      })),
      { transaction },
    );

    await AwardRow.bulkCreate(
      matched.flatMap(({ tender }) =>
        (tender.awards ?? []).flatMap((award) =>
          (award.suppliers ?? []).map((supplier) => ({
            tenderId: tender.id,
            supplierName: supplier.name?.trim() ?? "",
            supplierEdrpou: supplier.identifier?.id ?? null,
            amount:
              typeof award.value?.amount === "number"
                ? String(award.value.amount)
                : null,
            currency: award.value?.currency ?? null,
            status: award.status,
            awardedAt: award.date ? new Date(award.date) : null,
          })),
        ),
      ),
      { transaction },
    );

    await ItemRow.bulkCreate(
      matched.flatMap(({ tender }) =>
        (tender.items ?? []).map((item) => ({
          tenderId: tender.id,
          description: item.description.trim(),
          quantity:
            typeof item.quantity === "number" ? String(item.quantity) : null,
          unit: item.unit?.name ?? null,
          cpvCode: item.classification.id,
        })),
      ),
      { transaction },
    );
  });

  return matched.length;
}

/** Forgets old seen marks of tenders we didn't keep, so the table stays small. */
export async function purgeOldSeen(days = 14): Promise<number> {
  const [, meta] = await sequelize.query(
    `DELETE FROM seen_tenders
    WHERE seen_at < now() - make_interval(days => :days)
    AND id NOT IN (SELECT id FROM tenders)`,
    { replacements: { days } },
  );
  return (meta as { rowCount?: number }).rowCount ?? 0;
}

export async function getState(key: string): Promise<string | null> {
  const row = await SyncState.findByPk(key);
  return row?.value ?? null;
}

export async function setState(key: string, value: string): Promise<void> {
  await SyncState.upsert({ key, value });
}

// when the last fully successful collect finished, read by the health check
export const COLLECT_OK_KEY = "last_collect_ok";
