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
    opt_fields: "status", //the list returns only id and dateModified by default, so status has to be requested explicitly
  });

  const response = await fetch(`${BASE_URL}?${params}`);

  if (!response.ok) {
    throw new Error(
      `Prozorro API error: ${response.status} ${response.statusText}`,
    );
  }

  return (await response.json()) as FeedPage;
}

export function offsetHoursAgo(hours: number): string {
  const seconds = Math.floor(Date.now() / 1000) - hours * 3600;
  return String(seconds);
}
