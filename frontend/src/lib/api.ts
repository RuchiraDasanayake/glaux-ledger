const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
const TOKEN_KEY = "glaux.token";

export class ApiError extends Error {
  // Assigned in the body rather than as a constructor parameter property, which
  // `erasableSyntaxOnly` disallows.
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

/** Set by the auth provider so an expired token drops the session everywhere at once. */
let onUnauthorised: (() => void) | null = null;
export function setUnauthorisedHandler(handler: () => void) {
  onUnauthorised = handler;
}

/**
 * Also the auth provider's. A trial can run out while a tab is open, and the cached
 * business still says "trialing", so the first refused write is what tells the app to
 * go and find out, rather than leaving the banner absent until the next reload.
 */
let onPaymentRequired: (() => void) | null = null;
export function setPaymentRequiredHandler(handler: () => void) {
  onPaymentRequired = handler;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  /** FormData for the voice and photo uploads, which must not be JSON-encoded. */
  formData?: FormData;
  signal?: AbortSignal;
}

async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = "GET", body, formData, signal } = options;
  const headers: Record<string, string> = {};

  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: formData ?? (body !== undefined ? JSON.stringify(body) : undefined),
    signal,
  });

  if (response.status === 401) {
    onUnauthorised?.();
    throw new ApiError(401, "Your session has expired. Please sign in again.");
  }

  if (!response.ok) {
    if (response.status === 402) onPaymentRequired?.();
    throw new ApiError(response.status, await readError(response));
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

async function readError(response: Response): Promise<string> {
  const detail = await readDetail(response);
  const wait = retryHint(response);
  return wait ? `${detail} ${wait}` : detail;
}

async function readDetail(response: Response): Promise<string> {
  try {
    const data = await response.json();
    const detail = data?.detail;
    if (typeof detail === "string") return detail;
    // FastAPI validation errors arrive as a list of field problems.
    if (Array.isArray(detail) && detail.length > 0) {
      return detail.map((item) => item.msg ?? "Invalid value").join(". ");
    }
  } catch {
    // Fall through to the generic message below.
  }
  return `Something went wrong (${response.status}).`;
}

/**
 * How long the refusal actually lasts, said in words.
 *
 * The server knows, down to the second, and puts it in Retry-After. Being told "try
 * again" with no number attached is what makes a rate limit read as the product being
 * broken: the wait may be twenty seconds or it may be an hour, and someone who cannot
 * tell the difference stops trying.
 *
 * Empty when there is no usable header, which is deliberate rather than a fallback: the
 * monthly voice and photo allowance answers 429 without one, and its own message already
 * explains that it resets on the 1st. A guessed "wait a moment" would contradict it.
 */
function retryHint(response: Response): string {
  if (response.status !== 429) return "";
  const seconds = Number(response.headers.get("Retry-After"));
  if (!Number.isFinite(seconds) || seconds <= 0) return "";

  if (seconds < 45) return `Try again in ${Math.ceil(seconds)} seconds.`;
  if (seconds < 90) return "Try again in a minute.";
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `Try again in ${minutes} minutes.`;
  // Rounded rather than rounded up, and hedged. The hour-long registration window hands
  // back 3601 seconds, and telling someone to come back in two hours when it is one hour
  // and one second is a worse lie than the vagueness this replaced.
  const hours = Math.round(minutes / 60);
  return hours === 1
    ? "Try again in about an hour."
    : `Try again in about ${hours} hours.`;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { signal }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body }),
  // `delete` is a reserved word, so the method is named for what it does instead.
  remove: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  upload: <T>(path: string, formData: FormData) =>
    request<T>(path, { method: "POST", formData }),
};

/** Blob rather than JSON, for the PDF export. */
export async function downloadFile(
  path: string,
  filename: string,
): Promise<void> {
  const token = tokenStore.get();
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (response.status === 401) {
    onUnauthorised?.();
    throw new ApiError(401, "Your session has expired. Please sign in again.");
  }
  if (!response.ok)
    throw new ApiError(response.status, await readError(response));

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
