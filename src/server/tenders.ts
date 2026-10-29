import { Router } from "express";
import { Op } from "sequelize";
import { config } from "../config";
import { AwardRow, ItemRow, TenderMark, TenderRow } from "../db/models";
import { createDetailedMatcher } from "../filter/matcher";

const NO_TENDER_TYPES = new Set([
  "reporting",
  "negotiation",
  "negotiation.quick",
]);
const STATUSES = ["interesting", "preparing", "submitted", "won", "lost", "archive"];
const COMPANIES = ["УПИ", "УИ", "СХППП"];
// the list shows tenders from this window, plus everything with a work status
const WINDOW_DAYS = 90;

const findHits = createDetailedMatcher(config.blocks, config.exclude);
const weakWords = new Set(config.weak ?? []);

// --- Kyiv calendar days as YYYY-MM-DD strings ---

function kyivDay(date: Date): string {
  return date.toLocaleDateString("en-CA", { timeZone: "Europe/Kyiv" });
}

function shiftDay(day: string, delta: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

// 0 is Sunday
function weekday(day: string): number {
  return new Date(`${day}T12:00:00Z`).getUTCDay();
}

// Monday looks back at Fri + Sat + Sun, other days at the previous working day
function previousWorkingDays(today: string): string[] {
  if (weekday(today) === 1) {
    return [shiftDay(today, -3), shiftDay(today, -2), shiftDay(today, -1)];
  }
  let day = shiftDay(today, -1);
  while (weekday(day) === 0 || weekday(day) === 6) day = shiftDay(day, -1);
  return [day];
}

type DayFilter = (day: string | null) => boolean;

function makePeriodFilter(
  query: Record<string, unknown>,
  today: string,
): DayFilter | null {
  const period = typeof query.period === "string" ? query.period : "all";
  if (period === "all") return () => true;
  if (period === "yesterday") {
    const days = new Set(previousWorkingDays(today));
    return (day) => day !== null && days.has(day);
  }
  if (period === "week") {
    const from = shiftDay(today, -7);
    return (day) => day !== null && day >= from && day <= today;
  }
  if (
    period === "date" &&
    typeof query.date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(query.date)
  ) {
    const wanted = query.date;
    return (day) => day === wanted;
  }
  return null;
}

// --- building the response ---

function groupBy<T>(list: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of list) {
    const k = key(item);
    const group = map.get(k) ?? [];
    group.push(item);
    map.set(k, group);
  }
  return map;
}

function serializeMark(mark: TenderMark | undefined) {
  if (!mark) return null;
  return {
    status: mark.status,
    manager: mark.manager,
    company: mark.company,
    note: mark.note,
    itemsNote: mark.itemsNote,
    paymentTerms: mark.paymentTerms,
    bankGuaranteeNeeded: mark.bankGuaranteeNeeded,
    bankGuaranteeSum: mark.bankGuaranteeSum,
    contractSecurityNeeded: mark.contractSecurityNeeded,
    contractSecurityPercent: mark.contractSecurityPercent,
    updatedAt: mark.updatedAt.toISOString(),
  };
}

function serialize(
  row: TenderRow,
  items: ItemRow[],
  awards: AwardRow[],
  mark: TenderMark | undefined,
) {
  // positions are not stored, so hits are recomputed from the saved texts
  const hits = findHits({
    title: row.title,
    items: items.map((item) => ({
      description: item.description,
      classification: { id: item.cpvCode },
    })),
  });

  // unit 0 is the title, unit N is item N-1
  const words = hits.map((hit) => ({
    text: hit.word,
    strong: !weakWords.has(hit.word),
    place: hit.units.some((unit) => unit > 0) ? "pos" : "title",
  }));
  const blocks = config.blocks
    .filter((block) => hits.some((hit) => block.keywords.includes(hit.word)))
    .map((block) => block.name);
  const matchedItems = [
    ...new Set(
      hits.flatMap((hit) =>
        hit.units.filter((unit) => unit > 0).map((unit) => unit - 1),
      ),
    ),
  ];
  const award = awards.find((a) => a.status === "active") ?? awards[0];

  // a tender is shown while it still matches the current config
  const current =
    hits.length > 0 || (!config.requireCpv && row.matchedCpv.length > 0);

  const tender = {
    id: row.id,
    number: row.tenderNumber,
    title: row.title,
    customer: row.procuringEntity,
    customerEdrpou: row.procuringEntityEdrpou,
    region: row.procuringEntityRegion,
    type: NO_TENDER_TYPES.has(row.procurementMethodType)
      ? "no-tender"
      : "competitive",
    procurementMethodType: row.procurementMethodType,
    // money stays a string, never a float
    budget: row.budgetAmount,
    currency: row.currency,
    budgetVatIncluded: row.budgetVatIncluded,
    deadline: row.tenderPeriodEnd?.toISOString() ?? null,
    enquiryEnd: row.enquiryEnd?.toISOString() ?? null,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    manual: row.addedManually,
    words,
    cpv: row.matchedCpv,
    blocks,
    weak: words.length > 0 && words.every((word) => !word.strong),
    matchedItems,
    items: items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      cpvCode: item.cpvCode,
    })),
    winner: award
      ? {
          supplier: award.supplierName,
          edrpou: award.supplierEdrpou,
          amount: award.amount,
          awardedAt: award.awardedAt?.toISOString() ?? null,
        }
      : null,
    mark: serializeMark(mark),
  };
  return { current, tender };
}

export async function buildTenders(rows: TenderRow[]) {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const [items, awards, marks] = await Promise.all([
    // stored order matters: item indexes must match the ones the matcher sees
    ItemRow.findAll({ where: { tenderId: ids }, order: [["id", "ASC"]] }),
    AwardRow.findAll({ where: { tenderId: ids }, order: [["id", "ASC"]] }),
    TenderMark.findAll({ where: { tenderId: ids } }),
  ]);
  const itemsBy = groupBy(items, (item) => item.tenderId);
  const awardsBy = groupBy(awards, (award) => award.tenderId);
  const markBy = new Map(marks.map((mark) => [mark.tenderId, mark]));
  return rows.map((row) =>
    serialize(
      row,
      itemsBy.get(row.id) ?? [],
      awardsBy.get(row.id) ?? [],
      markBy.get(row.id),
    ),
  );
}

// --- validation of a marks update ---

interface MarkPatch {
  status?: string | null;
  company?: string | null;
  manager?: string | null;
  note?: string | null;
  itemsNote?: string | null;
  paymentTerms?: string | null;
  bankGuaranteeSum?: string | null;
  contractSecurityPercent?: string | null;
  bankGuaranteeNeeded?: boolean;
  contractSecurityNeeded?: boolean;
}

type TextField =
  | "manager"
  | "note"
  | "itemsNote"
  | "paymentTerms"
  | "bankGuaranteeSum"
  | "contractSecurityPercent";
type BoolField = "bankGuaranteeNeeded" | "contractSecurityNeeded";

const TEXT_LIMITS: Record<TextField, number> = {
  manager: 50,
  note: 5000,
  itemsNote: 5000,
  paymentTerms: 1000,
  bankGuaranteeSum: 100,
  contractSecurityPercent: 100,
};
const BOOL_FIELDS: BoolField[] = ["bankGuaranteeNeeded", "contractSecurityNeeded"];

/** Only known fields pass; returns null when something is invalid. */
function parseMarkPatch(body: unknown): MarkPatch | null {
  if (typeof body !== "object" || body === null) return null;
  const input = body as Record<string, unknown>;
  const patch: MarkPatch = {};

  if ("status" in input) {
    const value = input.status;
    if (value === null || value === "") patch.status = null;
    else if (typeof value === "string" && STATUSES.includes(value)) {
      patch.status = value;
    } else return null;
  }
  if ("company" in input) {
    const value = input.company;
    if (value === null || value === "") patch.company = null;
    else if (typeof value === "string" && COMPANIES.includes(value)) {
      patch.company = value;
    } else return null;
  }
  for (const field of Object.keys(TEXT_LIMITS) as TextField[]) {
    if (!(field in input)) continue;
    const value = input[field];
    if (value === null) patch[field] = null;
    else if (typeof value === "string" && value.length <= TEXT_LIMITS[field]) {
      patch[field] = value.trim() === "" ? null : value;
    } else return null;
  }
  for (const field of BOOL_FIELDS) {
    if (!(field in input)) continue;
    const value = input[field];
    if (typeof value !== "boolean") return null;
    patch[field] = value;
  }
  return patch;
}

// --- routes ---

export const tendersRouter = Router();

tendersRouter.get("/", async (req, res) => {
  const today = kyivDay(new Date());
  const inPeriod = makePeriodFilter(req.query, today);
  if (!inPeriod) {
    res.status(400).json({ error: "bad_period" });
    return;
  }

  const marked = await TenderMark.findAll({
    where: { status: { [Op.ne]: null } },
    attributes: ["tenderId"],
  });
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const rows = await TenderRow.findAll({
    where: {
      [Op.or]: [
        { publishedAt: { [Op.gte]: since } },
        { publishedAt: null },
        { id: marked.map((mark) => mark.tenderId) },
      ],
    },
  });

  const inRange = rows.filter((row) =>
    inPeriod(row.publishedAt ? kyivDay(row.publishedAt) : null),
  );
  const built = await buildTenders(inRange);
  const tenders = built
    .filter(({ current, tender }) => current || tender.mark?.status || tender.manual)
    .map(({ tender }) => tender);

  res.json({ today, tenders });
});

tendersRouter.get("/:id", async (req, res) => {
  const row = await TenderRow.findByPk(req.params.id);
  if (!row) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const [built] = await buildTenders([row]);
  res.json({ tender: built.tender });
});

tendersRouter.patch("/:id/mark", async (req, res) => {
  const id = req.params.id;
  const patch = parseMarkPatch(req.body);
  if (!patch || Object.keys(patch).length === 0) {
    res.status(400).json({ error: "bad_request" });
    return;
  }
  if (!(await TenderRow.findByPk(id, { attributes: ["id"] }))) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  // the row appears only when the first change is saved
  const existing = await TenderMark.findByPk(id);
  const mark = existing
    ? await existing.update(patch)
    : await TenderMark.create({ tenderId: id, ...patch });
  res.json({ mark: serializeMark(mark) });
});
