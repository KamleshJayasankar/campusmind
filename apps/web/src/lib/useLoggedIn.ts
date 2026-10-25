"use client";

import { useSyncExternalStore } from "react";
import { getToken } from "./api";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

// True when a login token is stored in this browser. Always false while rendering on the server.
export function useLoggedIn() {
  return useSyncExternalStore(
    subscribe,
    () => getToken() !== null,
    () => false
  );
}
