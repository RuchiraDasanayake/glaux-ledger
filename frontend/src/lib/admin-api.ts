import type { AdminTokenResponse } from "@/lib/types";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
const ADMIN_TOKEN_KEY = "glaux.admin.token";

export class AdminApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const adminTokenStore = {
  get: () => localStorage.getItem(ADMIN_TOKEN_KEY),
  set: (token: string) => localStorage.setItem(ADMIN_TOKEN_KEY, token),
  clear: () => localStorage.removeItem(ADMIN_TOKEN_KEY),
};

let onAdminUnauthorised: (() => void) | null = null;
export function setAdminUnauthorisedHandler(handler: () => void) {
  onAdminUnauthorised = handler;
}

interface AdminRequestOptions {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
}

async function adminRequest<T>(
  path: string,
  options: AdminRequestOptions = {},
): Promise<T> {
  const { method = "GET", body, signal } = options;
  const headers: Record<string, string> = {};

  const token = adminTokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  });

  if (response.status === 401) {
    onAdminUnauthorised?.();
    throw new AdminApiError(
      401,
      "Your admin session has expired. Please sign in again.",
    );
  }

  if (!response.ok) {
    throw new AdminApiError(response.status, await readError(response));
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

async function readError(response: Response): Promise<string> {
  try {
    const data = await response.json();
    const detail = data?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail) && detail.length > 0) {
      return detail.map((item) => item.msg ?? "Invalid value").join(". ");
    }
  } catch {
    /* ignore */
  }
  return `Something went wrong (${response.status}).`;
}

export const adminApi = {
  get: <T>(path: string, signal?: AbortSignal) =>
    adminRequest<T>(path, { signal }),
  post: <T>(path: string, body?: unknown) =>
    adminRequest<T>(path, { method: "POST", body }),
};

export async function adminLogin(
  email: string,
  password: string,
): Promise<AdminTokenResponse> {
  return adminRequest<AdminTokenResponse>("/admin/auth/login", {
    method: "POST",
    body: { email, password },
  });
}

export async function fetchAdminEvidence(id: string): Promise<Blob> {
  const token = adminTokenStore.get();
  const response = await fetch(
    `${BASE_URL}/admin/payment-submissions/${id}/evidence`,
    {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    },
  );

  if (response.status === 401) {
    onAdminUnauthorised?.();
    throw new AdminApiError(
      401,
      "Your admin session has expired. Please sign in again.",
    );
  }
  if (!response.ok) {
    throw new AdminApiError(response.status, await readError(response));
  }
  return response.blob();
}
