import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { apiRequest } from "@/lib/query-client";
import type { InsightCard } from "@/lib/api";

const SEEN_KEY = "cru_insights_seen_hash";

interface CruInsightsContextType {
  hasNewInsight: boolean;
  markSeen: () => void;
}

const CruInsightsContext = createContext<CruInsightsContextType>({
  hasNewInsight: false,
  markSeen: () => {},
});

async function getStored(key: string): Promise<string | null> {
  try {
    if (Platform.OS === "web") return localStorage.getItem(key);
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function setStored(key: string, value: string): Promise<void> {
  try {
    if (Platform.OS === "web") localStorage.setItem(key, value);
    else await SecureStore.setItemAsync(key, value);
  } catch {}
}

function hashInsights(cards: InsightCard[]): string {
  return cards.map((c) => `${c.type}:${c.wines.length}`).join("|");
}

export function CruInsightsProvider({ children }: { children: React.ReactNode }) {
  const [hasNewInsight, setHasNewInsight] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiRequest("GET", "/api/insights");
        const cards: InsightCard[] = await res.json();
        if (cards.length === 0) return;

        const hash = hashInsights(cards);
        const seenHash = await getStored(SEEN_KEY);
        if (hash !== seenHash) {
          setHasNewInsight(true);
        }
      } catch {}
    })();
  }, []);

  const markSeen = useCallback(async () => {
    setHasNewInsight(false);
    try {
      const res = await apiRequest("GET", "/api/insights");
      const cards: InsightCard[] = await res.json();
      const hash = hashInsights(cards);
      await setStored(SEEN_KEY, hash);
    } catch {}
  }, []);

  return (
    <CruInsightsContext.Provider value={{ hasNewInsight, markSeen }}>
      {children}
    </CruInsightsContext.Provider>
  );
}

export function useCruInsights() {
  return useContext(CruInsightsContext);
}
