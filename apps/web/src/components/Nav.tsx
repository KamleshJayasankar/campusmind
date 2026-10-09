"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clearToken, User } from "@/lib/api";

export default function Nav({ user }: { user: User }) {
  const pathname = usePathname();
  const router = useRouter();

  const link = (href: string, label: string) => (
    <Link
      href={href}
      className={`rounded-md px-3 py-1.5 text-sm font-medium ${
        pathname === href ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-100"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4">
      <div className="flex items-center gap-4">
        <span className="text-lg font-bold text-indigo-700">CampusMind</span>
        <nav className="flex gap-1">
          {link("/chat", "Chat")}
          {link("/documents", "Documents")}
        </nav>
      </div>
      <div className="flex items-center gap-3 text-sm text-slate-600">
        <span>
          {user.name} <span className="text-slate-400">({user.role})</span>
        </span>
        <button
          onClick={() => {
            clearToken();
            router.replace("/login");
          }}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-slate-100"
        >
          Log out
        </button>
      </div>
    </header>
  );
}
