import type { KeywordBlock } from "../config";
import { tenderUrl } from "../prozorro/client";
import { isNoTender } from "../prozorro/sync";

export interface ReportItem {
  description: string;
  quantity: string | null;
  unit: string | null;
  cpvCode: string;
}

export interface ReportAward {
  supplierName: string;
  supplierEdrpou: string | null;
  amount: string | null;
  currency: string | null;
  status: string;
}

export interface ReportTender {
  id: string;
  tenderNumber: string;
  title: string;
  procuringEntity: string;
  budgetAmount: string | null;
  currency: string | null;
  publishedAt: Date | null;
  tenderPeriodEnd: Date | null;
  procurementMethodType: string;
  matchedWords: string[];
  // keywords found in the title, and indexes of the items where a keyword fired
  titleWords: string[];
  matchedItems: number[];
  // true when every matched keyword is on the weak list
  weak: boolean;
  items: ReportItem[];
  awards: ReportAward[];
}

export interface ReportMessage {
  text: string;
  ids: string[];
}

const LIMIT = 3800; // Telegram allows 4096, keep a margin
const MAX_ITEMS = 3;
const MAX_CPV = 3;
const NO_TENDER_TITLE = "Закупівлі без торгів";

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const cut = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

function formatMoney(amount: string | null, currency: string | null): string {
  if (amount === null) return "не вказано";
  const number = Number(amount).toLocaleString("uk-UA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${number} ${currency ?? ""}`.trim();
}

function formatDate(date: Date | null, empty: string): string {
  if (!date) return empty;
  return date.toLocaleString("uk-UA", {
    timeZone: "Europe/Kyiv",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatItem(item: ReportItem, hit: boolean): string {
  // numeric comes from the database as "4.000", Number() trims the zeros
  const quantity = item.quantity === null ? "" : ` — ${Number(item.quantity)}`;
  const unit = item.unit ? ` ${item.unit}` : "";
  const mark = hit ? "🎯" : "•";
  return `${mark} ${escapeHtml(cut(item.description.trim(), 90))}${quantity}${unit}`;
}

// items where a keyword fired go first, so the reason is visible even in a long list
function pickItems(tender: ReportTender): { item: ReportItem; hit: boolean }[] {
  const hits = new Set(tender.matchedItems);
  const all = tender.items.map((item, index) => ({
    item,
    hit: hits.has(index),
  }));
  return [...all.filter((x) => x.hit), ...all.filter((x) => !x.hit)].slice(
    0,
    MAX_ITEMS,
  );
}

function formatWords(tender: ReportTender): string[] {
  if (tender.matchedWords.length === 0) return [];
  const inTitle = new Set(tender.titleWords);
  const words = tender.matchedWords.map((word) =>
    inTitle.has(word) ? `${word} (в назві)` : word,
  );
  const mark = tender.weak ? " ⚪ слабке співпадіння" : "";
  return [`Слова: ${escapeHtml(words.join(", "))}${mark}`];
}

function formatCpv(items: ReportItem[]): string[] {
  const codes = [...new Set(items.map((item) => item.cpvCode))];
  if (codes.length === 0) return [];
  const more = codes.length > MAX_CPV ? "…" : "";
  return [`CPV: ${codes.slice(0, MAX_CPV).join(", ")}${more}`];
}

// lines shared by both card kinds: title and customer first, positions and link last
function cardHead(tender: ReportTender): string[] {
  return [
    `<b>${escapeHtml(cut(tender.title.trim(), 200))}</b>`,
    `Замовник: ${escapeHtml(cut(tender.procuringEntity, 120))}`,
  ];
}

function cardTail(tender: ReportTender): string[] {
  const extra = tender.items.length - MAX_ITEMS;
  return [
    ...formatCpv(tender.items),
    ...formatWords(tender),
    ...pickItems(tender).map(({ item, hit }) => formatItem(item, hit)),
    ...(extra > 0 ? [`… ще позицій: ${extra}`] : []),
    `<a href="${tenderUrl(tender.tenderNumber)}">${escapeHtml(tender.tenderNumber)}</a>`,
  ];
}

function formatTender(tender: ReportTender): string {
  return [
    ...cardHead(tender),
    `Бюджет: ${formatMoney(tender.budgetAmount, tender.currency)}`,
    `Опубліковано: ${formatDate(tender.publishedAt, "невідомо")}`,
    `Подача до: ${formatDate(tender.tenderPeriodEnd, "не вказано")}`,
    `Вид: ${escapeHtml(tender.procurementMethodType)}`,
    ...cardTail(tender),
  ].join("\n");
}

// the active award is the real winner, the others (if any) are shown as "+N"
const mainAward = (tender: ReportTender): ReportAward | undefined =>
  tender.awards.find((award) => award.status === "active") ?? tender.awards[0];

function formatSupplier(tender: ReportTender): string {
  const main = mainAward(tender);
  if (!main) return "невідомо";
  const name = escapeHtml(cut(main.supplierName || "невідомо", 120));
  const edrpou = main.supplierEdrpou
    ? ` (ЄДРПОУ ${escapeHtml(main.supplierEdrpou)})`
    : "";
  const more = tender.awards.length > 1 ? ` +${tender.awards.length - 1}` : "";
  return `${name}${edrpou}${more}`;
}

// no bidding here, so what matters is who got the contract and for how much
function formatNoTender(tender: ReportTender): string {
  const main = mainAward(tender);
  const sum =
    main?.amount != null
      ? formatMoney(main.amount, main.currency ?? tender.currency)
      : formatMoney(tender.budgetAmount, tender.currency);

  return [
    ...cardHead(tender),
    `Постачальник: ${formatSupplier(tender)}`,
    `Сума: ${sum}`,
    `Опубліковано: ${formatDate(tender.publishedAt, "невідомо")}`,
    `Вид: ${escapeHtml(tender.procurementMethodType)}`,
    ...cardTail(tender),
  ].join("\n");
}

interface Section {
  name: string;
  icon: string;
  tenders: ReportTender[];
  render: (tender: ReportTender) => string;
}

/** Groups tenders by keyword block, adds a no-tender section at the end and cuts the digest into messages of a safe size. */
export function buildMessages(
  tenders: ReportTender[],
  blocks: KeywordBlock[],
): ReportMessage[] {
  const blockOf = new Map<string, string>();
  for (const block of blocks) {
    for (const keyword of block.keywords) blockOf.set(keyword, block.name);
  }

  // weak matches go last, the sort keeps the original order inside each group
  const ordered = [
    ...tenders.filter((tender) => !tender.weak),
    ...tenders.filter((tender) => tender.weak),
  ];

  const competitive = ordered.filter(
    (tender) => !isNoTender(tender.procurementMethodType),
  );
  const noTender = ordered.filter((tender) =>
    isNoTender(tender.procurementMethodType),
  );

  // a tender goes under the block of its first matched keyword
  const groups = new Map<string, ReportTender[]>();
  for (const tender of competitive) {
    const name = blockOf.get(tender.matchedWords[0] ?? "") ?? "Інше";
    groups.set(name, [...(groups.get(name) ?? []), tender]);
  }

  const sections: Section[] = [...blocks.map((block) => block.name), "Інше"]
    .filter((name) => groups.has(name))
    .map((name) => ({
      name,
      icon: "🔹",
      tenders: groups.get(name) ?? [],
      render: formatTender,
    }));

  // one flat list at the end: there are few of them and the words are on each card
  if (noTender.length > 0) {
    sections.push({
      name: NO_TENDER_TITLE,
      icon: "🔸",
      tenders: noTender,
      render: formatNoTender,
    });
  }

  const summary =
    noTender.length > 0
      ? `Нові тендери: ${tenders.length} (без торгів: ${noTender.length})`
      : `Нові тендери: ${tenders.length}`;

  const messages: ReportMessage[] = [];
  let parts: string[] = [`<b>${summary}</b>`];
  let ids: string[] = [];
  let length = parts[0].length;

  const flush = () => {
    if (ids.length > 0) messages.push({ text: parts.join("\n\n"), ids });
    parts = [];
    ids = [];
    length = 0;
  };
  const add = (part: string) => {
    parts.push(part);
    length += part.length + 2;
  };

  for (const section of sections) {
    const title = escapeHtml(section.name);
    let header: string | null =
      `${section.icon} <b>${title}</b> (${section.tenders.length})`;
    // "далі" only makes sense once a card of this section is already out
    let started = false;

    for (const tender of section.tenders) {
      const text = section.render(tender);
      if (length + text.length + (header?.length ?? 0) > LIMIT) {
        flush();
        if (started) header = `${section.icon} <b>${title}</b> (далі)`;
      }
      if (header) {
        add(header);
        header = null;
      }
      add(text);
      ids.push(tender.id);
      started = true;
    }
  }
  flush();
  return messages;
}
