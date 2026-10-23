import { Op } from "sequelize";
import { config } from "./config";
import { initDb, ItemRow, sequelize, TenderRow } from "./db/models";
import {
  buildMessages,
  type ReportItem,
  type ReportTender,
} from "./report/format";
import { sendMessage } from "./telegram/send";
import { sleep } from "./utils/sleep";
import { getState, setState } from "./db/store";

// --dry prints the messages and changes nothing
const dryRun = process.argv.includes("--dry");
const now = new Date();

// --scheduled is for the cron: one report a day, not before 08:30 Kyiv time
const scheduled = process.argv.includes("--scheduled");
const REPORT_DATE_KEY = "last_report_date";
const kyivDate = now.toLocaleDateString("en-CA", { timeZone: "Europe/Kyiv" });
const kyivTime = now.toLocaleTimeString("en-GB", {
  timeZone: "Europe/Kyiv",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

await initDb();

if (
  scheduled &&
  (kyivTime < "08:30" || (await getState(REPORT_DATE_KEY)) === kyivDate)
) {
  console.log(`skip: ${kyivDate} ${kyivTime}, too early or already sent today`);
  await sequelize.close();
  process.exit(0);
}

if (!dryRun) {
  // bidding is over, such tenders are of no use in the digest
  await TenderRow.update(
    { notifiedAt: now },
    { where: { notifiedAt: null, tenderPeriodEnd: { [Op.lt]: now } } },
  );
}

const rows = await TenderRow.findAll({
  where: {
    notifiedAt: null,
    [Op.or]: [
      { tenderPeriodEnd: null },
      { tenderPeriodEnd: { [Op.gte]: now } },
    ],
  },
  order: [["firstSeenAt", "ASC"]],
});

const items =
  rows.length === 0
    ? []
    : await ItemRow.findAll({ where: { tenderId: rows.map((row) => row.id) } });

const itemsByTender = new Map<string, ReportItem[]>();
for (const item of items) {
  const list = itemsByTender.get(item.tenderId) ?? [];
  list.push({
    description: item.description,
    quantity: item.quantity,
    unit: item.unit,
    cpvCode: item.cpvCode,
  });
  itemsByTender.set(item.tenderId, list);
}

const tenders: ReportTender[] = rows.map((row) => ({
  id: row.id,
  tenderNumber: row.tenderNumber,
  title: row.title,
  procuringEntity: row.procuringEntity,
  budgetAmount: row.budgetAmount,
  currency: row.currency,
  tenderPeriodEnd: row.tenderPeriodEnd,
  publishedAt: row.publishedAt,
  procurementMethodType: row.procurementMethodType,
  matchedWords: row.matchedWords,
  items: itemsByTender.get(row.id) ?? [],
}));

const messages = buildMessages(tenders, config.blocks);

if (messages.length === 0) {
  console.log("no new tenders");
  // a short "nothing today" also tells that the whole chain is alive
  if (!dryRun) await sendMessage("Нових тендерів за ключовими словами немає.");
} else {
  for (const message of messages) {
    if (dryRun) {
      console.log(`${message.text}\n${"=".repeat(30)}`);
      continue;
    }
    await sendMessage(message.text);
    // mark right away: if a later message fails, these won't be sent twice
    await TenderRow.update(
      { notifiedAt: new Date() },
      { where: { id: message.ids } },
    );
    await sleep(1100); // Telegram allows about one message per second to a chat
  }
  console.log(
    `${dryRun ? "dry run: " : "sent: "}${messages.length} message(s), ${tenders.length} tender(s)`,
  );
}

if (scheduled && !dryRun) await setState(REPORT_DATE_KEY, kyivDate);

await sequelize.close();
