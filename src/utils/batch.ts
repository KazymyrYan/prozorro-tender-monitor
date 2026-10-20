import { sleep } from "./sleep";

/**
 * Runs `fn` over `items` in batches of `size`, one batch at a time.
 * Keeps the number of simultaneous requests bounded so the API isn't flooded.
 */
export async function mapInBatches<T, R>(
  items: T[],
  size: number,
  fn: (item: T) => Promise<R>,
  pauseMs = 0,
): Promise<R[]> {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += size) {
    const batch = items.slice(i, i + size);
    // the whole batch goes out at once, the next one waits for it
    results.push(...(await Promise.all(batch.map(fn))));
    if (pauseMs > 0) await sleep(pauseMs);
  }

  return results;
}
