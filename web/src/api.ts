export class ApiError extends Error {
  status: number;

  constructor(status: number, code: string) {
    super(code);
    this.status = status;
  }
}

interface Options {
  method?: string;
  body?: unknown;
}

/** JSON request to our API; throws ApiError on any non-2xx answer. */
export async function api<T>(path: string, options: Options = {}): Promise<T> {
  const response = await fetch(path, {
    method: options.method ?? "GET",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, data?.error ?? "error");
  return data as T;
}
