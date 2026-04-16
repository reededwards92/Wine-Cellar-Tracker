import React, { type PropsWithChildren } from "react";
import { Platform } from "react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { queryClient } from "@/lib/query-client";

/**
 * Wraps the query client so that cached data survives a reload.
 *
 * - On web: backed by AsyncStorage, which React Native Web proxies to
 *   localStorage. Combined with the service worker's API cache, this means
 *   the app shell can render stale data immediately while the network
 *   request is in flight — critical for a PWA that may open offline.
 * - On native: same persister, backed by real AsyncStorage. Previously the
 *   app used a plain QueryClientProvider; persistence is a strict upgrade.
 */
const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: "VIN_QUERY_CACHE",
  throttleTime: 1000,
});

// How long a cached entry can survive between sessions.
const MAX_AGE = 1000 * 60 * 60 * 24 * 7; // 7 days

// Bust the persisted cache whenever the app/auth-shape changes.
const BUSTER = "vin-v1";

export function QueryPersistProvider({ children }: PropsWithChildren) {
  // If either persister dep is unavailable (very old native runtime), fall
  // back to the plain provider so the app still boots.
  if (!AsyncStorage || typeof AsyncStorage.getItem !== "function") {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: MAX_AGE,
        buster: BUSTER,
        // Don't persist auth/me — it should always be re-validated.
        dehydrateOptions: {
          shouldDehydrateQuery: (query) => {
            const key = String(query.queryKey[0] ?? "");
            if (key.includes("/api/auth/me")) return false;
            return query.state.status === "success";
          },
        },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}

// Silence an unused-var warning in builds where Platform isn't referenced
// (kept here because future refactors may want per-platform branching).
void Platform;
