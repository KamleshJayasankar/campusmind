"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError, Department, setToken } from "@/lib/api";

export default function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [departments, setDepartments] = useState<Department[]>([]);
  const [departmentSlug, setDepartmentSlug] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (mode !== "register") return;
    let cancelled = false;
    api<{ departments: Department[] }>("/departments")
      .then((res) => {
        if (cancelled) return;
        setDepartments(res.departments);
        setDepartmentSlug(res.departments[0]?.slug ?? "");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [mode]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const body =
        mode === "login" ? { email, password } : { name, email, password, departmentSlug };
      const res = await api<{ token: string }>(`/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setToken(res.token);
      router.push("/chat");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reach the server. It may be waking up, so try again in a minute.");
    } finally {
      setLoading(false);
    }
  }

  const field =
    "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500";
  const isLogin = mode === "login";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-4 text-slate-900">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-4 inline-block text-sm text-slate-500 hover:text-indigo-700">
          ← Back to home
        </Link>
        <form onSubmit={submit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <h1 className="text-2xl font-bold text-indigo-700">CampusMind</h1>
            <p className="text-sm text-slate-500">
              {isLogin ? "Welcome back. Log in to continue." : "Create your free account in under a minute."}
            </p>
          </div>

          {!isLogin && (
            <input className={field} placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} required />
          )}
          <input className={field} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input
            className={field}
            type="password"
            placeholder={isLogin ? "Password" : "Password (min 8 characters)"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {!isLogin && (
            <select className={field} value={departmentSlug} onChange={(e) => setDepartmentSlug(e.target.value)} required>
              {departments.map((d) => (
                <option key={d.id} value={d.slug}>
                  {d.name}
                </option>
              ))}
            </select>
          )}

          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-indigo-600 px-3 py-2 font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {loading ? "Please wait..." : isLogin ? "Log in" : "Create account"}
          </button>

          <p className="text-center text-sm text-slate-600">
            {isLogin ? (
              <>
                New here?{" "}
                <Link href="/signup" className="font-medium text-indigo-700 hover:underline">
                  Sign up free
                </Link>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <Link href="/login" className="font-medium text-indigo-700 hover:underline">
                  Log in
                </Link>
              </>
            )}
          </p>
        </form>
      </div>
    </main>
  );
}
