"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError, Department, setToken } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [departments, setDepartments] = useState<Department[]>([]);
  const [departmentSlug, setDepartmentSlug] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api<{ departments: Department[] }>("/departments")
      .then((res) => {
        setDepartments(res.departments);
        if (res.departments[0]) setDepartmentSlug(res.departments[0].slug);
      })
      .catch(() => {});
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const body =
        mode === "login"
          ? { email, password }
          : { name, email, password, departmentSlug };
      const res = await api<{ token: string }>(`/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setToken(res.token);
      router.push("/chat");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reach the server");
    } finally {
      setLoading(false);
    }
  }

  const field =
    "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500";

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4 text-slate-900">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-indigo-700">CampusMind</h1>
          <p className="text-sm text-slate-500">Ask questions about your college documents.</p>
        </div>

        {mode === "register" && (
          <input className={field} placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} required />
        )}
        <input className={field} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className={field} type="password" placeholder="Password (min 8 characters)" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {mode === "register" && (
          <select className={field} value={departmentSlug} onChange={(e) => setDepartmentSlug(e.target.value)} required>
            {departments.map((d) => (
              <option key={d.id} value={d.slug}>{d.name}</option>
            ))}
          </select>
        )}

        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-indigo-600 px-3 py-2 font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {loading ? "Please wait..." : mode === "login" ? "Log in" : "Create account"}
        </button>

        <button
          type="button"
          onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}
          className="w-full text-sm text-indigo-700 hover:underline"
        >
          {mode === "login" ? "New here? Create an account" : "Already have an account? Log in"}
        </button>
      </form>
    </main>
  );
}
