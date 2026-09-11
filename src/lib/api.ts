export type SessionUser = {
  id: string;
  username: string;
  normalized_username: string;
  display_name?: string | null;
  role: "user" | "admin";
  status: "active" | "suspended" | "disabled";
  banking_status: "active" | "frozen";
  must_change_password?: boolean;
};

export async function api<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (options.body && !(options.body instanceof FormData) && !headers.has("content-type")) headers.set("content-type", "application/json");
  const res = await fetch(`/api${path}`, { ...options, headers, credentials: "include" });
  let payload: any = null;
  try { payload = await res.json(); } catch { /* ignored */ }
  if (!res.ok || payload?.success === false) throw new Error(payload?.error?.message || payload?.message || `Request failed (${res.status})`);
  return (payload?.data ?? payload) as T;
}

export const post = <T = any>(path: string, body?: any) => api<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
export const patch = <T = any>(path: string, body?: any) => api<T>(path, { method: "PATCH", body: JSON.stringify(body ?? {}) });
export const del = <T = any>(path: string, body?: any) => api<T>(path, { method: "DELETE", body: body === undefined ? undefined : JSON.stringify(body) });
