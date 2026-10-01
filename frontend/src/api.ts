export class ApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch("/api" + path, {
    method,
    cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(110000),
  });
  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ detail: "Service is unavailable." }));
    throw new ApiError(
      typeof error.detail === "string"
        ? error.detail
        : JSON.stringify(error.detail),
      error.code || "service_unavailable",
      response.status,
    );
  }
  return response.json();
}
export const fmt = (n: number | null | undefined, d = 2) =>
  n == null
    ? "Unavailable"
    : n.toLocaleString("en-US", {
        maximumFractionDigits: d,
        minimumFractionDigits: d,
      });
export const pct = (n: number | null | undefined) =>
  n == null ? "—" : `${n > 0 ? "+" : ""}${fmt(n)}%`;
export const basis = (s: string) => s.replaceAll("_", " ");
