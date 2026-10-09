const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export type Role = "student" | "faculty" | "admin";

export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  department_id: string | null;
};

export type Source = {
  index: number;
  documentId: string;
  title: string;
  page: number | null;
  score: number;
  snippet: string;
};

export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources: Source[];
};

export type ChatSummary = { id: string; title: string | null };

export type DocumentItem = {
  id: string;
  title: string;
  filename: string;
  visibility: "department" | "college";
  status: "uploaded" | "processing" | "ready" | "failed";
  error_message: string | null;
  page_count: number | null;
  created_at: string;
};

export type Department = { id: string; name: string; slug: string };

export const getToken = () =>
  typeof window === "undefined" ? null : window.localStorage.getItem("token");
export const setToken = (token: string) => window.localStorage.setItem("token", token);
export const clearToken = () => window.localStorage.removeItem("token");

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message =
      typeof data.error === "string"
        ? data.error
        : data.error
          ? Object.values(data.error).flat().join(", ")
          : "Request failed";
    throw new ApiError(res.status, message);
  }
  return data as T;
}
