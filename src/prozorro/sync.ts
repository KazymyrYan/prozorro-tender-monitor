import { fetchFeedPage, type FeedItem } from "./client";
import { sleep } from "../utils/sleep";

const PAGE_SIZE = 1000;
const PAUSE_MS = 200; // be gentle with the API between pages

// only these statuses still accept proposals
const ACTIVE_STATUSES = new Set(["active.enquiries", "active.tendering"]);
export interface SyncResult {
  items: FeedItem[];
  nextOffset: string;
  pages: number;
}

/**
 * Walks the feed from `startOffset` until it runs dry and returns
 * the tenders that are still open for proposals.
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
    ACTIVE_STATUSES.has(item.status),
  );
  return { items, nextOffset: offset, pages };
}