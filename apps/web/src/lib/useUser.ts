"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, clearToken, getToken, User } from "./api";

export function useUser() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    api<{ user: User }>("/auth/me")
      .then((res) => setUser(res.user))
      .catch(() => {
        clearToken();
        router.replace("/login");
      });
  }, [router]);

  return user;
}
