import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import db from "./db";
import multer from "multer";
import { parse } from "csv-parse/sync";
import iconv from "iconv-lite";
import Anthropic from "@anthropic-ai/sdk";
import { CELLAR_TOOLS, executeTool } from "./ai-tools";

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

  app.get("/api/stats", (_req: Request, res: Response) => {
    const stats = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM bottles WHERE status = 'in_cellar') as total_bottles,
        (SELECT COALESCE(SUM(estimated_value), 0) FROM bottles WHERE status = 'in_cellar') as total_value,
        (SELECT COUNT(DISTINCT wine_id) FROM bottles WHERE status = 'in_cellar') as unique_wines,
        (SELECT COUNT(*) FROM bottles WHERE status = 'consumed') as consumed_bottles
    `).get() as any;
    res.json(stats);
  });

  app.get("/api/wines", (req: Request, res: Response) => {
    const {
      sort = "producer",
      order = "asc",
      color,
      region,
      country,
      varietal,
      drinkWindow,
      minValue,
      maxValue,
      inStock = "true",
      search,
    } = req.query;

    let whereClauses: string[] = [];
    let params: any[] = [];

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
        COALESCE(SUM(CASE WHEN b.status = 'in_cellar' THEN b.estimated_value END), 0) as total_value
      FROM wines w
      LEFT JOIN bottles b ON w.id = b.wine_id
      ${whereStr}
      GROUP BY w.id
      ${havingStr}
      ORDER BY ${sortCol} ${sortOrder}
    `;

    const wines = db.prepare(query).all(...params);
    res.json(wines);
  });

  app.get("/api/wines/:id", (req: Request, res: Response) => {
    const wine = db.prepare("SELECT * FROM wines WHERE id = ?").get(req.params.id);
    if (!wine) return res.status(404).json({ error: "Wine not found" });
    const bottles = db.prepare("SELECT * FROM bottles WHERE wine_id = ? ORDER BY created_at DESC").all(req.params.id);
    res.json({ ...(wine as any), bottles });
  });

  app.post("/api/wines", (req: Request, res: Response) => {
    const { quantity = 1, purchase_date, purchase_price, estimated_value, store, location, bin, size, notes, ...wineData } = req.body;

    const wineInsert = db.prepare(`
      INSERT INTO wines (producer, wine_name, vintage, country, region, sub_region, appellation, varietal, color, wine_type, category, designation, vineyard, drink_window_start, drink_window_end, ct_community_score, critic_scores)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = wineInsert.run(
      wineData.producer, wineData.wine_name, wineData.vintage || null,
      wineData.country || null, wineData.region || null, wineData.sub_region || null,
      wineData.appellation || null, wineData.varietal || null, wineData.color || null,
      wineData.wine_type || null, wineData.category || null, wineData.designation || null,
      wineData.vineyard || null, wineData.drink_window_start || null, wineData.drink_window_end || null,
      wineData.ct_community_score || null, wineData.critic_scores || null
    );

    const wineId = result.lastInsertRowid;

    const bottleInsert = db.prepare(`
      INSERT INTO bottles (wine_id, purchase_date, purchase_price, estimated_value, store, location, bin, size, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (let i = 0; i < (quantity || 1); i++) {
      bottleInsert.run(wineId, purchase_date || null, purchase_price || null, estimated_value || null, store || null, location || null, bin || null, size || "750ml", notes || null);
    }

    const wine = db.prepare("SELECT * FROM wines WHERE id = ?").get(wineId);
    res.status(201).json(wine);
  });

  app.put("/api/wines/:id", (req: Request, res: Response) => {
    const wine = db.prepare("SELECT * FROM wines WHERE id = ?").get(req.params.id);
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

  app.post("/api/wines/:id/bottles", (req: Request, res: Response) => {
    const wine = db.prepare("SELECT * FROM wines WHERE id = ?").get(req.params.id);
    if (!wine) return res.status(404).json({ error: "Wine not found" });

    const { quantity = 1, purchase_date, purchase_price, estimated_value, store, location, bin, size, notes } = req.body;

    const bottleInsert = db.prepare(`
      INSERT INTO bottles (wine_id, purchase_date, purchase_price, estimated_value, store, location, bin, size, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (let i = 0; i < quantity; i++) {
      bottleInsert.run(req.params.id, purchase_date || null, purchase_price || null, estimated_value || null, store || null, location || null, bin || null, size || "750ml", notes || null);
    }

    res.status(201).json({ message: `Added ${quantity} bottle(s)` });
  });

  app.put("/api/bottles/:id", (req: Request, res: Response) => {
    const bottle = db.prepare("SELECT * FROM bottles WHERE id = ?").get(req.params.id);
    if (!bottle) return res.status(404).json({ error: "Bottle not found" });

    const fields = ["purchase_date", "purchase_price", "estimated_value", "store", "location", "bin", "size", "notes", "status"];
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

  app.patch("/api/bottles/:id/consume", (req: Request, res: Response) => {
    const bottle = db.prepare("SELECT * FROM bottles WHERE id = ?").get(req.params.id) as any;
    if (!bottle) return res.status(404).json({ error: "Bottle not found" });

    const { consumed_date, occasion, paired_with, who_with, rating, tasting_notes } = req.body;
    const consumeDate = consumed_date || new Date().toISOString().split("T")[0];

    db.prepare(`UPDATE bottles SET status = 'consumed', consumed_date = ?, occasion = ?, rating = ? WHERE id = ?`)
      .run(consumeDate, occasion || null, rating || null, req.params.id);

    db.prepare(`
      INSERT INTO consumption_log (bottle_id, wine_id, consumed_date, occasion, paired_with, who_with, rating, tasting_notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(req.params.id, bottle.wine_id, consumeDate, occasion || null, paired_with || null, who_with || null, rating || null, tasting_notes || null);

    res.json({ message: "Bottle consumed" });
  });

  app.get("/api/consumption", (_req: Request, res: Response) => {
    const logs = db.prepare(`
      SELECT cl.*, w.producer, w.wine_name, w.vintage, w.color, w.varietal, w.region
      FROM consumption_log cl
      JOIN wines w ON cl.wine_id = w.id
      ORDER BY cl.consumed_date DESC
    `).all();
    res.json(logs);
  });

  app.get("/api/filters", (_req: Request, res: Response) => {
    const colors = db.prepare("SELECT DISTINCT color FROM wines WHERE color IS NOT NULL ORDER BY color").all();
    const regions = db.prepare("SELECT DISTINCT region FROM wines WHERE region IS NOT NULL ORDER BY region").all();
    const countries = db.prepare("SELECT DISTINCT country FROM wines WHERE country IS NOT NULL ORDER BY country").all();
    const varietals = db.prepare("SELECT DISTINCT varietal FROM wines WHERE varietal IS NOT NULL ORDER BY varietal").all();
    res.json({
      colors: (colors as any[]).map((c) => c.color),
      regions: (regions as any[]).map((r) => r.region),
      countries: (countries as any[]).map((c) => c.country),
      varietals: (varietals as any[]).map((v) => v.varietal),
    });
  });

  app.post("/api/import", upload.single("file"), (req: Request, res: Response) => {
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

    const preview = req.query.preview === "true";
    if (preview) {
      return res.json({
        total_rows: records.length,
        preview: records.slice(0, 10),
        unique_wines: new Set(records.map((r) => r.iWine)).size,
      });
    }

    let winesCreated = 0;
    let bottlesCreated = 0;
    let skipped = 0;
    const errors: string[] = [];

    const winesByCtId = new Map<string, number>();

    const insertWine = db.prepare(`
      INSERT INTO wines (ct_wine_id, producer, wine_name, vintage, country, region, sub_region, appellation, varietal, color, wine_type, category, designation, vineyard, drink_window_start, drink_window_end, ct_community_score)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertBottle = db.prepare(`
      INSERT INTO bottles (wine_id, ct_inventory_id, ct_barcode, purchase_date, purchase_price, estimated_value, store, location, bin, size)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const findWineByCt = db.prepare("SELECT id FROM wines WHERE ct_wine_id = ?");
    const findBottleByCt = db.prepare("SELECT id FROM bottles WHERE ct_inventory_id = ?");

    const requiredColumns = ["iWine", "Wine", "Producer"];
    const missingColumns = requiredColumns.filter((col) => !(col in records[0]));
    if (missingColumns.length > 0) {
      return res.status(400).json({ error: `Missing required columns: ${missingColumns.join(", ")}` });
    }

    const importAll = db.transaction(() => {
      for (let i = 0; i < records.length; i++) {
        const row = records[i];
        try {
          const ctInventoryId = parseInteger(row.iInventory);
          if (ctInventoryId) {
            const existingBottle = findBottleByCt.get(ctInventoryId);
            if (existingBottle) {
              skipped++;
              continue;
            }
          }

          const ctWineId = parseInteger(row.iWine);
          let wineId: number;

          if (ctWineId && winesByCtId.has(String(ctWineId))) {
            wineId = winesByCtId.get(String(ctWineId))!;
          } else if (ctWineId) {
            const existingWine = findWineByCt.get(ctWineId) as any;
            if (existingWine) {
              wineId = existingWine.id;
              winesByCtId.set(String(ctWineId), wineId);
            } else {
              const result = insertWine.run(
                ctWineId,
                row.Producer || "Unknown",
                row.Wine || "Unknown",
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
                parseNumber(row.CScore)
              );
              wineId = Number(result.lastInsertRowid);
              winesByCtId.set(String(ctWineId), wineId);
              winesCreated++;
            }
          } else {
            const result = insertWine.run(
              null,
              row.Producer || "Unknown",
              row.Wine || "Unknown",
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
              parseNumber(row.CScore)
            );
            wineId = Number(result.lastInsertRowid);
            winesCreated++;
          }

          const price = parseNumber(row.Price);
          const barcode = cleanValue(row.Barcode) || cleanValue(row.WineBarcode);

          insertBottle.run(
            wineId,
            ctInventoryId,
            barcode,
            parseDate(row.PurchaseDate),
            price && price > 0 ? price : null,
            parseNumber(row.Value),
            cleanValue(row.StoreName),
            cleanValue(row.Location),
            cleanValue(row.Bin),
            cleanValue(row.Size) || "750ml"
          );
          bottlesCreated++;
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
      skipped,
      errors,
      total_rows: records.length,
    });
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
- When asked "what should I drink?" or similar, use get_weather (with their location) alongside get_recommendations to give weather-appropriate suggestions. On a hot summer day, lean toward crisp whites, ros\u00e9s, or sparkling. On a cold winter evening, suggest bold reds or fortified wines. Always factor in season, temperature, and conditions.
- If the user mentions their location or you can infer it, use get_weather to check current conditions and factor them into recommendations.
- For search queries, use search_wines and present results clearly.
- If asked about cellar overview/stats, use get_cellar_stats.
- When adding wines, confirm the details before using add_wine.
- When the user shares a photo of a wine bottle, analyze the label carefully. Extract: wine name, producer, vintage, region, varietal, and any other visible details. Present what you found and ask the user to confirm the details before adding it to the cellar. If you can't read certain details clearly, say so and ask the user to fill in the gaps.
- Format responses for mobile readability — use short paragraphs, not long blocks.
- If the user asks about importing wines from CellarTracker, let them know they can use the CSV import feature on the Add tab.

Current date: ${new Date().toISOString().split("T")[0]}`;

  app.post("/api/analyze-wine-image", async (req: Request, res: Response) => {
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

  app.post("/api/chat", async (req: Request, res: Response) => {
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
        systemPrompt += `\n\nUser's current GPS coordinates: latitude ${location.latitude}, longitude ${location.longitude}. Use the get_weather tool with these coordinates to check local conditions when making wine recommendations. You can reverse-geocode the coordinates to determine the city/region.`;
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
            const result = await executeTool(block.name, block.input);
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
