import type { KeywordBlock } from "../config";
import { tenderUrl } from "../prozorro/client";

export interface ReportItem {
  description: string;
  quantity: string | null;
  unit: string | null;
}

export interface ReportTender {
  id: string;
  tenderNumber: string;
  title: string;
  procuringEntity: string;
  budgetAmount: string | null;
  currency: string | null;
  tenderPeriodEnd: Date | null;
  procurementMethodType: string;
  matchedWords: string[];
  items: ReportItem[];
}

export interface ReportMessage {
  text: string;
  ids: string[];
}

const LIMIT = 3800; // Telegram allows 4096, keep a margin
const MAX_ITEMS = 3;

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

function formatDeadline(date: Date | null): string {
  if (!date) return "не вказано";
  return date.toLocaleString("uk-UA", {
    timeZone: "Europe/Kyiv",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatItem(item: ReportItem): string {
  // numeric comes from the database as "4.000", Number() trims the zeros
  const quantity = item.quantity === null ? "" : ` — ${Number(item.quantity)}`;
  const unit = item.unit ? ` ${item.unit}` : "";
  return `• ${escapeHtml(cut(item.description.trim(), 90))}${quantity}${unit}`;
}

function formatTender(tender: ReportTender): string {
  const words = tender.matchedWords.map((word) => word.replace(/\*/g, ""));
  const extra = tender.items.length - MAX_ITEMS;

  const lines = [
    `<b>${escapeHtml(cut(tender.title.trim(), 200))}</b>`,
    `Замовник: ${escapeHtml(cut(tender.procuringEntity, 120))}`,
    `Бюджет: ${formatMoney(tender.budgetAmount, tender.currency)}`,
    `Подача до: ${formatDeadline(tender.tenderPeriodEnd)}`,
    `Вид: ${escapeHtml(tender.procurementMethodType)}`,
    ...(words.length > 0 ? [`Слова: ${escapeHtml(words.join(", "))}`] : []),
    ...tender.items.slice(0, MAX_ITEMS).map(formatItem),
    ...(extra > 0 ? [`… ще позицій: ${extra}`] : []),
    `<a href="${tenderUrl(tender.tenderNumber)}">${escapeHtml(tender.tenderNumber)}</a>`,
  ];
  return lines.join("\n");
}

/** Groups tenders by keyword block and cuts the digest into messages of a safe size. */
export function buildMessages(
  tenders: ReportTender[],
  blocks: KeywordBlock[],
): ReportMessage[] {
  const blockOf = new Map<string, string>();
  for (const block of blocks) {
    for (const keyword of block.keywords) blockOf.set(keyword, block.name);
  }

  // a tender goes under the block of its first matched keyword
  const groups = new Map<string, ReportTender[]>();
  for (const tender of tenders) {
    const name = blockOf.get(tender.matchedWords[0] ?? "") ?? "Інше";
    groups.set(name, [...(groups.get(name) ?? []), tender]);
  }

  const messages: ReportMessage[] = [];
  let parts: string[] = [`<b>Нові тендери: ${tenders.length}</b>`];
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

  for (const name of [...blocks.map((block) => block.name), "Інше"]) {
    const group = groups.get(name);
    if (!group) continue;

    const title = escapeHtml(name);
    let header: string | null = `🔹 <b>${title}</b> (${group.length})`;

    for (const tender of group) {
      const text = formatTender(tender);
      if (length + text.length + (header?.length ?? 0) > LIMIT) {
        flush();
        header = `🔹 <b>${title}</b> (далі)`;
      }
      if (header) {
        add(header);
        header = null;
      }
      add(text);
      ids.push(tender.id);
    }
  }
  flush();
  return messages;
}
