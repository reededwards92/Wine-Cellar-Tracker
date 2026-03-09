import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import db from "./db";
import multer from "multer";
import { parse } from "csv-parse/sync";
import iconv from "iconv-lite";
import Anthropic from "@anthropic-ai/sdk";
import ExcelJS from "exceljs";
import { CELLAR_TOOLS, executeTool } from "./ai-tools";
import { requireAuth, type AuthRequest } from "./auth";

async function callAnthropic(params: {
  model: string;
  max_tokens: number;
  system?: string;
  tools?: Anthropic.Tool[];
  messages: Anthropic.MessageParam[];
}): Promise<Anthropic.Message> {
  const rawBaseURL = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL || "https://api.anthropic.com";
  const baseURL = rawBaseURL.replace("localhost", "127.0.0.1");
  const apiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || "";
  const url = `${baseURL}/v1/messages`;
  const body = JSON.stringify(params);

  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === "https:";
    const transport = isHttps ? require("https") : require("http");
    const defaultPort = isHttps ? 443 : 80;

    const req = transport.request({
      hostname: parsed.hostname,
      port: parsed.port ? parseInt(parsed.port) : defaultPort,
      path: parsed.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Length": Buffer.byteLength(body),
      },
      timeout: 60000,
    }, (res: any) => {
      let data = "";
      res.on("data", (chunk: any) => { data += chunk; });
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error("Failed to parse AI response"));
          }
        } else {
          reject(new Error(`Anthropic API error ${res.statusCode}: ${data.substring(0, 200)}`));
        }
      });
    });

    req.on("timeout", () => req.destroy(new Error("Request timed out")));
    req.on("error", (e: any) => reject(e));
    req.write(body);
    req.end();
  });
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

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

export async function registerRoutes(app: Express): Promise<Server> {

  app.get("/api/stats", requireAuth, (req: AuthRequest, res: Response) => {
    const userId = req.userId;
    const stats = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM bottles WHERE status = 'in_cellar' AND user_id = ?) as total_bottles,
        (SELECT COALESCE(SUM(estimated_value), 0) FROM bottles WHERE status = 'in_cellar' AND user_id = ?) as total_value,
        (SELECT COUNT(DISTINCT wine_id) FROM bottles WHERE status = 'in_cellar' AND user_id = ?) as unique_wines,
        (SELECT COUNT(*) FROM bottles WHERE status = 'consumed' AND user_id = ?) as consumed_bottles
    `).get(userId, userId, userId, userId) as any;
    res.json(stats);
  });

  app.get("/api/wines", requireAuth, (req: AuthRequest, res: Response) => {
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
    } = req.query;

    let whereClauses: string[] = ["w.user_id = ?"];
    let params: any[] = [userId];

    if (color) {
      const colors = (color as string).split(",");
      whereClauses.push(`w.color IN (${colors.map(() => "?").join(",")})`);
      params.push(...colors);
    }
    if (region) {
      whereClauses.push("w.region = ?");
      params.push(region);
    }
    if (country) {
      whereClauses.push("w.country = ?");
      params.push(country);
    }
    if (varietal) {
      whereClauses.push("w.varietal LIKE ?");
      params.push(`%${varietal}%`);
    }
    if (search) {
      whereClauses.push(
        "(w.producer LIKE ? OR w.wine_name LIKE ? OR w.varietal LIKE ? OR w.region LIKE ? OR w.appellation LIKE ?)"
      );
      const s = `%${search}%`;
      params.push(s, s, s, s, s);
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
      whereClauses.push(
        `w.id IN (SELECT b3.wine_id FROM bottles b3 WHERE b3.status = 'in_cellar' AND b3.user_id = ? AND b3.location IN (${locs.map(() => "?").join(",")}))`
      );
      params.push(userId, ...locs);
    }

    const havingClauses: string[] = [];
    if (inStock === "true") {
      havingClauses.push("bottle_count > 0");
    }
    if (minValue) {
      havingClauses.push("avg_value >= ?");
      params.push(parseFloat(minValue as string));
    }
    if (maxValue) {
      havingClauses.push("avg_value <= ?");
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
      ORDER BY ${sortCol} ${sortOrder}
    `;

    const wines = db.prepare(query).all(...params);
    res.json(wines);
  });

  app.get("/api/wines/:id", requireAuth, (req: AuthRequest, res: Response) => {
    const wine = db.prepare("SELECT * FROM wines WHERE id = ? AND user_id = ?").get(req.params.id, req.userId);
    if (!wine) return res.status(404).json({ error: "Wine not found" });
    const bottles = db.prepare("SELECT * FROM bottles WHERE wine_id = ? AND user_id = ? ORDER BY created_at DESC").all(req.params.id, req.userId);
    res.json({ ...(wine as any), bottles });
  });

  app.post("/api/wines", requireAuth, (req: AuthRequest, res: Response) => {
    const userId = req.userId;
    const { quantity = 1, purchase_date, purchase_price, estimated_value, location, size, notes, ...wineData } = req.body;

    const wineInsert = db.prepare(`
      INSERT INTO wines (producer, wine_name, vintage, country, region, sub_region, appellation, varietal, color, wine_type, category, designation, vineyard, drink_window_start, drink_window_end, ct_community_score, critic_scores, user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = wineInsert.run(
      wineData.producer, wineData.wine_name, wineData.vintage || null,
      wineData.country || null, wineData.region || null, wineData.sub_region || null,
      wineData.appellation || null, wineData.varietal || null, wineData.color || null,
      wineData.wine_type || null, wineData.category || null, wineData.designation || null,
      wineData.vineyard || null, wineData.drink_window_start || null, wineData.drink_window_end || null,
      wineData.ct_community_score || null, wineData.critic_scores || null, userId
    );

    const wineId = result.lastInsertRowid;

    const bottleInsert = db.prepare(`
      INSERT INTO bottles (wine_id, purchase_date, purchase_price, estimated_value, location, size, notes, user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (let i = 0; i < (quantity || 1); i++) {
      bottleInsert.run(wineId, purchase_date || null, purchase_price || null, estimated_value || null, location || null, size || "750ml", notes || null, userId);
    }

    const wine = db.prepare("SELECT * FROM wines WHERE id = ?").get(wineId);
    res.status(201).json(wine);
  });

  app.put("/api/wines/:id", requireAuth, (req: AuthRequest, res: Response) => {
    const wine = db.prepare("SELECT * FROM wines WHERE id = ? AND user_id = ?").get(req.params.id, req.userId);
    if (!wine) return res.status(404).json({ error: "Wine not found" });

    const fields = ["producer", "wine_name", "vintage", "country", "region", "sub_region", "appellation", "varietal", "color", "wine_type", "category", "designation", "vineyard", "drink_window_start", "drink_window_end", "ct_community_score", "critic_scores"];
    const updates: string[] = [];
    const values: any[] = [];

    for (const field of fields) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = ?`);
        values.push(req.body[field]);
      }
    }

    if (updates.length > 0) {
      updates.push("updated_at = CURRENT_TIMESTAMP");
      values.push(req.params.id);
      db.prepare(`UPDATE wines SET ${updates.join(", ")} WHERE id = ?`).run(...values);
    }

    const updated = db.prepare("SELECT * FROM wines WHERE id = ?").get(req.params.id);
    res.json(updated);
  });

  app.post("/api/wines/:id/bottles", requireAuth, (req: AuthRequest, res: Response) => {
    const wine = db.prepare("SELECT * FROM wines WHERE id = ? AND user_id = ?").get(req.params.id, req.userId);
    if (!wine) return res.status(404).json({ error: "Wine not found" });

    const { quantity = 1, purchase_date, purchase_price, estimated_value, location, size, notes } = req.body;

    const bottleInsert = db.prepare(`
      INSERT INTO bottles (wine_id, purchase_date, purchase_price, estimated_value, location, size, notes, user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (let i = 0; i < quantity; i++) {
      bottleInsert.run(req.params.id, purchase_date || null, purchase_price || null, estimated_value || null, location || null, size || "750ml", notes || null, req.userId);
    }

    res.status(201).json({ message: `Added ${quantity} bottle(s)` });
  });

  app.put("/api/bottles/:id", requireAuth, (req: AuthRequest, res: Response) => {
    const bottle = db.prepare("SELECT * FROM bottles WHERE id = ? AND user_id = ?").get(req.params.id, req.userId);
    if (!bottle) return res.status(404).json({ error: "Bottle not found" });

    const fields = ["purchase_date", "purchase_price", "estimated_value", "location", "size", "notes", "status"];
    const updates: string[] = [];
    const values: any[] = [];

    for (const field of fields) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = ?`);
        values.push(req.body[field]);
      }
    }

    if (updates.length > 0) {
      values.push(req.params.id);
      db.prepare(`UPDATE bottles SET ${updates.join(", ")} WHERE id = ?`).run(...values);
    }

    const updated = db.prepare("SELECT * FROM bottles WHERE id = ?").get(req.params.id);
    res.json(updated);
  });

  app.patch("/api/bottles/:id/consume", requireAuth, (req: AuthRequest, res: Response) => {
    const bottle = db.prepare("SELECT * FROM bottles WHERE id = ? AND user_id = ?").get(req.params.id, req.userId) as any;
    if (!bottle) return res.status(404).json({ error: "Bottle not found" });

    const { consumed_date, occasion, paired_with, who_with, rating, tasting_notes } = req.body;
    const consumeDate = consumed_date || new Date().toISOString().split("T")[0];

    db.prepare(`UPDATE bottles SET status = 'consumed', consumed_date = ?, occasion = ?, rating = ? WHERE id = ?`)
      .run(consumeDate, occasion || null, rating || null, req.params.id);

    db.prepare(`
      INSERT INTO consumption_log (bottle_id, wine_id, consumed_date, occasion, paired_with, who_with, rating, tasting_notes, user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(req.params.id, bottle.wine_id, consumeDate, occasion || null, paired_with || null, who_with || null, rating || null, tasting_notes || null, req.userId);

    res.json({ message: "Bottle consumed" });
  });

  app.get("/api/consumption", requireAuth, (req: AuthRequest, res: Response) => {
    const logs = db.prepare(`
      SELECT cl.*, w.producer, w.wine_name, w.vintage, w.color, w.varietal, w.region,
        w.sub_region, w.appellation, w.ct_community_score, w.drink_window_start, w.drink_window_end,
        b.purchase_price, b.estimated_value, b.location AS bottle_location
      FROM consumption_log cl
      JOIN wines w ON cl.wine_id = w.id
      LEFT JOIN bottles b ON cl.bottle_id = b.id
      WHERE cl.user_id = ?
      ORDER BY cl.consumed_date DESC
    `).all(req.userId);
    res.json(logs);
  });

  app.get("/api/consumption/stats", requireAuth, (req: AuthRequest, res: Response) => {
    const userId = req.userId;

    const totals = db.prepare(`
      SELECT
        COUNT(*) as totalBottles,
        COALESCE(SUM(COALESCE(b.estimated_value, b.purchase_price, 0)), 0) as totalValue
      FROM consumption_log cl
      LEFT JOIN bottles b ON cl.bottle_id = b.id
      WHERE cl.user_id = ?
    `).get(userId) as any;

    const colorBreakdown = db.prepare(`
      SELECT w.color, COUNT(*) as count
      FROM consumption_log cl
      JOIN wines w ON cl.wine_id = w.id
      WHERE cl.user_id = ? AND w.color IS NOT NULL
      GROUP BY w.color
      ORDER BY count DESC
    `).all(userId) as any[];

    const monthlyRaw = db.prepare(`
      SELECT
        strftime('%Y-%m', cl.consumed_date) as month,
        COUNT(*) as count
      FROM consumption_log cl
      WHERE cl.user_id = ? AND cl.consumed_date IS NOT NULL
      GROUP BY month
      ORDER BY month ASC
    `).all(userId) as any[];

    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    let monthlyTrend: any[] = [];

    if (monthlyRaw.length > 0) {
      const first = monthlyRaw[0].month;
      const last = monthlyRaw[monthlyRaw.length - 1].month;
      const countMap = new Map(monthlyRaw.map((r: any) => [r.month, r.count]));

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

    res.json({
      totalBottles: totals.totalBottles,
      totalGlasses: totals.totalBottles * 5,
      totalValue: Math.round(totals.totalValue * 100) / 100,
      colorBreakdown,
      monthlyTrend,
    });
  });

  app.delete("/api/consumption", requireAuth, (req: AuthRequest, res: Response) => {
    const userId = req.userId;
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "ids array required" });
    }

    const placeholders = ids.map(() => "?").join(",");
    const entries = db.prepare(
      `SELECT id, bottle_id FROM consumption_log WHERE id IN (${placeholders}) AND user_id = ?`
    ).all(...ids, userId) as any[];

    if (entries.length === 0) {
      return res.status(404).json({ error: "No matching entries found" });
    }

    const deleteEntries = db.transaction(() => {
      db.prepare(
        `DELETE FROM consumption_log WHERE id IN (${placeholders}) AND user_id = ?`
      ).run(...ids, userId);

      for (const entry of entries) {
        if (entry.bottle_id) {
          db.prepare(
            `DELETE FROM bottles WHERE id = ? AND user_id = ? AND status = 'consumed'`
          ).run(entry.bottle_id, userId);
        }
      }
    });

    deleteEntries();
    res.json({ deleted: entries.length });
  });

  app.get("/api/filters", requireAuth, (req: AuthRequest, res: Response) => {
    const userId = req.userId;
    const colors = db.prepare("SELECT DISTINCT color FROM wines WHERE color IS NOT NULL AND user_id = ? ORDER BY color").all(userId);
    const regions = db.prepare("SELECT DISTINCT region FROM wines WHERE region IS NOT NULL AND user_id = ? ORDER BY region").all(userId);
    const countries = db.prepare("SELECT DISTINCT country FROM wines WHERE country IS NOT NULL AND user_id = ? ORDER BY country").all(userId);
    const varietals = db.prepare("SELECT DISTINCT varietal FROM wines WHERE varietal IS NOT NULL AND user_id = ? ORDER BY varietal").all(userId);
    const locations = db.prepare("SELECT DISTINCT location FROM bottles WHERE location IS NOT NULL AND status = 'in_cellar' AND user_id = ? ORDER BY location").all(userId);
    res.json({
      colors: (colors as any[]).map((c) => c.color),
      regions: (regions as any[]).map((r) => r.region),
      countries: (countries as any[]).map((c) => c.country),
      locations: (locations as any[]).map((l) => l.location),
      varietals: (varietals as any[]).map((v) => v.varietal),
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
    const insertWine = db.prepare(`
      INSERT INTO wines (ct_wine_id, producer, wine_name, vintage, country, region, sub_region, appellation, varietal, color, wine_type, category, designation, vineyard, drink_window_start, drink_window_end, ct_community_score, user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertBottle = db.prepare(`
      INSERT INTO bottles (wine_id, ct_inventory_id, ct_barcode, purchase_date, purchase_price, estimated_value, location, size, user_id, status, consumed_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertConsumption = db.prepare(`
      INSERT INTO consumption_log (bottle_id, wine_id, consumed_date, user_id)
      VALUES (?, ?, ?, ?)
    `);

    const winesByCtId = new Map<string, number>();
    const findWineByCt = db.prepare("SELECT id FROM wines WHERE ct_wine_id = ? AND user_id = ?");
    const findBottleByCt = db.prepare("SELECT id FROM bottles WHERE ct_inventory_id = ? AND user_id = ?");

    const importAll = db.transaction(() => {
      for (let i = 0; i < records.length; i++) {
        const row = records[i];
        try {
          if (isCellarTracker) {
            const ctInventoryId = parseInteger(row.iInventory);
            if (ctInventoryId) {
              const existingBottle = findBottleByCt.get(ctInventoryId, userId);
              if (existingBottle) {
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
              const existingWine = findWineByCt.get(ctWineId, userId) as any;
              if (existingWine) {
                wineId = existingWine.id;
                winesByCtId.set(String(ctWineId), wineId);
              } else {
                const result = insertWine.run(
                  ctWineId,
                  producer,
                  wineName,
                  parseInteger(row.Vintage),
                  cleanValue(row.Country),
                  cleanValue(row.Region),
                  cleanValue(row.SubRegion),
                  cleanValue(row.Appellation),
                  cleanValue(row.Varietal),
                  cleanValue(row.Color),
                  cleanValue(row.Type),
                  cleanValue(row.Category),
                  cleanValue(row.Designation),
                  cleanValue(row.Vineyard),
                  parseInteger(row.BeginConsume),
                  parseInteger(row.EndConsume),
                  parseNumber(row.CScore),
                  userId
                );
                wineId = Number(result.lastInsertRowid);
                winesByCtId.set(String(ctWineId), wineId);
                winesCreated++;
              }
            } else {
              const result = insertWine.run(
                null,
                producer,
                wineName,
                parseInteger(row.Vintage),
                cleanValue(row.Country),
                cleanValue(row.Region),
                cleanValue(row.SubRegion),
                cleanValue(row.Appellation),
                cleanValue(row.Varietal),
                cleanValue(row.Color),
                cleanValue(row.Type),
                cleanValue(row.Category),
                cleanValue(row.Designation),
                cleanValue(row.Vineyard),
                parseInteger(row.BeginConsume),
                parseInteger(row.EndConsume),
                parseNumber(row.CScore),
                userId
              );
              wineId = Number(result.lastInsertRowid);
              winesCreated++;
            }

            const price = parseNumber(row.Price);
            const barcode = cleanValue(row.Barcode) || cleanValue(row.WineBarcode);
            const consumedDate = parseDate(row.Consumed) || parseDate(row.ConsumeDate);
            const isConsumed = !!consumedDate;

            const bottleResult = insertBottle.run(
              wineId,
              parseInteger(row.iInventory),
              barcode,
              parseDate(row.PurchaseDate),
              price && price > 0 ? price : null,
              parseNumber(row.Value),
              cleanValue(row.Location),
              cleanValue(row.Size) || "750ml",
              userId,
              isConsumed ? "consumed" : "in_cellar",
              consumedDate
            );
            bottlesCreated++;

            if (isConsumed) {
              const bottleId = Number(bottleResult.lastInsertRowid);
              insertConsumption.run(bottleId, wineId, consumedDate, userId);
              consumedCount++;
            }
          } else {
            const producer = getField(row, mapping.producer) || "Unknown";
            const wineName = getField(row, mapping.wine_name) || "Unknown";
            const quantity = mapping.quantity ? (parseInteger(row[mapping.quantity]) || 1) : 1;

            const result = insertWine.run(
              null,
              producer,
              wineName,
              mapping.vintage ? parseInteger(row[mapping.vintage]) : null,
              getField(row, mapping.country),
              getField(row, mapping.region),
              getField(row, mapping.sub_region),
              getField(row, mapping.appellation),
              getField(row, mapping.varietal),
              getField(row, mapping.color),
              getField(row, mapping.wine_type),
              getField(row, mapping.category),
              getField(row, mapping.designation),
              getField(row, mapping.vineyard),
              mapping.drink_window_start ? parseInteger(row[mapping.drink_window_start]) : null,
              mapping.drink_window_end ? parseInteger(row[mapping.drink_window_end]) : null,
              mapping.score ? parseNumber(row[mapping.score]) : null,
              userId
            );
            const wineId = Number(result.lastInsertRowid);
            winesCreated++;

            for (let q = 0; q < quantity; q++) {
              const price = mapping.price ? parseNumber(row[mapping.price]) : null;
              const consumedDate = mapping.consumed_date ? parseDate(row[mapping.consumed_date]) : null;
              const isConsumed = !!consumedDate;

              const bottleResult = insertBottle.run(
                wineId,
                null,
                null,
                mapping.purchase_date ? parseDate(row[mapping.purchase_date]) : null,
                price && price > 0 ? price : null,
                mapping.value ? parseNumber(row[mapping.value]) : null,
                getField(row, mapping.location),
                getField(row, mapping.size) || "750ml",
                userId,
                isConsumed ? "consumed" : "in_cellar",
                consumedDate
              );
              bottlesCreated++;

              if (isConsumed) {
                const bottleId = Number(bottleResult.lastInsertRowid);
                insertConsumption.run(bottleId, wineId, consumedDate, userId);
                consumedCount++;
              }
            }
          }
        } catch (err: any) {
          errors.push(`Row ${i + 1}: ${err.message}`);
        }
      }
    });

    try {
      importAll();
    } catch (err: any) {
      return res.status(500).json({ error: `Import failed: ${err.message}` });
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

    const wines = db.prepare(`
      SELECT w.*,
        COUNT(CASE WHEN b.status = 'in_cellar' THEN 1 END) as bottle_count,
        COALESCE(SUM(CASE WHEN b.status = 'in_cellar' THEN b.estimated_value END), 0) as total_value
      FROM wines w
      LEFT JOIN bottles b ON w.id = b.wine_id AND b.user_id = w.user_id
      WHERE w.user_id = ?
      GROUP BY w.id
      ORDER BY w.producer ASC
    `).all(userId) as any[];

    const bottles = db.prepare(`
      SELECT b.*, w.producer, w.wine_name, w.vintage, w.color, w.varietal, w.region,
        w.country, w.sub_region, w.appellation, w.wine_type, w.category,
        w.designation, w.vineyard, w.drink_window_start, w.drink_window_end,
        w.ct_community_score
      FROM bottles b
      JOIN wines w ON b.wine_id = w.id
      WHERE b.user_id = ?
      ORDER BY w.producer ASC, b.created_at DESC
    `).all(userId) as any[];

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
        bottle_count: wine.bottle_count,
        total_value: wine.total_value,
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

  const SYSTEM_PROMPT = `You are a knowledgeable and personable sommelier who manages the user's wine cellar. You have direct access to their wine database and can search, add, update, and track wines and bottles.

Your personality:
- Warm, knowledgeable, and conversational — like a trusted wine advisor
- Share brief, relevant wine knowledge when appropriate (pairings, regions, aging)
- Be concise but helpful — this is a mobile chat interface
- When recommending wines, explain why briefly
- Use the tools proactively to answer questions accurately — always check the database rather than guessing

Key behaviors:
- When the user mentions drinking a wine, use consume_bottle to record it immediately — do NOT ask for rating, occasion, food pairing, or other details unless the user volunteers them. Just remove it from the cellar. If the user provides extra details (rating, notes, etc.), include them, but never prompt for them.
- When recommending wines, use get_recommendations. You have access to a get_weather tool — use it when weather context would genuinely help (e.g., the user asks what to drink tonight, mentions the weather, or you think conditions are relevant). But don't force weather into every recommendation — sometimes the user just wants your best pick regardless of conditions.
- If the user shares their location or mentions weather/climate, feel free to check conditions and factor them in naturally.
- For search queries, use search_wines and present results clearly.
- If asked about cellar overview/stats, use get_cellar_stats.
- When adding wines, confirm the details before using add_wine.
- When the user shares a photo of a wine bottle, analyze the label carefully. Extract: wine name, producer, vintage, region, varietal, and any other visible details. Present what you found and ask the user to confirm the details before adding it to the cellar. If you can't read certain details clearly, say so and ask the user to fill in the gaps.
- Format responses for mobile readability — use short paragraphs, not long blocks.
- If the user asks about importing wines from CellarTracker, let them know they can use the CSV import feature on the Add tab.

Current date: ${new Date().toISOString().split("T")[0]}`;

  app.post("/api/analyze-wine-image", requireAuth, async (req: AuthRequest, res: Response) => {
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
  "size": "bottle size if visible, default 750ml"
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

      const defaults = {
        producer: "", wine_name: "", vintage: "", color: "Red",
        country: "", region: "", sub_region: "", appellation: "",
        varietal: "", designation: "", vineyard: "", size: "750ml",
      };

      let wineData = { ...defaults };
      try {
        const jsonMatch = textBlock.text.match(/\{[\s\S]*?\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          for (const key of Object.keys(defaults)) {
            if (parsed[key] && typeof parsed[key] === "string") {
              wineData[key as keyof typeof defaults] = parsed[key];
            }
          }
        }
      } catch {
        // partial parse failed, return defaults
      }
      res.json(wineData);
    } catch (err: any) {
      console.error("Wine image analysis error:", err);
      res.status(500).json({ error: "Failed to analyze wine image" });
    }
  });

  const MAX_TOOL_ITERATIONS = 8;

  app.post("/api/chat", requireAuth, async (req: AuthRequest, res: Response) => {
    let clientDisconnected = false;
    res.on("close", () => {
      clientDisconnected = true;
    });

    try {
      const { messages: chatMessages, location } = req.body;
      if (!chatMessages || !Array.isArray(chatMessages)) {
        return res.status(400).json({ error: "messages array required" });
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("X-Accel-Buffering", "no");
      res.setHeader("Connection", "keep-alive");
      (res.socket as any)?.setNoDelay?.(true);
      res.flushHeaders();
      res.write(":ok\n\n");

      let systemPrompt = SYSTEM_PROMPT;
      if (location && location.latitude && location.longitude) {
        systemPrompt += `\n\nUser's current GPS coordinates: latitude ${location.latitude}, longitude ${location.longitude}. These are available if you decide to use the get_weather tool — pass them as latitude/longitude parameters. You can also reverse-geocode to determine the city/region.`;
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
            res.write(`data: ${JSON.stringify({ content: block.text })}\n\n`);
          } else if (block.type === "tool_use") {
            res.write(`data: ${JSON.stringify({ tool_call: block.name })}\n\n`);
            const result = await executeTool(block.name, block.input, (req as AuthRequest).userId);
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

      if (!clientDisconnected) {
        if (iterations >= MAX_TOOL_ITERATIONS) {
          res.write(`data: ${JSON.stringify({ content: "\n\nI needed to look up quite a few things. Let me know if you need more details!" })}\n\n`);
        }
        res.write("data: [DONE]\n\n");
        res.end();
      }
    } catch (error: any) {
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
