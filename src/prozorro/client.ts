import { sleep } from "../utils/sleep";

export interface FeedItem {
  id: string;
  dateModified: string;
  status: string;
}

export interface FeedPage {
  data: FeedItem[];
  next_page: { offset: string };
}

export interface TenderItem {
  description: string;
  quantity?: number;
  unit?: { name: string };
  classification: { id: string };
}

export interface Tender {
  id: string;
  tenderID: string;
  status: string;
  title: string;
  procurementMethodType: string;
  procuringEntity: { name: string };
  value?: { amount: number; currency: string };
  tenderPeriod?: { endDate: string };
  items?: TenderItem[];
}

const BASE_URL = "https://public-api.prozorro.gov.ua/api/2.5/tenders";

/**
 * Fetches one page of the Prozorro tender feed.
 * Pass `next_page.offset` from the previous response to continue where it stopped.
 */
export async function fetchFeedPage(
  offset: string,
  limit = 100,
): Promise<FeedPage> {
  const params = new URLSearchParams({
    limit: String(limit),
    offset,
    opt_fields: "status", // the list only has id and dateModified unless we ask for more
  });

  const response = await fetch(`${BASE_URL}?${params}`);

  // fetch doesn't throw on 4xx/5xx, so check it by hand
  if (!response.ok) {
    throw new Error(
      `Prozorro API error: ${response.status} ${response.statusText}`,
    );
  }

  return (await response.json()) as FeedPage;
}

/** Unix time in seconds for "N hours ago", works as a feed offset. */
export function offsetHoursAgo(hours: number): string {
  const seconds = Math.floor(Date.now() / 1000) - hours * 3600;
  return String(seconds);
}

const MAX_ATTEMPTS = 5;

/** Fetches full details of a single tender by its API id. */
export async function fetchTender(id: string): Promise<Tender> {
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(`${BASE_URL}/${id}`);

    if (response.ok) {
      // the tender itself is wrapped in `data`
      const body = (await response.json()) as { data: Tender };
      return body.data;
    }

    // 429 means "slow down": wait and retry, any other status is a real error
    if (response.status === 429 && attempt < MAX_ATTEMPTS) {
      const retryAfter = Number(response.headers.get("Retry-After"));
      // use the server's hint if there is one, otherwise 1s, 2s, 4s...
      const waitMs = retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** (attempt - 1);
      await sleep(waitMs);
      continue;
    }

    throw new Error(
      `Prozorro API error for tender ${id}: ${response.status} ${response.statusText}`,
    );
  }
}

/** Public page of a tender; `tenderID` is the human-readable number like UA-2026-10-07-000171-a. */
export function tenderUrl(tenderID: string): string {
  return `https://prozorro.gov.ua/uk/tender/${tenderID}`;
}
