/* Browser-side helpers: typed-ish fetch wrapper, toast events and file downloads. */
export async function api<T = any>(url: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const hasBody = opts.body !== undefined;
  const res = await fetch(url, {
    method: opts.method ?? (hasBody ? "POST" : "GET"),
    headers: hasBody ? { "content-type": "application/json" } : undefined,
    body: hasBody ? JSON.stringify(opts.body) : undefined,
    credentials: "same-origin",
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && typeof window !== "undefined" && !url.startsWith("/api/auth/") && !window.location.pathname.startsWith("/login")) {
    window.location.href = "/login";
  }
  if (!res.ok) throw Object.assign(new Error(data?.error || `Request failed (${res.status})`), { code: data?.code as string | undefined, status: res.status });
  return data as T;
}

export type ToastType = "success" | "error" | "info";

/** Shows a toast. When `type` is omitted it is inferred from the wording (used by legacy call sites). */
export function toast(message: string, type?: ToastType) {
  const inferred: ToastType = type ?? (/fail|error|cannot|not allowed|already|invalid|must|closed|full|forbidden|denied|required|unauthor/i.test(message) ? "error" : "success");
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("app-toast", { detail: { message, type: inferred } }));
}

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}

export async function downloadFile(url: string, fallbackName: string, body?: unknown) {
  const res = await fetch(url, {
    method: body !== undefined ? "POST" : "GET",
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Download failed");
  const cd = res.headers.get("content-disposition") ?? "";
  const name = /filename="([^"]+)"/.exec(cd)?.[1] ?? fallbackName;
  const blobUrl = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = name;
  a.click();
  URL.revokeObjectURL(blobUrl);
}

export const fmtDate = (d: string | number | Date | null | undefined) => (d ? new Date(d).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "-");

export const STATUS_STYLES: Record<string, string> = {
  Approved: "bg-emerald-950 text-emerald-300 border-emerald-800",
  Completed: "bg-purple-950 text-purple-300 border-purple-800",
  Ongoing: "bg-sky-950 text-sky-300 border-sky-800",
  "Pending Faculty Approval": "bg-amber-950 text-amber-300 border-amber-800",
  Pending: "bg-amber-950 text-amber-300 border-amber-800",
  Rejected: "bg-red-950 text-red-300 border-red-800",
  Cancelled: "bg-slate-800 text-slate-400 border-slate-700",
  Draft: "bg-slate-800 text-slate-300 border-slate-700",
  Attended: "bg-emerald-950 text-emerald-300 border-emerald-800",
  Absent: "bg-red-950 text-red-300 border-red-800",
  Registered: "bg-slate-800 text-slate-300 border-slate-700",
};
