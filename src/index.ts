import { offsetHoursAgo } from "./prozorro/client";
import { fetchActiveSince } from "./prozorro/sync";

console.time("sync");
const result = await fetchActiveSince(offsetHoursAgo(2));
console.timeEnd("sync");

console.log("pages:", result.pages);
console.log("active tenders:", result.items.length);
console.log("first:", result.items.slice(0, 3));
console.log("next offset:", result.nextOffset);