import { fetchTender, offsetHoursAgo, tenderUrl } from "./prozorro/client";
import { fetchActiveSince } from "./prozorro/sync";

const result = await fetchActiveSince(offsetHoursAgo(2));
console.log("active tenders:", result.items.length);

// details for the first three only: one request per tender
for (const item of result.items.slice(0, 3)) {
  const tender = await fetchTender(item.id);
  const value = tender.value;

  console.log("---");
  console.log(tender.tenderID, "|", tender.title.trim());
  console.log("customer:", tender.procuringEntity.name.trim());
  console.log("budget:", value ? `${value.amount} ${value.currency}` : "no budget");
  console.log("link:", tenderUrl(tender.tenderID));

  for (const position of tender.items ?? []) {
    const unit = position.unit?.name ?? "";
    console.log(`  - ${position.description}: ${position.quantity ?? "?"} ${unit}`);
  }
}