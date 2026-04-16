import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { apiRequest } from "@/lib/query-client";
import * as SecureStorage from "@/lib/secure-storage";
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

const getStored = (key: string) => SecureStorage.getItem(key);
const setStored = (key: string, value: string) => SecureStorage.setItem(key, value);

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
