export interface FeedItem {
  id: string;
  dateModified: string;
  status: string;
}

export interface FeedPage {
  data: FeedItem[];
  next_page: { offset: string };
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
