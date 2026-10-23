import { sleep } from "../utils/sleep";
import { fetchFeedPage, type FeedItem } from "./client";

const PAGE_SIZE = 1000;
const PAUSE_MS = 200; // be gentle with the API between pages

// competitive procedures still accept proposals in these statuses
const OPEN_STATUSES = new Set(["active.enquiries", "active.tendering"]);

// procedures without a tender live for minutes, the supplier is already chosen,
// so we take them as soon as they are active or complete
const NO_TENDER_TYPES = new Set([
  "reporting",
  "negotiation",
  "negotiation.quick",
]);
const NO_TENDER_STATUSES = new Set(["active", "complete"]);

export const isNoTender = (type: string) => NO_TENDER_TYPES.has(type);

export interface SyncResult {
  items: FeedItem[];
  nextOffset: string;
  pages: number;
}

/**
 * Walks the feed from `startOffset` until it runs dry and returns
 * the tenders worth loading: open competitive ones and no-tender contracts.
 */
export async function fetchActiveSince(
  startOffset: string,
): Promise<SyncResult> {
  // a tender shows up once per change, so keep only the latest entry per id
  const latest = new Map<string, FeedItem>();
  let offset = startOffset;
  let pages = 0;

  while (true) {
    const page = await fetchFeedPage(offset, PAGE_SIZE);

    // keep it even for an empty page: it's where the next run should start
    offset = page.next_page.offset;

    if (page.data.length === 0) break;

    pages++;
    for (const item of page.data) {
      latest.set(item.id, item);
    }

    await sleep(PAUSE_MS);
  }

  const items = [...latest.values()].filter((item) =>
    isNoTender(item.procurementMethodType)
      ? NO_TENDER_STATUSES.has(item.status)
      : OPEN_STATUSES.has(item.status),
  );
  return { items, nextOffset: offset, pages };
}
