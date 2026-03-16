import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import pool from "./db";
import multer from "multer";
import { parse } from "csv-parse/sync";
import iconv from "iconv-lite";
import Anthropic from "@anthropic-ai/sdk";
import ExcelJS from "exceljs";
import { CELLAR_TOOLS, executeTool, getUserMemories } from "./ai-tools";
import { requireAuth, type AuthRequest } from "./auth";

const anthropicClient = new Anthropic({
  apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || "",
  baseURL: (process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL || "https://api.anthropic.com").replace("localhost", "127.0.0.1"),
});

async function callAnthropic(params: {
  model: string;
  max_tokens: number;
  system?: string;
  tools?: Anthropic.Tool[];
  messages: Anthropic.MessageParam[];
}): Promise<Anthropic.Message> {
  return anthropicClient.messages.create(params as any) as Promise<Anthropic.Message>;
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Per-user rate limiter for AI endpoints
const aiRateBuckets = new Map<number, { count: number; resetAt: number }>();
const AI_RATE_WINDOW_MS = 60 * 1000; // 1 minute
const AI_RATE_MAX = 20; // max AI calls per user per minute

const CRU_RATE_LIMIT_MESSAGES = [
  "Cru overindulged and is sleeping it off at the moment. Try again in a minute!",
  "Cru is exhausted and taking a quick nap. Back shortly!",
  "Cru uncorked one too many and needs a moment to recover.",
  "Cru stepped into the wine cellar for a breather. Try again shortly!",
  "Cru is decanting... which is to say, resting. Give it a minute!",
];

function getCruRateLimitMessage(): string {
  return CRU_RATE_LIMIT_MESSAGES[Math.floor(Math.random() * CRU_RATE_LIMIT_MESSAGES.length)];
}

function checkAiRateLimit(userId: number): boolean {
  const now = Date.now();
  const bucket = aiRateBuckets.get(userId);
  if (!bucket || now >= bucket.resetAt) {
    aiRateBuckets.set(userId, { count: 1, resetAt: now + AI_RATE_WINDOW_MS });
    return true;
  }
  if (bucket.count >= AI_RATE_MAX) return false;
  bucket.count++;
  return true;
}

// Clean up stale buckets every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of aiRateBuckets) {
    if (now >= bucket.resetAt) aiRateBuckets.delete(key);
  }
}, 5 * 60 * 1000);

function cleanValue(val: string | undefined | null): string | null {
  if (!val || val.trim() === "" || val.trim().toLowerCase() === "unknown") return null;
  return val.trim();
}

function parseDate(dateStr: string | undefined | null): string | null {
  if (!dateStr || dateStr.trim() === "") return null;
  const parts = dateStr.trim().split("/");
  if (parts.length === 3) {
    const [month, day, year] = parts;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  return dateStr.trim();
}

function parseNumber(val: string | undefined | null): number | null {
  if (!val || val.trim() === "") return null;
  const num = parseFloat(val.trim());
  return isNaN(num) ? null : num;
}

function parseInteger(val: string | undefined | null): number | null {
  if (!val || val.trim() === "") return null;
  const num = parseInt(val.trim(), 10);
  return isNaN(num) ? null : num;
}

function parseDrinkWindowYear(val: string | undefined | null): number | null {
  const num = parseInteger(val);
  if (num === null) return null;
  const currentYear = new Date().getFullYear();
  // Treat obviously invalid years (like 9999 or 0) as null
  if (num > currentYear + 50 || num < 1900) return null;
  return num;
}

export async function registerRoutes(app: Express): Promise<Server> {

  app.get("/api/stats", requireAuth, async (req: AuthRequest, res: Response) => {
    const userId = req.userId;
    const result = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM bottles WHERE status = 'in_cellar' AND user_id = $1) as total_bottles,
        (SELECT COALESCE(SUM(estimated_value), 0) FROM bottles WHERE status = 'in_cellar' AND user_id = $1) as total_value,
        (SELECT COUNT(DISTINCT wine_id) FROM bottles WHERE status = 'in_cellar' AND user_id = $1) as unique_wines,
        (SELECT COUNT(*) FROM bottles WHERE status = 'consumed' AND user_id = $1) as consumed_bottles
    `, [userId]);
    const stats = result.rows[0];
    res.json({
      total_bottles: Number(stats.total_bottles),
      total_value: Number(stats.total_value),
      unique_wines: Number(stats.unique_wines),
      consumed_bottles: Number(stats.consumed_bottles),
    });
  });

  app.get("/api/insights", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.userId;
      const currentYear = new Date().getFullYear();
      const cards: any[] = [];

      // Daily date string for deterministic ordering (changes each day)
      const today = new Date();
      const dateStr = today.toISOString().slice(0, 10); // YYYY-MM-DD
      // Daily pick count: 1–3, rotates by day-of-year
      const dayOfYear = Math.floor((today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / 86400000);
      const dailyLimit = (dayOfYear % 3) + 1; // cycles 1, 2, 3, 1, 2, 3 ...

      // ready_to_drink: daily random selection using md5(id || date) for stable daily ordering
      const readyResult = await pool.query(`
        SELECT w.id, w.producer, w.wine_name, w.vintage, w.color,
               COUNT(b.id)::int as bottle_count
        FROM wines w
        JOIN bottles b ON b.wine_id = w.id AND b.status = 'in_cellar' AND b.user_id = $1
        WHERE w.user_id = $1
          AND w.drink_window_start IS NOT NULL AND w.drink_window_start <= $2
          AND w.drink_window_end IS NOT NULL AND w.drink_window_end >= $2
        GROUP BY w.id
        ORDER BY md5(w.id::text || $3)
        LIMIT $4
      `, [userId, currentYear, dateStr, dailyLimit]);

      if (readyResult.rows.length > 0) {
        const count = readyResult.rows.length;
        const wineIds = readyResult.rows.map((r: any) => r.id);
        cards.push({
          type: 'ready_to_drink',
          title: 'In Their Window',
          subtitle: `${count} wine${count > 1 ? 's' : ''} at peak drinking right now`,
          wines: readyResult.rows.map((r: any) => ({
            id: r.id, producer: r.producer, wine_name: r.wine_name,
            vintage: r.vintage, color: r.color,
          })),
          cta_label: 'View Wines',
          cta_filter: { wineIds },
        });
      }

      // drink_soon: daily random selection (offset date string so picks differ from ready_to_drink)
      const soonResult = await pool.query(`
        SELECT w.id, w.producer, w.wine_name, w.vintage, w.color,
               COUNT(b.id)::int as bottle_count
        FROM wines w
        JOIN bottles b ON b.wine_id = w.id AND b.status = 'in_cellar' AND b.user_id = $1
        WHERE w.user_id = $1
          AND w.drink_window_start IS NOT NULL
          AND w.drink_window_start > $2
          AND w.drink_window_start <= $3
        GROUP BY w.id
        ORDER BY md5(w.id::text || $4 || 'soon')
        LIMIT $5
      `, [userId, currentYear, currentYear + 2, dateStr, dailyLimit]);

      if (soonResult.rows.length > 0) {
        const count = soonResult.rows.length;
        const wineIds = soonResult.rows.map((r: any) => r.id);
        cards.push({
          type: 'drink_soon',
          title: 'Opening Soon',
          subtitle: `${count} wine${count > 1 ? 's' : ''} entering their window soon`,
          wines: soonResult.rows.map((r: any) => ({
            id: r.id, producer: r.producer, wine_name: r.wine_name,
            vintage: r.vintage, color: r.color,
          })),
          cta_label: 'View Wines',
          cta_filter: { wineIds },
        });
      }

      res.json(cards);
    } catch (error: any) {
      console.error("Insights error:", error);
      res.status(500).json({ error: "Failed to fetch insights" });
    }
  });

  // In-memory cache for wine insights (avoid calling Claude on every page view)
  const wineInsightCache = new Map<string, { text: string; ts: number }>();
  const INSIGHT_TTL = 60 * 60 * 1000; // 1 hour

  app.get("/api/wines/:id/insight", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.userId;
      const wineId = parseInt(req.params.id as string, 10);
      const cacheKey = `${userId}:${wineId}`;

      const cached = wineInsightCache.get(cacheKey);
      if (cached && Date.now() - cached.ts < INSIGHT_TTL) {
        return res.json({ insight: cached.text });
      }

      // Rate limit only on cache miss (actual AI call)
      if (!checkAiRateLimit(userId!)) {
        return res.status(429).json({ error: getCruRateLimitMessage() });
      }

      // Fetch wine details
      const wineResult = await pool.query(
        `SELECT w.*, COUNT(b.id) FILTER (WHERE b.status = 'in_cellar') as bottle_count
         FROM wines w LEFT JOIN bottles b ON b.wine_id = w.id AND b.user_id = $1
         WHERE w.id = $2 AND w.user_id = $1 GROUP BY w.id`,
        [userId, wineId]
      );
      if (wineResult.rows.length === 0) {
        return res.status(404).json({ error: "Wine not found" });
      }
      const wine = wineResult.rows[0];

      // Fetch last 5 consumption entries for this wine
      const historyResult = await pool.query(
        `SELECT consumed_date, occasion, rating, tasting_notes
         FROM consumption_log WHERE wine_id = $1 AND user_id = $2
         ORDER BY consumed_date DESC LIMIT 5`,
        [wineId, userId]
      );

      // Fetch user memories
      const memoriesResult = await pool.query(
        `SELECT content FROM cru_memories WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 10`,
        [userId]
      );

      const currentYear = new Date().getFullYear();
      const prompt = `You are Cru, a sommelier. Given this wine and user data, write ONE brief insight (2-3 sentences max). Include what tasting notes the user should expect from this wine (e.g., aromas, flavors, texture). You can also touch on drinking window status or personal history if relevant. Be warm, specific, and actionable.

Wine: ${wine.producer} ${wine.wine_name} ${wine.vintage || "NV"}, ${wine.color}, ${wine.region || wine.country || ""}. Drink window: ${wine.drink_window_start || "?"}-${wine.drink_window_end || "?"}. Current year: ${currentYear}. Bottles in cellar: ${wine.bottle_count}.
${wine.ct_community_score ? `Community score: ${wine.ct_community_score}` : ""}

Consumption history: ${historyResult.rows.length > 0 ? historyResult.rows.map((h: any) => `${h.consumed_date}${h.rating ? ` (rated ${h.rating}/5)` : ""}${h.occasion ? ` - ${h.occasion}` : ""}`).join("; ") : "No history with this wine yet."}

User preferences: ${memoriesResult.rows.length > 0 ? memoriesResult.rows.map((m: any) => m.content).join(". ") : "No preferences recorded yet."}`;

      const response = await callAnthropic({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 200,
        messages: [{ role: "user", content: prompt }],
      });

      const insightText = response.content
        .filter((b: any) => b.type === "text")
        .map((b: any) => b.text)
        .join("");

      wineInsightCache.set(cacheKey, { text: insightText, ts: Date.now() });
      res.json({ insight: insightText });
    } catch (error: any) {
      console.error("Wine insight error:", error);
      res.status(500).json({ error: "Failed to generate insight" });
    }
  });

  app.post("/api/scan/context", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.userId;
      const { producer, wine_name, region, country } = req.body;
      const comments: string[] = [];

      if (producer) {
        const existing = await pool.query(
          `SELECT COUNT(DISTINCT w.id) as wine_count, COUNT(b.id) as bottle_count
           FROM wines w JOIN bottles b ON b.wine_id = w.id AND b.status = 'in_cellar' AND b.user_id = $1
           WHERE w.user_id = $1 AND LOWER(w.producer) = LOWER($2)`,
          [userId, producer]
        );
        const { wine_count, bottle_count } = existing.rows[0];
        if (parseInt(bottle_count) > 0) {
          comments.push(`You already have ${bottle_count} bottle${parseInt(bottle_count) > 1 ? "s" : ""} from ${producer}.`);
        }
      }

      const regionName = region || country;
      if (regionName) {
        const regionResult = await pool.query(
          `SELECT COUNT(DISTINCT w.id) as count FROM wines w
           JOIN bottles b ON b.wine_id = w.id AND b.status = 'in_cellar' AND b.user_id = $1
           WHERE w.user_id = $1 AND (LOWER(w.region) = LOWER($2) OR LOWER(w.country) = LOWER($2))`,
          [userId, regionName]
        );
        const regionCount = parseInt(regionResult.rows[0].count);
        if (regionCount < 2 && regionCount >= 0) {
          comments.push(`This fills a gap in your ${regionName} collection.`);
        }
      }

      res.json({ comment: comments.length > 0 ? comments.join(" ") : null });
    } catch (error: any) {
      console.error("Scan context error:", error);
      res.json({ comment: null });
    }
  });

  // Push notifications
  app.post("/api/auth/push-token", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const { token } = req.body;
      if (!token) return res.status(400).json({ error: "Token required" });
      await pool.query("UPDATE users SET push_token = $1 WHERE id = $2", [token, req.userId]);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Push token error:", error);
      res.status(500).json({ error: "Failed to save push token" });
    }
  });

  app.get("/api/notifications/preferences", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      // Create default row if doesn't exist
      await pool.query(
        "INSERT INTO notification_preferences (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING",
        [req.userId]
      );
      const result = await pool.query(
        "SELECT drink_window_alerts, weekly_digest, daily_max FROM notification_preferences WHERE user_id = $1",
        [req.userId]
      );
      res.json(result.rows[0]);
    } catch (error: any) {
      console.error("Notification prefs error:", error);
      res.status(500).json({ error: "Failed to fetch preferences" });
    }
  });

  app.patch("/api/notifications/preferences", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const { drink_window_alerts, weekly_digest, daily_max } = req.body;
      await pool.query(
        "INSERT INTO notification_preferences (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING",
        [req.userId]
      );
      const updates: string[] = [];
      const params: any[] = [];
      let idx = 1;
      if (drink_window_alerts !== undefined) { updates.push(`drink_window_alerts = $${idx++}`); params.push(drink_window_alerts); }
      if (weekly_digest !== undefined) { updates.push(`weekly_digest = $${idx++}`); params.push(weekly_digest); }
      if (daily_max !== undefined) { updates.push(`daily_max = $${idx++}`); params.push(daily_max); }
      if (updates.length === 0) return res.json({ success: true });
      updates.push(`updated_at = NOW()`);
      params.push(req.userId);
      await pool.query(
        `UPDATE notification_preferences SET ${updates.join(", ")} WHERE user_id = $${idx}`,
        params
      );
      res.json({ success: true });
    } catch (error: any) {
      console.error("Update notification prefs error:", error);
      res.status(500).json({ error: "Failed to update preferences" });
    }
  });

  app.get("/api/memories", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const result = await pool.query(
        "SELECT id, content, category, created_at FROM cru_memories WHERE user_id = $1 ORDER BY created_at DESC",
        [req.userId]
      );
      res.json(result.rows);
    } catch (error: any) {
      console.error("Memories error:", error);
      res.status(500).json({ error: "Failed to fetch memories" });
    }
  });

  app.delete("/api/memories/:id", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const result = await pool.query(
        "DELETE FROM cru_memories WHERE id = $1 AND user_id = $2 RETURNING id",
        [parseInt(req.params.id as string, 10), req.userId]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Memory not found" });
      }
      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete memory error:", error);
      res.status(500).json({ error: "Failed to delete memory" });
    }
  });

  app.post("/api/wines/fuzzy-match", requireAuth, async (req: AuthRequest, res: Response) => {
    const userId = req.userId;
    const { producer, wine_name, vineyard } = req.body;
    if (!producer && !wine_name) {
      return res.json([]);
    }

    // Tokenize scanned fields into meaningful words (3+ chars, lowercased)
    const tokenize = (s: string) =>
      (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
        .split(/[\s,\-''.·]+/).filter(w => w.length >= 3);

    const producerTokens = tokenize(producer || "");
    const nameTokens = tokenize(wine_name || "");
    const vineyardTokens = tokenize(vineyard || "");
    const identityTokens = [...producerTokens, ...nameTokens, ...vineyardTokens];

    if (identityTokens.length === 0) {
      return res.json([]);
    }

    // Fetch all in-cellar wines for this user (with bottle counts)
    const result = await pool.query(`
      SELECT w.id, w.producer, w.wine_name, w.vintage, w.color, w.region, w.varietal,
        w.vineyard, w.appellation, w.designation,
        ROUND(w.ct_community_score) as score,
        COUNT(CASE WHEN b.status = 'in_cellar' THEN 1 END) as bottle_count
      FROM wines w
      JOIN bottles b ON w.id = b.wine_id AND b.user_id = w.user_id
      WHERE w.user_id = $1
      GROUP BY w.id
      HAVING COUNT(CASE WHEN b.status = 'in_cellar' THEN 1 END) > 0
    `, [userId]);

    // Score each wine by word overlap with producer/name/vineyard fields
    const scored = result.rows.map((w: any) => {
      const wProducer = tokenize(w.producer || "");
      const wName = tokenize(w.wine_name || "");
      const wVineyard = tokenize(w.vineyard || "");
      const wAll = [...wProducer, ...wName, ...wVineyard];

      // Count how many identity tokens match any wine field token
      let matchCount = 0;
      let hasProducerOrNameMatch = false;
      for (const token of identityTokens) {
        if (wAll.some(wt => wt.includes(token) || token.includes(wt))) {
          matchCount++;
          if (wProducer.some(wt => wt.includes(token) || token.includes(wt)) ||
              wName.some(wt => wt.includes(token) || token.includes(wt))) {
            hasProducerOrNameMatch = true;
          }
        }
      }

      // Require at least one match on producer, name, or vineyard (not just region/varietal)
      const score = hasProducerOrNameMatch ? matchCount / Math.max(identityTokens.length, 1) : 0;
      return { ...w, score };
    });

    const matches = scored
      .filter((w: any) => w.score >= 0.3)
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, 3)
      .map(({ score, ...w }: any) => w);

    res.json(matches);
  });

  app.get("/api/cru/home", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.userId;
      const currentYear = new Date().getFullYear();

      // Tonight's pick — seasonal + daily rotation from in-window wines
      const now = new Date();
      const month = now.getMonth(); // 0-11
      // Seasonal preference: warm months favor lighter wines, cool months favor bolder
      const warmSeason = month >= 4 && month <= 9; // May–Oct
      const seasonalColors = warmSeason
        ? "'White','Rosé','Sparkling','Dessert'"
        : "'Red','Fortified','Dessert'";

      const pickResult = await pool.query(`
        SELECT w.id as wine_id, w.producer, w.wine_name, w.vintage, w.color, w.region, w.varietal,
          ROUND(w.ct_community_score) as score, COUNT(b.id) as bottle_count,
          AVG(b.estimated_value) as avg_value,
          CASE WHEN w.color IN (${seasonalColors}) THEN 1 ELSE 0 END as seasonal_match
        FROM wines w JOIN bottles b ON w.id = b.wine_id
        WHERE b.status = 'in_cellar' AND b.user_id = $1
          AND w.drink_window_start <= $2 AND w.drink_window_end >= $2
        GROUP BY w.id
        ORDER BY seasonal_match DESC, w.ct_community_score DESC NULLS LAST
        LIMIT 10
      `, [userId, currentYear]);

      let tonight_pick = null;
      if (pickResult.rows.length > 0) {
        // Deterministic daily pick: hash the date string for consistent daily rotation
        const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
        let hash = 0;
        for (let i = 0; i < dateStr.length; i++) {
          hash = ((hash << 5) - hash + dateStr.charCodeAt(i)) | 0;
        }
        const idx = Math.abs(hash) % pickResult.rows.length;
        const pick = pickResult.rows[idx];
        const parts: string[] = [];
        if (pick.score) parts.push(`${Math.round(Number(pick.score))} pts`);
        if (pick.region) parts.push(pick.region);
        else if (pick.varietal) parts.push(pick.varietal);
        tonight_pick = {
          ...pick,
          score: pick.score ? Math.round(Number(pick.score)) : null,
          bottle_count: Number(pick.bottle_count),
          avg_value: pick.avg_value ? Math.round(Number(pick.avg_value)) : null,
          reason: parts.length > 0 ? `In its prime • ${parts.join(" • ")}` : "In its prime",
        };
      }

      // Past peak count
      const pastPeak = await pool.query(`
        SELECT COUNT(DISTINCT w.id) as count FROM wines w JOIN bottles b ON w.id = b.wine_id
        WHERE b.status = 'in_cellar' AND b.user_id = $1 AND w.drink_window_end < $2
      `, [userId, currentYear]);

      // Approaching peak count (within 1 year of end)
      const approachingPeak = await pool.query(`
        SELECT COUNT(DISTINCT w.id) as count FROM wines w JOIN bottles b ON w.id = b.wine_id
        WHERE b.status = 'in_cellar' AND b.user_id = $1
          AND w.drink_window_end >= $2 AND w.drink_window_end <= $3
      `, [userId, currentYear, currentYear + 1]);

      // Unrated consumption count + most recent
      const unrated = await pool.query(`
        SELECT b.id as consumption_id, w.wine_name, w.producer, b.consumed_date
        FROM bottles b JOIN wines w ON b.wine_id = w.id
        WHERE b.status = 'consumed' AND b.user_id = $1 AND b.rating IS NULL
        ORDER BY b.consumed_date DESC NULLS LAST LIMIT 1
      `, [userId]);
      const unratedCount = await pool.query(
        `SELECT COUNT(*) as count FROM consumption_log cl WHERE cl.user_id = $1 AND cl.rating IS NULL`,
        [userId]
      );

      // Total bottles
      const totalBottles = await pool.query(
        `SELECT COUNT(*) as count FROM bottles WHERE status = 'in_cellar' AND user_id = $1`,
        [userId]
      );

      res.json({
        tonight_pick,
        alerts: {
          past_peak: Number(pastPeak.rows[0].count),
          approaching_peak: Number(approachingPeak.rows[0].count),
        },
        recent_unrated: unrated.rows[0] || null,
        unrated_count: Number(unratedCount.rows[0].count),
        total_bottles: Number(totalBottles.rows[0].count),
      });
    } catch (error) {
      console.error("Error fetching cru home:", error);
      res.status(500).json({ error: "Failed to fetch home data" });
    }
  });

  app.get("/api/wines", requireAuth, async (req: AuthRequest, res: Response) => {
    const userId = req.userId;
    const {
      sort = "producer",
      order = "asc",
      color,
      region,
      country,
      varietal,
      drinkWindow,
      location_filter,
      minValue,
      maxValue,
      inStock = "true",
      search,
      wine_ids,
    } = req.query;

    let whereClauses: string[] = ["w.user_id = $1"];
    let params: any[] = [userId];
    let paramIdx = 2;

    if (color) {
      const colors = (color as string).split(",");
      const placeholders = colors.map(() => `$${paramIdx++}`);
      whereClauses.push(`w.color IN (${placeholders.join(",")})`);
      params.push(...colors);
    }
    if (region) {
      whereClauses.push(`w.region = $${paramIdx++}`);
      params.push(region);
    }
    if (country) {
      whereClauses.push(`w.country = $${paramIdx++}`);
      params.push(country);
    }
    if (varietal) {
      whereClauses.push(`w.varietal ILIKE $${paramIdx++}`);
      params.push(`%${varietal}%`);
    }
    if (search) {
      whereClauses.push(
        `(unaccent(w.producer) ILIKE unaccent($${paramIdx}) OR unaccent(w.wine_name) ILIKE unaccent($${paramIdx}) OR unaccent(w.varietal) ILIKE unaccent($${paramIdx}) OR unaccent(w.region) ILIKE unaccent($${paramIdx}) OR unaccent(w.appellation) ILIKE unaccent($${paramIdx}))`
      );
      params.push(`%${search}%`);
      paramIdx++;
    }

    if (wine_ids) {
      const ids = (wine_ids as string).split(",").map(Number).filter(Boolean);
      if (ids.length > 0) {
        const placeholders = ids.map(() => `$${paramIdx++}`);
        whereClauses.push(`w.id IN (${placeholders.join(",")})`);
        params.push(...ids);
      }
    }

    const currentYear = new Date().getFullYear();
    if (drinkWindow) {
      const dw = (drinkWindow as string).split(",");
      const dwClauses: string[] = [];
      if (dw.includes("in_window")) {
        dwClauses.push(`(w.drink_window_start <= ${currentYear} AND w.drink_window_end >= ${currentYear})`);
      }
      if (dw.includes("approaching")) {
        dwClauses.push(`(w.drink_window_start > ${currentYear} AND w.drink_window_start <= ${currentYear + 1})`);
      }
      if (dw.includes("past_peak")) {
        dwClauses.push(`(w.drink_window_end < ${currentYear} AND w.drink_window_end IS NOT NULL)`);
      }
      if (dw.includes("not_set")) {
        dwClauses.push(`(w.drink_window_start IS NULL AND w.drink_window_end IS NULL)`);
      }
      if (dwClauses.length > 0) {
        whereClauses.push(`(${dwClauses.join(" OR ")})`);
      }
    }

    if (location_filter) {
      const locs = (location_filter as string).split(",");
      const locPlaceholders = locs.map(() => `$${paramIdx++}`);
      whereClauses.push(
        `w.id IN (SELECT b3.wine_id FROM bottles b3 WHERE b3.status = 'in_cellar' AND b3.user_id = $1 AND b3.location IN (${locPlaceholders.join(",")}))`
      );
      params.push(...locs);
    }

    const havingClauses: string[] = [];
    if (inStock === "true") {
      havingClauses.push("COUNT(CASE WHEN b.status = 'in_cellar' THEN 1 END) > 0");
    }
    if (minValue) {
      havingClauses.push(`COALESCE(AVG(CASE WHEN b.status = 'in_cellar' THEN b.estimated_value END), 0) >= $${paramIdx++}`);
      params.push(parseFloat(minValue as string));
    }
    if (maxValue) {
      havingClauses.push(`COALESCE(AVG(CASE WHEN b.status = 'in_cellar' THEN b.estimated_value END), 0) <= $${paramIdx++}`);
      params.push(parseFloat(maxValue as string));
    }

    const validSorts: Record<string, string> = {
      producer: "w.producer",
      vintage: "w.vintage",
      value: "avg_value",
      drink_window_start: "w.drink_window_start",
      quantity: "bottle_count",
      color: "w.color",
      region: "w.region",
      community_score: "w.ct_community_score",
      location: "primary_location",
    };
    const sortCol = validSorts[sort as string] || "w.producer";
    const sortOrder = order === "desc" ? "DESC" : "ASC";

    const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
    const havingStr = havingClauses.length > 0 ? `HAVING ${havingClauses.join(" AND ")}` : "";

    const query = `
      SELECT
        w.*,
        COUNT(CASE WHEN b.status = 'in_cellar' THEN 1 END) as bottle_count,
        COALESCE(AVG(CASE WHEN b.status = 'in_cellar' THEN b.estimated_value END), 0) as avg_value,
        COALESCE(SUM(CASE WHEN b.status = 'in_cellar' THEN b.estimated_value END), 0) as total_value,
        (SELECT b2.location FROM bottles b2 WHERE b2.wine_id = w.id AND b2.status = 'in_cellar' AND b2.user_id = w.user_id AND b2.location IS NOT NULL LIMIT 1) as primary_location
      FROM wines w
      LEFT JOIN bottles b ON w.id = b.wine_id AND b.user_id = w.user_id
      ${whereStr}
      GROUP BY w.id
      ${havingStr}
      ORDER BY ${sortCol} ${sortOrder} NULLS LAST
    `;

    const pageNum = parseInt(req.query.page as string, 10);
    const limitNum = Math.min(parseInt((req.query.limit as string) || "50", 10), 100);

    if (!isNaN(pageNum) && pageNum >= 1) {
      const countQuery = `SELECT COUNT(*) as total FROM (${query}) subq`;
      const countResult = await pool.query(countQuery, params);
      const total = Number(countResult.rows[0].total);

      const paginatedQuery = query + ` LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
      const paginatedResult = await pool.query(paginatedQuery, [...params, limitNum, (pageNum - 1) * limitNum]);

      res.json({
        wines: paginatedResult.rows,
        total,
        hasMore: pageNum * limitNum < total,
        page: pageNum,
      });
    } else {
      const result = await pool.query(query, params);
      res.json(result.rows);
    }
  });

  app.get("/api/wines/:id", requireAuth, async (req: AuthRequest, res: Response) => {
    const wineResult = await pool.query("SELECT * FROM wines WHERE id = $1 AND user_id = $2", [req.params.id, req.userId]);
    if (wineResult.rows.length === 0) return res.status(404).json({ error: "Wine not found" });
    const bottleResult = await pool.query("SELECT * FROM bottles WHERE wine_id = $1 AND user_id = $2 ORDER BY created_at DESC", [req.params.id, req.userId]);
    res.json({ ...wineResult.rows[0], bottles: bottleResult.rows });
  });

  app.post("/api/wines", requireAuth, async (req: AuthRequest, res: Response) => {
    const userId = req.userId;
    const { quantity = 1, purchase_date, purchase_price, estimated_value, location, size, notes, ...wineData } = req.body;

    const result = await pool.query(`
      INSERT INTO wines (producer, wine_name, vintage, country, region, sub_region, appellation, varietal, color, wine_type, category, designation, vineyard, drink_window_start, drink_window_end, ct_community_score, critic_scores, user_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18) RETURNING *
    `, [
      wineData.producer, wineData.wine_name, wineData.vintage || null,
      wineData.country || null, wineData.region || null, wineData.sub_region || null,
      wineData.appellation || null, wineData.varietal || null, wineData.color || null,
      wineData.wine_type || null, wineData.category || null, wineData.designation || null,
      wineData.vineyard || null, wineData.drink_window_start || null, wineData.drink_window_end || null,
      wineData.ct_community_score || null, wineData.critic_scores || null, userId
    ]);

    const wineId = result.rows[0].id;

    for (let i = 0; i < (quantity || 1); i++) {
      await pool.query(`
        INSERT INTO bottles (wine_id, purchase_date, purchase_price, estimated_value, location, size, notes, user_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [wineId, purchase_date || null, purchase_price || null, estimated_value || null, location || null, size || "750ml", notes || null, userId]);
    }

    res.status(201).json(result.rows[0]);
  });

  app.put("/api/wines/:id", requireAuth, async (req: AuthRequest, res: Response) => {
    const wineResult = await pool.query("SELECT * FROM wines WHERE id = $1 AND user_id = $2", [req.params.id, req.userId]);
    if (wineResult.rows.length === 0) return res.status(404).json({ error: "Wine not found" });

    const fields = ["producer", "wine_name", "vintage", "country", "region", "sub_region", "appellation", "varietal", "color", "wine_type", "category", "designation", "vineyard", "drink_window_start", "drink_window_end", "ct_community_score", "critic_scores"];
    const updates: string[] = [];
    const values: any[] = [];
    let paramIdx = 1;

    for (const field of fields) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = $${paramIdx++}`);
        values.push(req.body[field]);
      }
    }

    if (updates.length > 0) {
      updates.push(`updated_at = NOW()`);
      values.push(req.params.id);
      await pool.query(`UPDATE wines SET ${updates.join(", ")} WHERE id = $${paramIdx}`, values);
    }

    const updated = await pool.query("SELECT * FROM wines WHERE id = $1", [req.params.id]);
    res.json(updated.rows[0]);
  });

  app.post("/api/wines/:id/bottles", requireAuth, async (req: AuthRequest, res: Response) => {
    const wineResult = await pool.query("SELECT * FROM wines WHERE id = $1 AND user_id = $2", [req.params.id, req.userId]);
    if (wineResult.rows.length === 0) return res.status(404).json({ error: "Wine not found" });

    const { quantity = 1, purchase_date, purchase_price, estimated_value, location, size, notes } = req.body;

    for (let i = 0; i < quantity; i++) {
      await pool.query(`
        INSERT INTO bottles (wine_id, purchase_date, purchase_price, estimated_value, location, size, notes, user_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [req.params.id, purchase_date || null, purchase_price || null, estimated_value || null, location || null, size || "750ml", notes || null, req.userId]);
    }

    res.status(201).json({ message: `Added ${quantity} bottle(s)` });
  });

  app.put("/api/bottles/:id", requireAuth, async (req: AuthRequest, res: Response) => {
    const bottleResult = await pool.query("SELECT * FROM bottles WHERE id = $1 AND user_id = $2", [req.params.id, req.userId]);
    if (bottleResult.rows.length === 0) return res.status(404).json({ error: "Bottle not found" });

    const fields = ["purchase_date", "purchase_price", "estimated_value", "location", "size", "notes", "status"];
    const updates: string[] = [];
    const values: any[] = [];
    let paramIdx = 1;

    for (const field of fields) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = $${paramIdx++}`);
        values.push(req.body[field]);
      }
    }

    if (updates.length > 0) {
      values.push(req.params.id);
      await pool.query(`UPDATE bottles SET ${updates.join(", ")} WHERE id = $${paramIdx}`, values);
    }

    const updated = await pool.query("SELECT * FROM bottles WHERE id = $1", [req.params.id]);
    res.json(updated.rows[0]);
  });

  app.patch("/api/bottles/:id/consume", requireAuth, async (req: AuthRequest, res: Response) => {
    const bottleResult = await pool.query("SELECT * FROM bottles WHERE id = $1 AND user_id = $2", [req.params.id, req.userId]);
    if (bottleResult.rows.length === 0) return res.status(404).json({ error: "Bottle not found" });
    const bottle = bottleResult.rows[0];

    const { consumed_date, occasion, paired_with, who_with, rating, tasting_notes } = req.body;
    const consumeDate = consumed_date || new Date().toISOString().split("T")[0];

    await pool.query(
      `UPDATE bottles SET status = 'consumed', consumed_date = $1, occasion = $2, rating = $3 WHERE id = $4`,
      [consumeDate, occasion || null, rating || null, req.params.id]
    );

    await pool.query(`
      INSERT INTO consumption_log (bottle_id, wine_id, consumed_date, occasion, paired_with, who_with, rating, tasting_notes, user_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [req.params.id, bottle.wine_id, consumeDate, occasion || null, paired_with || null, who_with || null, rating || null, tasting_notes || null, req.userId]);

    res.json({ message: "Bottle consumed" });
  });

  app.get("/api/consumption", requireAuth, async (req: AuthRequest, res: Response) => {
    const userId = req.userId;
    const { search, color, min_rating, rated, date_from, date_to, page, limit } = req.query;

    let whereClauses = ["cl.user_id = $1"];
    let params: any[] = [userId];
    let paramIdx = 2;

    if (search) {
      whereClauses.push(
        `(unaccent(w.producer) ILIKE unaccent($${paramIdx}) OR unaccent(w.wine_name) ILIKE unaccent($${paramIdx}) OR unaccent(w.varietal) ILIKE unaccent($${paramIdx}) OR unaccent(cl.occasion) ILIKE unaccent($${paramIdx}) OR unaccent(cl.tasting_notes) ILIKE unaccent($${paramIdx}))`
      );
      params.push(`%${search}%`);
      paramIdx++;
    }
    if (color) {
      const colors = (color as string).split(",");
      const placeholders = colors.map(() => `$${paramIdx++}`);
      whereClauses.push(`w.color IN (${placeholders.join(",")})`);
      params.push(...colors);
    }
    if (rated === "true") {
      whereClauses.push("cl.rating IS NOT NULL");
    } else if (rated === "false") {
      whereClauses.push("cl.rating IS NULL");
    }
    if (min_rating) {
      whereClauses.push(`cl.rating >= $${paramIdx++}`);
      params.push(parseInt(min_rating as string, 10));
    }
    if (date_from) {
      whereClauses.push(`cl.consumed_date >= $${paramIdx++}`);
      params.push(date_from);
    }
    if (date_to) {
      whereClauses.push(`cl.consumed_date <= $${paramIdx++}`);
      params.push(date_to);
    }

    const whereStr = `WHERE ${whereClauses.join(" AND ")}`;
    const baseQuery = `
      SELECT cl.*, w.producer, w.wine_name, w.vintage, w.color, w.varietal, w.region,
        w.sub_region, w.appellation, w.ct_community_score, w.drink_window_start, w.drink_window_end,
        b.purchase_price, b.estimated_value, b.location AS bottle_location
      FROM consumption_log cl
      JOIN wines w ON cl.wine_id = w.id
      LEFT JOIN bottles b ON cl.bottle_id = b.id
      ${whereStr}
      ORDER BY cl.consumed_date DESC
    `;

    const pageNum = parseInt(page as string, 10);
    const limitNum = Math.min(parseInt((limit as string) || "50", 10), 100);

    if (!isNaN(pageNum) && pageNum >= 1) {
      const countResult = await pool.query(
        `SELECT COUNT(*) as total FROM consumption_log cl JOIN wines w ON cl.wine_id = w.id ${whereStr}`,
        params
      );
      const total = Number(countResult.rows[0].total);

      const paginatedQuery = baseQuery + ` LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
      const result = await pool.query(paginatedQuery, [...params, limitNum, (pageNum - 1) * limitNum]);

      res.json({
        entries: result.rows,
        total,
        hasMore: pageNum * limitNum < total,
        page: pageNum,
      });
    } else {
      const result = await pool.query(baseQuery, params);
      res.json(result.rows);
    }
  });

  app.get("/api/consumption/stats", requireAuth, async (req: AuthRequest, res: Response) => {
    const userId = req.userId;

    const totals = (await pool.query(`
      SELECT
        COUNT(*) as "totalBottles",
        COALESCE(SUM(COALESCE(b.estimated_value, b.purchase_price, 0)), 0) as "totalValue"
      FROM consumption_log cl
      LEFT JOIN bottles b ON cl.bottle_id = b.id
      WHERE cl.user_id = $1
    `, [userId])).rows[0];

    const colorBreakdown = (await pool.query(`
      SELECT w.color, COUNT(*) as count
      FROM consumption_log cl
      JOIN wines w ON cl.wine_id = w.id
      WHERE cl.user_id = $1 AND w.color IS NOT NULL
      GROUP BY w.color
      ORDER BY count DESC
    `, [userId])).rows;

    const monthlyRaw = (await pool.query(`
      SELECT
        to_char(cl.consumed_date::date, 'YYYY-MM') as month,
        COUNT(*) as count
      FROM consumption_log cl
      WHERE cl.user_id = $1 AND cl.consumed_date IS NOT NULL
      GROUP BY month
      ORDER BY month ASC
    `, [userId])).rows;

    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    let monthlyTrend: any[] = [];

    if (monthlyRaw.length > 0) {
      const first = monthlyRaw[0].month;
      const last = monthlyRaw[monthlyRaw.length - 1].month;
      const countMap = new Map(monthlyRaw.map((r: any) => [r.month, Number(r.count)]));

      let [y, m] = first.split("-").map(Number);
      const [ey, em] = last.split("-").map(Number);

      while (y < ey || (y === ey && m <= em)) {
        const key = `${y}-${String(m).padStart(2, "0")}`;
        const shortYear = String(y).slice(2);
        monthlyTrend.push({
          month: key,
          label: `${months[m - 1]} '${shortYear}`,
          count: countMap.get(key) || 0,
        });
        m++;
        if (m > 12) { m = 1; y++; }
      }
    }

    const thisYear = new Date().getFullYear();
    const lastYear = thisYear - 1;

    const yoyRaw = (await pool.query(`
      SELECT
        EXTRACT(MONTH FROM consumed_date::date)::int as month_num,
        EXTRACT(YEAR FROM consumed_date::date)::int as year_num,
        COUNT(*) as count
      FROM consumption_log
      WHERE user_id = $1
        AND consumed_date IS NOT NULL
        AND EXTRACT(YEAR FROM consumed_date::date) IN ($2, $3)
      GROUP BY month_num, year_num
      ORDER BY year_num, month_num
    `, [userId, thisYear, lastYear])).rows;

    const monthLabels = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const yearlyComparison = monthLabels.map((label, i) => {
      const m = i + 1;
      const cur = yoyRaw.find((r: any) => r.year_num === thisYear && r.month_num === m);
      const prior = yoyRaw.find((r: any) => r.year_num === lastYear && r.month_num === m);
      return { label, current: Number(cur?.count || 0), prior: Number(prior?.count || 0) };
    });

    res.json({
      totalBottles: Number(totals.totalBottles),
      totalGlasses: Number(totals.totalBottles) * 5,
      totalValue: Math.round(Number(totals.totalValue) * 100) / 100,
      colorBreakdown,
      monthlyTrend,
      yearlyComparison,
    });
  });

  app.delete("/api/consumption", requireAuth, async (req: AuthRequest, res: Response) => {
    const userId = req.userId;
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "ids array required" });
    }

    const placeholders = ids.map((_: any, i: number) => `$${i + 1}`);
    const entries = (await pool.query(
      `SELECT id, bottle_id FROM consumption_log WHERE id IN (${placeholders.join(",")}) AND user_id = $${ids.length + 1}`,
      [...ids, userId]
    )).rows;

    if (entries.length === 0) {
      return res.status(404).json({ error: "No matching entries found" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `DELETE FROM consumption_log WHERE id IN (${placeholders.join(",")}) AND user_id = $${ids.length + 1}`,
        [...ids, userId]
      );

      for (const entry of entries) {
        if (entry.bottle_id) {
          await client.query(
            `DELETE FROM bottles WHERE id = $1 AND user_id = $2 AND status = 'consumed'`,
            [entry.bottle_id, userId]
          );
        }
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    res.json({ deleted: entries.length });
  });

  app.post("/api/consumption/undo", requireAuth, async (req: AuthRequest, res: Response) => {
    const userId = req.userId;
    const { bottle_id } = req.body;
    if (!bottle_id) return res.status(400).json({ error: "bottle_id required" });

    const bottleResult = await pool.query(
      "SELECT * FROM bottles WHERE id = $1 AND user_id = $2 AND status = 'consumed'",
      [bottle_id, userId]
    );
    if (bottleResult.rows.length === 0) return res.status(404).json({ error: "Consumed bottle not found" });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "UPDATE bottles SET status = 'in_cellar', consumed_date = NULL, occasion = NULL, rating = NULL WHERE id = $1 AND user_id = $2",
        [bottle_id, userId]
      );
      await client.query(
        "DELETE FROM consumption_log WHERE bottle_id = $1 AND user_id = $2",
        [bottle_id, userId]
      );
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    res.json({ success: true });
  });

  app.patch("/api/bottles/bulk-move", requireAuth, async (req: AuthRequest, res: Response) => {
    const userId = req.userId;
    const { wine_ids, location } = req.body;
    if (!wine_ids || !Array.isArray(wine_ids) || wine_ids.length === 0) {
      return res.status(400).json({ error: "wine_ids array required" });
    }
    if (location === undefined) {
      return res.status(400).json({ error: "location required" });
    }

    const placeholders = wine_ids.map((_: any, i: number) => `$${i + 3}`);
    const result = await pool.query(
      `UPDATE bottles SET location = $1 WHERE user_id = $2 AND status = 'in_cellar' AND wine_id IN (${placeholders.join(",")})`,
      [location || null, userId, ...wine_ids]
    );

    res.json({ updated: result.rowCount });
  });

  app.get("/api/storage-locations", requireAuth, async (req: AuthRequest, res: Response) => {
    const result = await pool.query(
      "SELECT * FROM storage_locations WHERE user_id = $1 ORDER BY sort_order ASC, id ASC",
      [req.userId]
    );
    res.json(result.rows);
  });

  app.put("/api/storage-locations", requireAuth, async (req: AuthRequest, res: Response) => {
    const userId = req.userId;
    const { locations, renames } = req.body;
    if (!locations || !Array.isArray(locations)) {
      return res.status(400).json({ error: "locations array required" });
    }

    const renameMap: Record<string, string> = renames || {};

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const existing = (await client.query("SELECT name FROM storage_locations WHERE user_id = $1", [userId])).rows;
      const oldNames = new Set(existing.map((e: any) => e.name));

      await client.query("DELETE FROM storage_locations WHERE user_id = $1", [userId]);

      const newNames = new Set<string>();
      for (let idx = 0; idx < locations.length; idx++) {
        const loc = locations[idx];
        if (loc.name && loc.name.trim()) {
          const name = loc.name.trim();
          const nameKey = name.toLowerCase();
          if (!newNames.has(nameKey)) {
            await client.query(
              "INSERT INTO storage_locations (user_id, name, type, sort_order) VALUES ($1, $2, $3, $4)",
              [userId, name, loc.type || "other", idx]
            );
            newNames.add(nameKey);
          }
        }
      }

      for (const [oldName, newName] of Object.entries(renameMap)) {
        if (oldName !== newName && newNames.has(newName.toLowerCase())) {
          await client.query(
            "UPDATE bottles SET location = $1 WHERE location = $2 AND user_id = $3",
            [newName, oldName, userId]
          );
        }
      }

      for (const oldName of oldNames) {
        if (!newNames.has(oldName.toLowerCase()) && !renameMap[oldName]) {
          await client.query(
            "UPDATE bottles SET location = NULL WHERE location = $1 AND user_id = $2 AND status = 'in_cellar'",
            [oldName, userId]
          );
        }
      }

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    const updated = await pool.query(
      "SELECT * FROM storage_locations WHERE user_id = $1 ORDER BY sort_order ASC, id ASC",
      [userId]
    );
    res.json(updated.rows);
  });

  app.get("/api/filters", requireAuth, async (req: AuthRequest, res: Response) => {
    const userId = req.userId;
    const colors = (await pool.query("SELECT DISTINCT color FROM wines WHERE color IS NOT NULL AND user_id = $1 ORDER BY color", [userId])).rows;
    const regions = (await pool.query("SELECT DISTINCT region FROM wines WHERE region IS NOT NULL AND user_id = $1 ORDER BY region", [userId])).rows;
    const countries = (await pool.query("SELECT DISTINCT country FROM wines WHERE country IS NOT NULL AND user_id = $1 ORDER BY country", [userId])).rows;
    const varietals = (await pool.query("SELECT DISTINCT varietal FROM wines WHERE varietal IS NOT NULL AND user_id = $1 ORDER BY varietal", [userId])).rows;
    const locationsResult = (await pool.query("SELECT DISTINCT location FROM bottles WHERE location IS NOT NULL AND status = 'in_cellar' AND user_id = $1 ORDER BY location", [userId])).rows;
    res.json({
      colors: colors.map((c: any) => c.color),
      regions: regions.map((r: any) => r.region),
      countries: countries.map((c: any) => c.country),
      locations: locationsResult.map((l: any) => l.location),
      varietals: varietals.map((v: any) => v.varietal),
    });
  });

  app.post("/api/import", requireAuth, upload.single("file"), async (req: AuthRequest, res: Response) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const decoded = iconv.decode(req.file.buffer, "latin1");
    const cleanedCsv = decoded.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    let records: any[];
    try {
      records = parse(cleanedCsv, {
        columns: true,
        skip_empty_lines: true,
        relax_column_count: true,
        trim: true,
      });
    } catch (err: any) {
      return res.status(400).json({ error: `CSV parse error: ${err.message}` });
    }

    if (!records.length) {
      return res.status(400).json({ error: "CSV file is empty" });
    }

    const preview = req.query.preview === "true";
    if (preview) {
      return res.json({
        total_rows: records.length,
        preview: records.slice(0, 10),
        unique_wines: new Set(records.map((r) => r.iWine || r.Wine || r.wine_name || "")).size,
      });
    }

    const csvColumns = Object.keys(records[0]);
    const isCellarTracker = csvColumns.includes("iWine") && csvColumns.includes("Wine");

    interface ColumnMapping {
      producer: string | null;
      wine_name: string | null;
      vintage: string | null;
      country: string | null;
      region: string | null;
      sub_region: string | null;
      appellation: string | null;
      varietal: string | null;
      color: string | null;
      wine_type: string | null;
      category: string | null;
      designation: string | null;
      vineyard: string | null;
      drink_window_start: string | null;
      drink_window_end: string | null;
      score: string | null;
      price: string | null;
      value: string | null;
      location: string | null;
      size: string | null;
      purchase_date: string | null;
      quantity: string | null;
      consumed_date: string | null;
    }

    let mapping: ColumnMapping;

    if (isCellarTracker) {
      mapping = {
        producer: "Producer",
        wine_name: "Wine",
        vintage: "Vintage",
        country: "Country",
        region: "Region",
        sub_region: "SubRegion",
        appellation: "Appellation",
        varietal: "Varietal",
        color: "Color",
        wine_type: "Type",
        category: "Category",
        designation: "Designation",
        vineyard: "Vineyard",
        drink_window_start: "BeginConsume",
        drink_window_end: "EndConsume",
        score: "CScore",
        price: "Price",
        value: "Value",
        location: "Location",
        size: "Size",
        purchase_date: "PurchaseDate",
        quantity: null,
        consumed_date: null,
      };
    } else {
      const sampleRows = records.slice(0, 5).map((r: any) => {
        const obj: any = {};
        for (const key of csvColumns) {
          obj[key] = r[key];
        }
        return obj;
      });

      const aiPrompt = `You are a wine data mapping assistant. Given CSV column headers and sample data from a wine collection export, map each CSV column to the appropriate wine database field.

CSV columns: ${JSON.stringify(csvColumns)}

Sample data (first ${sampleRows.length} rows):
${JSON.stringify(sampleRows, null, 2)}

Map to these database fields (return the CSV column name that best matches each, or null if no match):
- producer: The wine producer/winery/maker name
- wine_name: The wine name/label/cuvee
- vintage: The vintage year
- country: Country of origin
- region: Wine region
- sub_region: Sub-region
- appellation: Appellation/AOC/AVA
- varietal: Grape variety/varietal
- color: Wine color (Red, White, Rosé, Sparkling, etc.)
- wine_type: Type of wine
- category: Category
- designation: Designation/classification
- vineyard: Vineyard name
- drink_window_start: Start of drink window (year)
- drink_window_end: End of drink window (year)
- score: Rating/score
- price: Purchase price
- value: Estimated value
- location: Storage location
- size: Bottle size
- purchase_date: Date purchased
- quantity: Number of bottles (if a single row represents multiple bottles)
- consumed_date: Date the wine was consumed/drunk (indicates bottle is no longer in cellar)

Return ONLY a valid JSON object with the field names as keys and CSV column names (or null) as values. No explanation.`;

      try {
        const aiResponse = await callAnthropic({
          model: "claude-sonnet-4-6",
          max_tokens: 1024,
          system: "You are a data mapping assistant. Return only valid JSON.",
          messages: [{ role: "user", content: aiPrompt }],
        });

        const textBlock = aiResponse.content.find((b: any) => b.type === "text");
        const jsonStr = (textBlock as any)?.text || "{}";
        const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
        mapping = jsonMatch ? JSON.parse(jsonMatch[0]) : {} as ColumnMapping;

        if (!mapping.producer && !mapping.wine_name) {
          return res.status(400).json({
            error: "Could not identify wine data columns in this CSV. Please ensure it contains at least producer/winery and wine name columns."
          });
        }
      } catch (err: any) {
        return res.status(500).json({ error: `Failed to analyze CSV format: ${err.message}` });
      }
    }

    const getField = (row: any, field: string | null): string | null => {
      if (!field || !row[field]) return null;
      const val = String(row[field]).trim();
      return val === "" ? null : val;
    };

    let winesCreated = 0;
    let bottlesCreated = 0;
    let consumedCount = 0;
    let skipped = 0;
    const errors: string[] = [];

    const userId = req.userId;
    const winesByCtId = new Map<string, number>();

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      for (let i = 0; i < records.length; i++) {
        const row = records[i];
        try {
          if (isCellarTracker) {
            const ctInventoryId = parseInteger(row.iInventory);
            if (ctInventoryId) {
              const existingBottle = await client.query("SELECT id FROM bottles WHERE ct_inventory_id = $1 AND user_id = $2", [ctInventoryId, userId]);
              if (existingBottle.rows.length > 0) {
                skipped++;
                continue;
              }
            }

            const ctWineId = parseInteger(row.iWine);
            let wineId: number;

            const ctProducer = cleanValue(row.Producer);
            const ctWineName = cleanValue(row.Wine) || "Unknown";
            const producer = ctProducer || ctWineName;
            const wineName = ctProducer ? ctWineName : ctWineName;

            if (ctWineId && winesByCtId.has(String(ctWineId))) {
              wineId = winesByCtId.get(String(ctWineId))!;
            } else if (ctWineId) {
              const existingWine = await client.query("SELECT id FROM wines WHERE ct_wine_id = $1 AND user_id = $2", [ctWineId, userId]);
              if (existingWine.rows.length > 0) {
                wineId = existingWine.rows[0].id;
                winesByCtId.set(String(ctWineId), wineId);
              } else {
                const result = await client.query(`
                  INSERT INTO wines (ct_wine_id, producer, wine_name, vintage, country, region, sub_region, appellation, varietal, color, wine_type, category, designation, vineyard, drink_window_start, drink_window_end, ct_community_score, user_id)
                  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18) RETURNING id
                `, [
                  ctWineId, producer, wineName, parseInteger(row.Vintage),
                  cleanValue(row.Country), cleanValue(row.Region), cleanValue(row.SubRegion),
                  cleanValue(row.Appellation), cleanValue(row.Varietal), cleanValue(row.Color),
                  cleanValue(row.Type), cleanValue(row.Category), cleanValue(row.Designation),
                  cleanValue(row.Vineyard), parseDrinkWindowYear(row.BeginConsume), parseDrinkWindowYear(row.EndConsume),
                  parseNumber(row.CScore), userId
                ]);
                wineId = result.rows[0].id;
                winesByCtId.set(String(ctWineId), wineId);
                winesCreated++;
              }
            } else {
              const result = await client.query(`
                INSERT INTO wines (ct_wine_id, producer, wine_name, vintage, country, region, sub_region, appellation, varietal, color, wine_type, category, designation, vineyard, drink_window_start, drink_window_end, ct_community_score, user_id)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18) RETURNING id
              `, [
                null, producer, wineName, parseInteger(row.Vintage),
                cleanValue(row.Country), cleanValue(row.Region), cleanValue(row.SubRegion),
                cleanValue(row.Appellation), cleanValue(row.Varietal), cleanValue(row.Color),
                cleanValue(row.Type), cleanValue(row.Category), cleanValue(row.Designation),
                cleanValue(row.Vineyard), parseDrinkWindowYear(row.BeginConsume), parseDrinkWindowYear(row.EndConsume),
                parseNumber(row.CScore), userId
              ]);
              wineId = result.rows[0].id;
              winesCreated++;
            }

            const price = parseNumber(row.Price);
            const barcode = cleanValue(row.Barcode) || cleanValue(row.WineBarcode);
            const consumedDate = parseDate(row.Consumed) || parseDate(row.ConsumeDate);
            const isConsumed = !!consumedDate;

            const bottleResult = await client.query(`
              INSERT INTO bottles (wine_id, ct_inventory_id, ct_barcode, purchase_date, purchase_price, estimated_value, location, size, user_id, status, consumed_date)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id
            `, [
              wineId, parseInteger(row.iInventory), barcode,
              parseDate(row.PurchaseDate), price && price > 0 ? price : null,
              parseNumber(row.Value), cleanValue(row.Location),
              cleanValue(row.Size) || "750ml", userId,
              isConsumed ? "consumed" : "in_cellar", consumedDate
            ]);
            bottlesCreated++;

            if (isConsumed) {
              const bottleId = bottleResult.rows[0].id;
              await client.query(
                "INSERT INTO consumption_log (bottle_id, wine_id, consumed_date, user_id) VALUES ($1, $2, $3, $4)",
                [bottleId, wineId, consumedDate, userId]
              );
              consumedCount++;
            }
          } else {
            const producer = getField(row, mapping.producer) || "Unknown";
            const wineName = getField(row, mapping.wine_name) || "Unknown";
            const quantity = mapping.quantity ? (parseInteger(row[mapping.quantity!]) || 1) : 1;

            const result = await client.query(`
              INSERT INTO wines (ct_wine_id, producer, wine_name, vintage, country, region, sub_region, appellation, varietal, color, wine_type, category, designation, vineyard, drink_window_start, drink_window_end, ct_community_score, user_id)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18) RETURNING id
            `, [
              null, producer, wineName,
              mapping.vintage ? parseInteger(row[mapping.vintage]) : null,
              getField(row, mapping.country), getField(row, mapping.region),
              getField(row, mapping.sub_region), getField(row, mapping.appellation),
              getField(row, mapping.varietal), getField(row, mapping.color),
              getField(row, mapping.wine_type), getField(row, mapping.category),
              getField(row, mapping.designation), getField(row, mapping.vineyard),
              mapping.drink_window_start ? parseDrinkWindowYear(row[mapping.drink_window_start]) : null,
              mapping.drink_window_end ? parseDrinkWindowYear(row[mapping.drink_window_end]) : null,
              mapping.score ? parseNumber(row[mapping.score!]) : null,
              userId
            ]);
            const wineId = result.rows[0].id;
            winesCreated++;

            for (let q = 0; q < quantity; q++) {
              const price = mapping.price ? parseNumber(row[mapping.price!]) : null;
              const consumedDate = mapping.consumed_date ? parseDate(row[mapping.consumed_date!]) : null;
              const isConsumed = !!consumedDate;

              const bottleResult = await client.query(`
                INSERT INTO bottles (wine_id, ct_inventory_id, ct_barcode, purchase_date, purchase_price, estimated_value, location, size, user_id, status, consumed_date)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id
              `, [
                wineId, null, null,
                mapping.purchase_date ? parseDate(row[mapping.purchase_date!]) : null,
                price && price > 0 ? price : null,
                mapping.value ? parseNumber(row[mapping.value!]) : null,
                getField(row, mapping.location), getField(row, mapping.size) || "750ml",
                userId, isConsumed ? "consumed" : "in_cellar", consumedDate
              ]);
              bottlesCreated++;

              if (isConsumed) {
                const bottleId = bottleResult.rows[0].id;
                await client.query(
                  "INSERT INTO consumption_log (bottle_id, wine_id, consumed_date, user_id) VALUES ($1, $2, $3, $4)",
                  [bottleId, wineId, consumedDate, userId]
                );
                consumedCount++;
              }
            }
          }
        } catch (err: any) {
          errors.push(`Row ${i + 1}: ${err.message}`);
        }
      }

      await client.query("COMMIT");
    } catch (err: any) {
      await client.query("ROLLBACK");
      return res.status(500).json({ error: `Import failed: ${err.message}` });
    } finally {
      client.release();
    }

    res.json({
      wines_created: winesCreated,
      bottles_created: bottlesCreated,
      consumed: consumedCount,
      skipped,
      errors,
      total_rows: records.length,
    });
  });

  const sanitizeCell = (val: any): any => {
    if (typeof val !== "string") return val;
    if (/^[=+\-@]/.test(val)) return "'" + val;
    return val;
  };

  app.get("/api/export", requireAuth, async (req: AuthRequest, res: Response) => {
    const userId = req.userId;

    const wines = (await pool.query(`
      SELECT w.*,
        COUNT(CASE WHEN b.status = 'in_cellar' THEN 1 END) as bottle_count,
        COALESCE(SUM(CASE WHEN b.status = 'in_cellar' THEN b.estimated_value END), 0) as total_value
      FROM wines w
      LEFT JOIN bottles b ON w.id = b.wine_id AND b.user_id = w.user_id
      WHERE w.user_id = $1
      GROUP BY w.id
      ORDER BY w.producer ASC
    `, [userId])).rows;

    const bottles = (await pool.query(`
      SELECT b.*, w.producer, w.wine_name, w.vintage, w.color, w.varietal, w.region,
        w.country, w.sub_region, w.appellation, w.wine_type, w.category,
        w.designation, w.vineyard, w.drink_window_start, w.drink_window_end,
        w.ct_community_score
      FROM bottles b
      JOIN wines w ON b.wine_id = w.id
      WHERE b.user_id = $1
      ORDER BY w.producer ASC, b.created_at DESC
    `, [userId])).rows;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Vin Wine Cellar";
    workbook.created = new Date();

    const wineSheet = workbook.addWorksheet("Wines");
    wineSheet.columns = [
      { header: "Producer", key: "producer", width: 25 },
      { header: "Wine Name", key: "wine_name", width: 30 },
      { header: "Vintage", key: "vintage", width: 10 },
      { header: "Color", key: "color", width: 12 },
      { header: "Varietal", key: "varietal", width: 25 },
      { header: "Country", key: "country", width: 18 },
      { header: "Region", key: "region", width: 20 },
      { header: "Sub Region", key: "sub_region", width: 20 },
      { header: "Appellation", key: "appellation", width: 20 },
      { header: "Type", key: "wine_type", width: 15 },
      { header: "Category", key: "category", width: 15 },
      { header: "Designation", key: "designation", width: 20 },
      { header: "Vineyard", key: "vineyard", width: 20 },
      { header: "Drink Window Start", key: "drink_window_start", width: 18 },
      { header: "Drink Window End", key: "drink_window_end", width: 16 },
      { header: "Community Score", key: "ct_community_score", width: 16 },
      { header: "Bottles In Cellar", key: "bottle_count", width: 16 },
      { header: "Total Value", key: "total_value", width: 12 },
    ];

    const headerStyle: Partial<ExcelJS.Style> = {
      font: { bold: true, color: { argb: "FFFFFFFF" } },
      fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FF722F37" } },
      alignment: { horizontal: "center" },
    };

    wineSheet.getRow(1).eachCell((cell) => {
      cell.style = headerStyle as ExcelJS.Style;
    });

    for (const wine of wines) {
      wineSheet.addRow({
        producer: sanitizeCell(wine.producer),
        wine_name: sanitizeCell(wine.wine_name),
        vintage: wine.vintage,
        color: sanitizeCell(wine.color),
        varietal: sanitizeCell(wine.varietal),
        country: sanitizeCell(wine.country),
        region: sanitizeCell(wine.region),
        sub_region: sanitizeCell(wine.sub_region),
        appellation: sanitizeCell(wine.appellation),
        wine_type: sanitizeCell(wine.wine_type),
        category: sanitizeCell(wine.category),
        designation: sanitizeCell(wine.designation),
        vineyard: sanitizeCell(wine.vineyard),
        drink_window_start: wine.drink_window_start,
        drink_window_end: wine.drink_window_end,
        ct_community_score: wine.ct_community_score,
        bottle_count: Number(wine.bottle_count),
        total_value: Number(wine.total_value),
      });
    }

    const bottleSheet = workbook.addWorksheet("Bottles");
    bottleSheet.columns = [
      { header: "Producer", key: "producer", width: 25 },
      { header: "Wine Name", key: "wine_name", width: 30 },
      { header: "Vintage", key: "vintage", width: 10 },
      { header: "Color", key: "color", width: 12 },
      { header: "Varietal", key: "varietal", width: 25 },
      { header: "Country", key: "country", width: 18 },
      { header: "Region", key: "region", width: 20 },
      { header: "Status", key: "status", width: 12 },
      { header: "Location", key: "location", width: 18 },
      { header: "Size", key: "size", width: 10 },
      { header: "Purchase Date", key: "purchase_date", width: 14 },
      { header: "Purchase Price", key: "purchase_price", width: 14 },
      { header: "Estimated Value", key: "estimated_value", width: 14 },
      { header: "Consumed Date", key: "consumed_date", width: 14 },
      { header: "Rating", key: "rating", width: 8 },
      { header: "Notes", key: "notes", width: 30 },
    ];

    bottleSheet.getRow(1).eachCell((cell) => {
      cell.style = headerStyle as ExcelJS.Style;
    });

    for (const bottle of bottles) {
      bottleSheet.addRow({
        producer: sanitizeCell(bottle.producer),
        wine_name: sanitizeCell(bottle.wine_name),
        vintage: bottle.vintage,
        color: sanitizeCell(bottle.color),
        varietal: sanitizeCell(bottle.varietal),
        country: sanitizeCell(bottle.country),
        region: sanitizeCell(bottle.region),
        status: sanitizeCell(bottle.status),
        location: sanitizeCell(bottle.location),
        size: sanitizeCell(bottle.size),
        purchase_date: bottle.purchase_date,
        purchase_price: bottle.purchase_price,
        estimated_value: bottle.estimated_value,
        consumed_date: bottle.consumed_date,
        rating: bottle.rating,
        notes: sanitizeCell(bottle.notes),
      });
    }

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=vin-cellar-export.xlsx");

    await workbook.xlsx.write(res);
    res.end();
  });

  const SYSTEM_PROMPT = `Your name is Cru. You are the user's personal sommelier — knowledgeable, warm, and opinionated in a charming way. You speak with quiet confidence, like a trusted friend who happens to know wine deeply. You never lecture; you suggest, nudge, and occasionally surprise. You manage the user's wine cellar through the Vin app. You have direct access to their wine database and can search, add, update, and track wines and bottles.

Your personality:
- Warm, knowledgeable, and conversational — like a trusted wine advisor
- Share brief, relevant wine knowledge when appropriate (pairings, regions, aging)
- Be concise but helpful — this is a mobile chat interface
- When recommending wines, explain your reasoning briefly but naturally — don't list factors like a formula
- Use the tools proactively to answer questions accurately — always check the database rather than guessing

Conversational approach:
Your default mode is to engage with what the user is already talking about. If they mention a specific wine, ask about a bottle they're considering, or want to discuss something in their cellar — talk about THAT wine. Share knowledge, tasting notes, food pairings, or drinking window advice for the wine at hand. Do NOT immediately pivot to searching the cellar or pulling up alternatives unless the user explicitly asks for a recommendation or a comparison.

How to recommend wines (only when asked):
When the user explicitly asks for a recommendation ("what should I drink?", "pick something for tonight", etc.), think through these layers in order — but present only the conclusion, not the reasoning chain. **Never recommend more than 3 wines** — usually 1 is best, with a brief mention of an alternative if relevant.

1. **User context first**: If the user mentions food, an occasion, guests, or a mood — that's your primary signal. Lead with it.
2. **Their taste**: Use get_consumption_history and get_cellar_stats to understand what they drink most, what they rate highly, and what styles they gravitate toward. A recommendation should feel personal, not generic.
3. **Seasonality & location**: Consider the time of year and where the user is. A crisp white or rosé on a summer evening, a bold red on a winter night — let this inform your pick naturally without announcing it. You know the current date and may have GPS coordinates.
4. **Weather** (subtle): If the user hasn't given you much to work with (no food, no occasion), you may silently check the weather using get_weather to refine your pick. But do NOT lead with "I checked the weather and..." — just let it shape your suggestion naturally. Only mention weather explicitly if the user brings it up, or if conditions are extreme/noteworthy enough to be a fun detail (e.g., "perfect night for it — it's gorgeous out").
5. **Drink window & value**: Always factor in which wines are in their prime or approaching peak. Prefer wines that are ready now over those that could wait.

Use get_recommendations with appropriate criteria (ready_to_drink, past_peak, highest_rated, best_value, by_color) to pull candidates, then apply your judgment to pick the best one given all the context above. Don't just echo back the top-rated result — curate.

Key behaviors:
- When the user mentions drinking a wine, use consume_bottle to record it immediately — do NOT ask for rating, occasion, food pairing, or other details unless the user volunteers them. Just remove it from the cellar. If the user provides extra details (rating, notes, etc.), include them, but never prompt for them.
- For search queries, use search_wines and present results clearly.
- If asked about cellar overview/stats, use get_cellar_stats.
- When adding wines, confirm the details before using add_wine.
- When the user shares a photo of a wine bottle, analyze the label carefully. Extract: wine name, producer, vintage, region, varietal, and any other visible details. Present what you found and ask the user to confirm the details before adding it to the cellar. If you can't read certain details clearly, say so and ask the user to fill in the gaps.
- Format responses for mobile readability — use short paragraphs, not long blocks.
- If the user asks about importing wines from CellarTracker, let them know they can use the CSV import feature on the Add tab.
- If the user made a mistake logging a consumption, use undo_consumption to reverse it.
- **Ask before you guess**: When the user's request is vague or missing key details you need to make a good recommendation, ask a brief follow-up question rather than guessing. For example: "What are you having for dinner?" or "Red or white tonight?" or "Any budget in mind?" Keep follow-ups to one short question — don't bombard them with a list of questions. If you already have enough context from their history, memories, or the current conversation, skip the question and just recommend.

Memory:
You have a long-term memory that persists across conversations. Use it wisely:
- Save preferences, tastes, habits, and personal details that would help future recommendations (e.g., "prefers Burgundy over Bordeaux", "partner Sarah doesn't like tannic wines", "usually drinks wine Friday evenings").
- Save quietly — don't announce "I'll remember that!" every time. Just save it and move on naturally. Occasionally you can acknowledge it warmly if the user shares something personal ("noted" or weaving it in naturally).
- When you notice something worth remembering, use save_memory. One concise fact per memory.
- If a user corrects a previous preference, update or delete the old memory.
- Use your memories to personalize naturally — "since you've been on a Pinot kick..." rather than "according to my records..."
- If a user asks what you remember about them, you can share your memories conversationally.

App navigation (to help users find what they need):
- Cellar tab: browse, search, and filter the full wine inventory
- Add tab (+ button): scan a wine label with the camera or enter details manually
- Cru tab: this AI chat interface
- History tab: view all consumed bottles, tasting logs, and consumption stats
- Settings tab: account info, Face ID, storage locations, CSV import/export

Data model:
- Wine: producer, wine name, vintage, color, varietal, country, region, appellation, drink window (start/end year), community score
- Bottle: belongs to a wine, has location, purchase price, estimated value, notes, and status (in_cellar or consumed)
- Consumption log: records date, occasion, food pairing, who shared with, rating (1–5 stars), and tasting notes

Common workflows:
- Add a wine: use add_wine (creates the wine record and initial bottles in one call)
- Add more bottles of an existing wine: use add_bottles
- Log drinking a bottle: use consume_bottle with the bottle_id — search for the wine first if the ID is unknown
- Find something to drink: use get_recommendations (try multiple criteria), get_consumption_history (to understand taste), and optionally get_weather — then curate a personal pick
- View drinking history: use get_consumption_history
- Organize storage: use get_storage_locations to see racks/fridges, then update_bottle to move bottles
- Undo a logged consumption: use undo_consumption with the bottle_id

Current date: ${new Date().toISOString().split("T")[0]}`;

  app.post("/api/analyze-wine-image", requireAuth, async (req: AuthRequest, res: Response) => {
    if (!checkAiRateLimit(req.userId!)) {
      return res.status(429).json({ error: getCruRateLimitMessage() });
    }
    try {
      const { image, mimeType } = req.body;
      if (!image) {
        return res.status(400).json({ error: "image (base64) required" });
      }

      const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
      const mediaType = allowedTypes.includes(mimeType) ? mimeType : "image/jpeg";

      const response = await callAnthropic({
        model: "claude-sonnet-4-6",
        max_tokens: 2048,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
                  data: image,
                },
              },
              {
                type: "text",
                text: `Analyze this wine bottle label and extract all visible information. Return ONLY valid JSON with these fields (use empty string "" for anything you can't determine):

{
  "producer": "winery/producer name",
  "wine_name": "wine name or cuvée",
  "vintage": "year as string or empty",
  "color": "one of: Red, White, Rosé, Sparkling, Dessert, Fortified",
  "country": "country of origin",
  "region": "wine region",
  "sub_region": "sub-region if visible",
  "appellation": "appellation if visible",
  "varietal": "grape variety/varieties",
  "designation": "reserve/grand cru/etc if visible",
  "vineyard": "vineyard name if visible",
  "size": "bottle size if visible, default 750ml",
  "estimated_value": "estimated retail price in USD as a number (no $ sign), based on the wine identified. Use your knowledge of typical retail pricing. Return 0 if uncertain."
}

Be accurate — only include what you can clearly read from the label. For color, infer from the wine type/varietal if not explicitly stated.`,
              },
            ],
          },
        ],
      });

      const textBlock = response.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        return res.status(500).json({ error: "No response from AI" });
      }

      const defaults: Record<string, string | number> = {
        producer: "", wine_name: "", vintage: "", color: "Red",
        country: "", region: "", sub_region: "", appellation: "",
        varietal: "", designation: "", vineyard: "", size: "750ml",
        estimated_value: 0,
      };

      let wineData = { ...defaults };
      try {
        const jsonMatch = textBlock.text.match(/\{[\s\S]*?\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          for (const key of Object.keys(defaults)) {
            if (parsed[key] !== undefined && parsed[key] !== null && parsed[key] !== "") {
              wineData[key] = parsed[key];
            }
          }
        }
      } catch {
      }
      if (!wineData.estimated_value) {
        console.warn("[analyze-wine-image] estimated_value missing from AI response");
      }
      res.json(wineData);
    } catch (err: any) {
      console.error("Wine image analysis error:", err);
      res.status(500).json({ error: "Failed to analyze wine image" });
    }
  });

  const MAX_TOOL_ITERATIONS = 12;

  app.post("/api/chat", requireAuth, async (req: AuthRequest, res: Response) => {
    if (!checkAiRateLimit(req.userId!)) {
      return res.status(429).json({ error: getCruRateLimitMessage() });
    }
    let clientDisconnected = false;
    res.on("close", () => {
      clientDisconnected = true;
    });

    const CHAT_TIMEOUT_MS = 90_000;
    const chatTimeout = setTimeout(() => {
      if (!clientDisconnected && res.headersSent) {
        res.write(`data: ${JSON.stringify({ content: "\n\nI'm sorry, this request took too long. Please try again with a simpler question." })}\n\n`);
        res.write("data: [DONE]\n\n");
        res.end();
        clientDisconnected = true;
      }
    }, CHAT_TIMEOUT_MS);

    try {
      const { messages: chatMessages, location } = req.body;
      if (!chatMessages || !Array.isArray(chatMessages)) {
        clearTimeout(chatTimeout);
        return res.status(400).json({ error: "messages array required" });
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("X-Accel-Buffering", "no");
      res.setHeader("Connection", "keep-alive");
      (res.socket as any)?.setNoDelay?.(true);
      res.flushHeaders();
      res.write(":ok\n\n");

      const userRow = await pool.query("SELECT display_name, email FROM users WHERE id = $1", [req.userId]);
      const userRecord = userRow.rows[0];
      const userName = userRecord?.display_name || userRecord?.email?.split("@")[0] || null;

      let systemPrompt = SYSTEM_PROMPT;
      if (userName) {
        systemPrompt += `\n\nThe user's name is ${userName}. Use their name naturally in conversation when appropriate.`;
      }
      if (location && location.latitude && location.longitude) {
        systemPrompt += `\n\nUser's current GPS coordinates: latitude ${location.latitude}, longitude ${location.longitude}. These are available if you decide to use the get_weather tool — pass them as latitude/longitude parameters. You can also reverse-geocode to determine the city/region.`;
      }

      // Load user's Cru memories
      const memories = await getUserMemories(req.userId!);
      if (memories.length > 0) {
        systemPrompt += `\n\nYour memories about this user (use these to personalize your responses — reference them naturally, never list them out):\n${memories.join("\n")}`;
      }

      const allowedImageTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
      const anthropicMessages: Anthropic.MessageParam[] = chatMessages.map((m: any) => {
        if (m.role === "user" && m.image) {
          const mimeType = allowedImageTypes.includes(m.mimeType) ? m.mimeType : "image/jpeg";
          const contentBlocks: Anthropic.ContentBlockParam[] = [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mimeType as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
                data: m.image,
              },
            },
          ];
          if (m.content) {
            contentBlocks.push({ type: "text", text: m.content });
          }
          return { role: "user" as const, content: contentBlocks };
        }
        if (m.role === "user" && m.hadImage) {
          return {
            role: "user" as const,
            content: `[Previously shared a wine bottle photo] ${m.content || ""}`.trim(),
          };
        }
        return {
          role: m.role as "user" | "assistant",
          content: m.content,
        };
      });

      let iterations = 0;
      let continueLoop = true;
      let candidateWineCards: any[] = [];
      let fullTextResponse = "";

      while (continueLoop && iterations < MAX_TOOL_ITERATIONS && !clientDisconnected) {
        iterations++;
        const response = await callAnthropic({
          model: "claude-sonnet-4-6",
          max_tokens: 4096,
          system: systemPrompt,
          tools: CELLAR_TOOLS,
          messages: anthropicMessages,
        });

        if (clientDisconnected) break;

        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const block of response.content) {
          if (clientDisconnected) break;
          if (block.type === "text" && block.text) {
            fullTextResponse += block.text;
            res.write(`data: ${JSON.stringify({ content: block.text })}\n\n`);
          } else if (block.type === "tool_use") {
            res.write(`data: ${JSON.stringify({ tool_call: block.name })}\n\n`);
            const result = await executeTool(block.name, block.input, (req as AuthRequest).userId);
            if (block.name === "consume_bottle") {
              try {
                const parsed = JSON.parse(result);
                if (parsed.success) {
                  res.write(`data: ${JSON.stringify({ consumption_completed: { bottle_id: (block.input as any).bottle_id, message: parsed.message } })}\n\n`);
                }
              } catch {}
            }
            // Accumulate wine cards as candidates (sent after final text)
            if (block.name === "search_wines" || block.name === "get_recommendations") {
              try {
                const parsed = JSON.parse(result);
                const wines = parsed.wines || parsed.recommendations || [];
                const cards = wines.map((w: any) => ({
                  id: w.id,
                  producer: w.producer,
                  wine_name: w.wine_name,
                  vintage: w.vintage,
                  color: w.color,
                  region: w.region,
                  varietal: w.varietal,
                  score: w.ct_community_score,
                  bottle_count: Number(w.bottle_count || 0),
                }));
                candidateWineCards.push(...cards);
              } catch {}
            }
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: result,
            });
          }
        }

        if (toolResults.length > 0) {
          anthropicMessages.push({ role: "assistant", content: response.content });
          anthropicMessages.push({ role: "user", content: toolResults });
        } else {
          continueLoop = false;
        }
      }

      // Filter wine cards to only those mentioned in the text response
      if (candidateWineCards.length > 0 && fullTextResponse.length > 0) {
        const textLower = fullTextResponse.toLowerCase();
        const matchedCards = candidateWineCards.filter((card: any) => {
          const producerMatch = card.producer && textLower.includes(card.producer.toLowerCase());
          const nameMatch = card.wine_name && textLower.includes(card.wine_name.toLowerCase());
          return producerMatch || nameMatch;
        });
        const cardsToSend = matchedCards.length > 0 ? matchedCards.slice(0, 3) : [];
        if (cardsToSend.length > 0) {
          res.write(`data: ${JSON.stringify({ wine_cards: cardsToSend })}\n\n`);
        }
      }

      clearTimeout(chatTimeout);
      if (!clientDisconnected) {
        if (iterations >= MAX_TOOL_ITERATIONS) {
          res.write(`data: ${JSON.stringify({ content: "\n\nI needed to look up quite a few things. Let me know if you need more details!" })}\n\n`);
        }
        res.write("data: [DONE]\n\n");
        res.end();
      }
    } catch (error: any) {
      clearTimeout(chatTimeout);
      console.error("Chat error:", error);
      if (clientDisconnected) return;
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: "Something went wrong. Please try again." })}\n\n`);
        res.write("data: [DONE]\n\n");
        res.end();
      } else {
        res.status(500).json({ error: "Chat failed" });
      }
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
