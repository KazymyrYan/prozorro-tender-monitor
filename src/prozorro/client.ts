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

/** Fetches full details of a single tender by its API id. */
export async function fetchTender(id: string): Promise<Tender> {
  const response = await fetch(`${BASE_URL}/${id}`);

  // fetch doesn't throw on 4xx/5xx, so check it by hand
  if (!response.ok) {
    throw new Error(
      `Prozorro API error for tender ${id}: ${response.status} ${response.statusText}`,
    );
  }

  // the tender itself is wrapped in `data`
  const body = (await response.json()) as { data: Tender };
  return body.data;
}

/** Public page of a tender; `tenderID` is the human-readable number like UA-2026-10-07-000171-a. */
export function tenderUrl(tenderID: string): string {
  return `https://prozorro.gov.ua/uk/tender/${tenderID}`;
}
