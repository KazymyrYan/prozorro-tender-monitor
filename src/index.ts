import { fetchFeedPage, offsetHoursAgo } from "./prozorro/client";

const page = await fetchFeedPage(offsetHoursAgo(24), 3);
console.log(page.data);
console.log("next offset:", page.next_page.offset);
