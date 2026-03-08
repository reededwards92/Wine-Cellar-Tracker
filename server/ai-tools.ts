import db from "./db";
import type Anthropic from "@anthropic-ai/sdk";

export const CELLAR_TOOLS: Anthropic.Tool[] = [
  {
    name: "search_wines",
    description: "Search the wine cellar. Returns wines matching the criteria with bottle counts and values. Use this to find wines by producer, name, varietal, region, country, color, vintage, or any combination.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Free text search across producer, wine name, varietal, region, appellation" },
        color: { type: "string", description: "Filter by color: Red, White, Rosé, Sparkling, Dessert, Fortified" },
        region: { type: "string", description: "Filter by region" },
        country: { type: "string", description: "Filter by country" },
        varietal: { type: "string", description: "Filter by grape varietal" },
        vintage_min: { type: "number", description: "Minimum vintage year" },
        vintage_max: { type: "number", description: "Maximum vintage year" },
        in_stock: { type: "boolean", description: "Only show wines with bottles in cellar (default true)" },
        drink_window_status: { type: "string", description: "Filter by drink window: in_window, approaching, past_peak, not_set" },
        limit: { type: "number", description: "Max results to return (default 20)" },
      },
      required: [],
    },
  },
  {
    name: "get_wine_details",
    description: "Get full details for a specific wine including all its bottles, their status, location, and value.",
    input_schema: {
      type: "object" as const,
      properties: {
        wine_id: { type: "number", description: "The wine ID to look up" },
      },
      required: ["wine_id"],
    },
  },
  {
    name: "add_wine",
    description: "Add a new wine and its bottles to the cellar. Use this when the user wants to add a wine that doesn't already exist.",
    input_schema: {
      type: "object" as const,
      properties: {
        producer: { type: "string", description: "Winery/estate name" },
        wine_name: { type: "string", description: "Full wine name" },
        vintage: { type: "number", description: "Vintage year, null for NV" },
        color: { type: "string", description: "Red, White, Rosé, Sparkling, Dessert, or Fortified" },
        country: { type: "string" },
        region: { type: "string" },
        sub_region: { type: "string" },
        appellation: { type: "string" },
        varietal: { type: "string", description: "Grape variety" },
        designation: { type: "string" },
        vineyard: { type: "string" },
        drink_window_start: { type: "number" },
        drink_window_end: { type: "number" },
        quantity: { type: "number", description: "Number of bottles to add (default 1)" },
        purchase_price: { type: "number" },
        estimated_value: { type: "number" },
        store: { type: "string", description: "Where purchased" },
        location: { type: "string", description: "Storage location" },
        bin: { type: "string", description: "Specific bin/slot" },
        size: { type: "string", description: "Bottle size (default 750ml)" },
        notes: { type: "string" },
      },
      required: ["producer", "wine_name"],
    },
  },
  {
    name: "add_bottles",
    description: "Add more bottles of an existing wine to the cellar.",
    input_schema: {
      type: "object" as const,
      properties: {
        wine_id: { type: "number", description: "The wine ID to add bottles to" },
        quantity: { type: "number", description: "Number of bottles to add (default 1)" },
        purchase_price: { type: "number" },
        estimated_value: { type: "number" },
        store: { type: "string" },
        location: { type: "string" },
        bin: { type: "string" },
        size: { type: "string" },
        notes: { type: "string" },
      },
      required: ["wine_id"],
    },
  },
  {
    name: "update_wine",
    description: "Update details of an existing wine record.",
    input_schema: {
      type: "object" as const,
      properties: {
        wine_id: { type: "number", description: "The wine ID to update" },
        producer: { type: "string" },
        wine_name: { type: "string" },
        vintage: { type: "number" },
        color: { type: "string" },
        country: { type: "string" },
        region: { type: "string" },
        sub_region: { type: "string" },
        appellation: { type: "string" },
        varietal: { type: "string" },
        designation: { type: "string" },
        vineyard: { type: "string" },
        drink_window_start: { type: "number" },
        drink_window_end: { type: "number" },
        ct_community_score: { type: "number" },
      },
      required: ["wine_id"],
    },
  },
  {
    name: "update_bottle",
    description: "Update a specific bottle's details (location, bin, notes, etc.).",
    input_schema: {
      type: "object" as const,
      properties: {
        bottle_id: { type: "number", description: "The bottle ID to update" },
        location: { type: "string" },
        bin: { type: "string" },
        notes: { type: "string" },
        estimated_value: { type: "number" },
        purchase_price: { type: "number" },
        store: { type: "string" },
      },
      required: ["bottle_id"],
    },
  },
  {
    name: "consume_bottle",
    description: "Mark a bottle as consumed/drunk. Records it in the consumption log with optional tasting details.",
    input_schema: {
      type: "object" as const,
      properties: {
        bottle_id: { type: "number", description: "The specific bottle ID to consume. If unknown, search for the wine first." },
        rating: { type: "number", description: "1-5 star rating" },
        occasion: { type: "string", description: "The occasion (dinner party, celebration, Tuesday night, etc.)" },
        paired_with: { type: "string", description: "Food pairing" },
        who_with: { type: "string", description: "People shared with" },
        tasting_notes: { type: "string", description: "Tasting notes and impressions" },
        consumed_date: { type: "string", description: "Date consumed (YYYY-MM-DD), defaults to today" },
      },
      required: ["bottle_id"],
    },
  },
  {
    name: "get_cellar_stats",
    description: "Get summary statistics about the cellar: total bottles, value, unique wines, consumption count, breakdowns by color/region/varietal.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_recommendations",
    description: "Get wine recommendations based on criteria. Use this when the user asks what to drink, what's ready, or wants suggestions.",
    input_schema: {
      type: "object" as const,
      properties: {
        criteria: { type: "string", description: "What kind of recommendation: 'ready_to_drink' (in drink window), 'best_value', 'highest_rated', 'aging_well', 'past_peak' (should drink soon), 'by_color', 'for_occasion'" },
        color: { type: "string", description: "Filter by color if relevant" },
        occasion: { type: "string", description: "The occasion to recommend for" },
        food_pairing: { type: "string", description: "What food will be served" },
        limit: { type: "number", description: "Max recommendations (default 5)" },
      },
      required: ["criteria"],
    },
  },
  {
    name: "get_weather",
    description: "Get current weather and forecast for a location. Use this proactively when recommending wines — weather, temperature, and season should influence suggestions (e.g., light whites on hot days, bold reds on cold evenings). Call this tool whenever making drink recommendations.",
    input_schema: {
      type: "object" as const,
      properties: {
        location: { type: "string", description: "City name or location (e.g., 'San Francisco', 'London', 'Paris')" },
      },
      required: ["location"],
    },
  },
];

export async function executeTool(name: string, input: any): Promise<string> {
  try {
    switch (name) {
      case "search_wines":
        return searchWines(input);
      case "get_wine_details":
        return getWineDetails(input);
      case "add_wine":
        return addWine(input);
      case "add_bottles":
        return addBottles(input);
      case "update_wine":
        return updateWine(input);
      case "update_bottle":
        return updateBottle(input);
      case "consume_bottle":
        return consumeBottle(input);
      case "get_cellar_stats":
        return getCellarStats();
      case "get_recommendations":
        return getRecommendations(input);
      case "get_weather":
        return await getWeather(input);
      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  } catch (err: any) {
    return JSON.stringify({ error: err.message });
  }
}

function searchWines(input: any): string {
  const conditions: string[] = [];
  const params: any[] = [];
  const currentYear = new Date().getFullYear();

  if (input.query) {
    conditions.push("(w.producer LIKE ? OR w.wine_name LIKE ? OR w.varietal LIKE ? OR w.region LIKE ? OR w.appellation LIKE ?)");
    const q = `%${input.query}%`;
    params.push(q, q, q, q, q);
  }
  if (input.color) {
    conditions.push("w.color = ?");
    params.push(input.color);
  }
  if (input.region) {
    conditions.push("(w.region LIKE ? OR w.sub_region LIKE ?)");
    params.push(`%${input.region}%`, `%${input.region}%`);
  }
  if (input.country) {
    conditions.push("w.country = ?");
    params.push(input.country);
  }
  if (input.varietal) {
    conditions.push("w.varietal LIKE ?");
    params.push(`%${input.varietal}%`);
  }
  if (input.vintage_min) {
    conditions.push("w.vintage >= ?");
    params.push(input.vintage_min);
  }
  if (input.vintage_max) {
    conditions.push("w.vintage <= ?");
    params.push(input.vintage_max);
  }
  if (input.drink_window_status === "in_window") {
    conditions.push(`(w.drink_window_start <= ${currentYear} AND w.drink_window_end >= ${currentYear})`);
  } else if (input.drink_window_status === "approaching") {
    conditions.push(`(w.drink_window_start > ${currentYear} AND w.drink_window_start <= ${currentYear + 1})`);
  } else if (input.drink_window_status === "past_peak") {
    conditions.push(`(w.drink_window_end < ${currentYear} AND w.drink_window_end IS NOT NULL)`);
  }

  const whereStr = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const inStock = input.in_stock !== false;
  const havingStr = inStock ? "HAVING bottle_count > 0" : "";
  const limit = input.limit || 20;

  const wines = db.prepare(`
    SELECT w.*, 
      COUNT(CASE WHEN b.status = 'in_cellar' THEN 1 END) as bottle_count,
      COALESCE(AVG(CASE WHEN b.status = 'in_cellar' THEN b.estimated_value END), 0) as avg_value
    FROM wines w
    LEFT JOIN bottles b ON w.id = b.wine_id
    ${whereStr}
    GROUP BY w.id
    ${havingStr}
    ORDER BY w.producer ASC
    LIMIT ?
  `).all(...params, limit);

  return JSON.stringify({ wines, count: wines.length });
}

function getWineDetails(input: any): string {
  const wine = db.prepare("SELECT * FROM wines WHERE id = ?").get(input.wine_id);
  if (!wine) return JSON.stringify({ error: "Wine not found" });
  const bottles = db.prepare("SELECT * FROM bottles WHERE wine_id = ? ORDER BY status, created_at DESC").all(input.wine_id);
  return JSON.stringify({ wine, bottles });
}

function addWine(input: any): string {
  const result = db.prepare(`
    INSERT INTO wines (producer, wine_name, vintage, color, country, region, sub_region, appellation, varietal, designation, vineyard, drink_window_start, drink_window_end)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.producer, input.wine_name, input.vintage || null,
    input.color || null, input.country || null, input.region || null,
    input.sub_region || null, input.appellation || null, input.varietal || null,
    input.designation || null, input.vineyard || null,
    input.drink_window_start || null, input.drink_window_end || null
  );

  const wineId = Number(result.lastInsertRowid);
  const qty = input.quantity || 1;

  const bottleInsert = db.prepare(`
    INSERT INTO bottles (wine_id, purchase_price, estimated_value, store, location, bin, size, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (let i = 0; i < qty; i++) {
    bottleInsert.run(wineId, input.purchase_price || null, input.estimated_value || null,
      input.store || null, input.location || null, input.bin || null,
      input.size || "750ml", input.notes || null);
  }

  return JSON.stringify({ success: true, wine_id: wineId, bottles_added: qty, message: `Added ${input.producer} ${input.wine_name}${input.vintage ? ` ${input.vintage}` : ""} with ${qty} bottle(s)` });
}

function addBottles(input: any): string {
  const wine = db.prepare("SELECT * FROM wines WHERE id = ?").get(input.wine_id) as any;
  if (!wine) return JSON.stringify({ error: "Wine not found" });

  const qty = input.quantity || 1;
  const bottleInsert = db.prepare(`
    INSERT INTO bottles (wine_id, purchase_price, estimated_value, store, location, bin, size, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (let i = 0; i < qty; i++) {
    bottleInsert.run(input.wine_id, input.purchase_price || null, input.estimated_value || null,
      input.store || null, input.location || null, input.bin || null,
      input.size || "750ml", input.notes || null);
  }

  return JSON.stringify({ success: true, message: `Added ${qty} bottle(s) of ${wine.producer} ${wine.wine_name}` });
}

function updateWine(input: any): string {
  const wine = db.prepare("SELECT * FROM wines WHERE id = ?").get(input.wine_id);
  if (!wine) return JSON.stringify({ error: "Wine not found" });

  const fields = ["producer", "wine_name", "vintage", "color", "country", "region", "sub_region", "appellation", "varietal", "designation", "vineyard", "drink_window_start", "drink_window_end", "ct_community_score"];
  const updates: string[] = [];
  const values: any[] = [];

  for (const field of fields) {
    if (input[field] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(input[field]);
    }
  }

  if (updates.length === 0) return JSON.stringify({ error: "No fields to update" });

  updates.push("updated_at = CURRENT_TIMESTAMP");
  values.push(input.wine_id);
  db.prepare(`UPDATE wines SET ${updates.join(", ")} WHERE id = ?`).run(...values);

  return JSON.stringify({ success: true, message: "Wine updated" });
}

function updateBottle(input: any): string {
  const bottle = db.prepare("SELECT * FROM bottles WHERE id = ?").get(input.bottle_id);
  if (!bottle) return JSON.stringify({ error: "Bottle not found" });

  const fields = ["location", "bin", "notes", "estimated_value", "purchase_price", "store"];
  const updates: string[] = [];
  const values: any[] = [];

  for (const field of fields) {
    if (input[field] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(input[field]);
    }
  }

  if (updates.length === 0) return JSON.stringify({ error: "No fields to update" });

  values.push(input.bottle_id);
  db.prepare(`UPDATE bottles SET ${updates.join(", ")} WHERE id = ?`).run(...values);

  return JSON.stringify({ success: true, message: "Bottle updated" });
}

function consumeBottle(input: any): string {
  const bottle = db.prepare("SELECT * FROM bottles WHERE id = ?").get(input.bottle_id) as any;
  if (!bottle) return JSON.stringify({ error: "Bottle not found" });
  if (bottle.status !== "in_cellar") return JSON.stringify({ error: "This bottle is not in the cellar (already consumed/removed)" });

  const wine = db.prepare("SELECT * FROM wines WHERE id = ?").get(bottle.wine_id) as any;
  const consumeDate = input.consumed_date || new Date().toISOString().split("T")[0];

  db.prepare("UPDATE bottles SET status = 'consumed', consumed_date = ?, occasion = ?, rating = ? WHERE id = ?")
    .run(consumeDate, input.occasion || null, input.rating || null, input.bottle_id);

  db.prepare(`
    INSERT INTO consumption_log (bottle_id, wine_id, consumed_date, occasion, paired_with, who_with, rating, tasting_notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(input.bottle_id, bottle.wine_id, consumeDate, input.occasion || null, input.paired_with || null,
    input.who_with || null, input.rating || null, input.tasting_notes || null);

  return JSON.stringify({
    success: true,
    message: `Recorded consumption of ${wine.producer} ${wine.wine_name}${wine.vintage ? ` ${wine.vintage}` : ""}. ${input.rating ? `Rated ${input.rating}/5.` : ""}`
  });
}

function getCellarStats(): string {
  const basic = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM bottles WHERE status = 'in_cellar') as total_bottles,
      (SELECT COALESCE(SUM(estimated_value), 0) FROM bottles WHERE status = 'in_cellar') as total_value,
      (SELECT COUNT(DISTINCT wine_id) FROM bottles WHERE status = 'in_cellar') as unique_wines,
      (SELECT COUNT(*) FROM bottles WHERE status = 'consumed') as consumed_bottles
  `).get() as any;

  const byColor = db.prepare(`
    SELECT w.color, COUNT(*) as count 
    FROM bottles b JOIN wines w ON b.wine_id = w.id 
    WHERE b.status = 'in_cellar' AND w.color IS NOT NULL
    GROUP BY w.color ORDER BY count DESC
  `).all();

  const topRegions = db.prepare(`
    SELECT w.region, COUNT(*) as count 
    FROM bottles b JOIN wines w ON b.wine_id = w.id 
    WHERE b.status = 'in_cellar' AND w.region IS NOT NULL
    GROUP BY w.region ORDER BY count DESC LIMIT 10
  `).all();

  const topVarietals = db.prepare(`
    SELECT w.varietal, COUNT(*) as count 
    FROM bottles b JOIN wines w ON b.wine_id = w.id 
    WHERE b.status = 'in_cellar' AND w.varietal IS NOT NULL
    GROUP BY w.varietal ORDER BY count DESC LIMIT 10
  `).all();

  return JSON.stringify({ ...basic, by_color: byColor, top_regions: topRegions, top_varietals: topVarietals });
}

function getRecommendations(input: any): string {
  const currentYear = new Date().getFullYear();
  const limit = input.limit || 5;
  let query = "";
  const params: any[] = [];

  switch (input.criteria) {
    case "ready_to_drink":
    case "in_window":
      query = `
        SELECT w.*, COUNT(CASE WHEN b.status = 'in_cellar' THEN 1 END) as bottle_count,
          AVG(CASE WHEN b.status = 'in_cellar' THEN b.estimated_value END) as avg_value
        FROM wines w JOIN bottles b ON w.id = b.wine_id
        WHERE w.drink_window_start <= ? AND w.drink_window_end >= ? AND b.status = 'in_cellar'
        ${input.color ? "AND w.color = ?" : ""}
        GROUP BY w.id HAVING bottle_count > 0
        ORDER BY w.ct_community_score DESC NULLS LAST
        LIMIT ?
      `;
      params.push(currentYear, currentYear);
      if (input.color) params.push(input.color);
      params.push(limit);
      break;

    case "past_peak":
      query = `
        SELECT w.*, COUNT(CASE WHEN b.status = 'in_cellar' THEN 1 END) as bottle_count,
          AVG(CASE WHEN b.status = 'in_cellar' THEN b.estimated_value END) as avg_value
        FROM wines w JOIN bottles b ON w.id = b.wine_id
        WHERE w.drink_window_end < ? AND w.drink_window_end IS NOT NULL AND b.status = 'in_cellar'
        GROUP BY w.id HAVING bottle_count > 0
        ORDER BY w.drink_window_end ASC
        LIMIT ?
      `;
      params.push(currentYear, limit);
      break;

    case "best_value":
      query = `
        SELECT w.*, COUNT(CASE WHEN b.status = 'in_cellar' THEN 1 END) as bottle_count,
          AVG(CASE WHEN b.status = 'in_cellar' THEN b.estimated_value END) as avg_value
        FROM wines w JOIN bottles b ON w.id = b.wine_id
        WHERE b.status = 'in_cellar'
        ${input.color ? "AND w.color = ?" : ""}
        GROUP BY w.id HAVING bottle_count > 0
        ORDER BY avg_value DESC
        LIMIT ?
      `;
      if (input.color) params.push(input.color);
      params.push(limit);
      break;

    case "highest_rated":
      query = `
        SELECT w.*, COUNT(CASE WHEN b.status = 'in_cellar' THEN 1 END) as bottle_count,
          AVG(CASE WHEN b.status = 'in_cellar' THEN b.estimated_value END) as avg_value
        FROM wines w JOIN bottles b ON w.id = b.wine_id
        WHERE b.status = 'in_cellar' AND w.ct_community_score IS NOT NULL
        ${input.color ? "AND w.color = ?" : ""}
        GROUP BY w.id HAVING bottle_count > 0
        ORDER BY w.ct_community_score DESC
        LIMIT ?
      `;
      if (input.color) params.push(input.color);
      params.push(limit);
      break;

    case "by_color":
      query = `
        SELECT w.*, COUNT(CASE WHEN b.status = 'in_cellar' THEN 1 END) as bottle_count,
          AVG(CASE WHEN b.status = 'in_cellar' THEN b.estimated_value END) as avg_value
        FROM wines w JOIN bottles b ON w.id = b.wine_id
        WHERE b.status = 'in_cellar' AND w.color = ?
        GROUP BY w.id HAVING bottle_count > 0
        ORDER BY w.ct_community_score DESC NULLS LAST
        LIMIT ?
      `;
      params.push(input.color || "Red", limit);
      break;

    default:
      query = `
        SELECT w.*, COUNT(CASE WHEN b.status = 'in_cellar' THEN 1 END) as bottle_count,
          AVG(CASE WHEN b.status = 'in_cellar' THEN b.estimated_value END) as avg_value
        FROM wines w JOIN bottles b ON w.id = b.wine_id
        WHERE b.status = 'in_cellar'
        GROUP BY w.id HAVING bottle_count > 0
        ORDER BY w.ct_community_score DESC NULLS LAST
        LIMIT ?
      `;
      params.push(limit);
  }

  const wines = db.prepare(query).all(...params);
  return JSON.stringify({ recommendations: wines, criteria: input.criteria, count: wines.length });
}

const WMO_CODES: Record<number, string> = {
  0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
  45: "Foggy", 48: "Depositing rime fog",
  51: "Light drizzle", 53: "Moderate drizzle", 55: "Dense drizzle",
  61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
  71: "Slight snow", 73: "Moderate snow", 75: "Heavy snow",
  80: "Slight rain showers", 81: "Moderate rain showers", 82: "Violent rain showers",
  85: "Slight snow showers", 86: "Heavy snow showers",
  95: "Thunderstorm", 96: "Thunderstorm with slight hail", 99: "Thunderstorm with heavy hail",
};

async function getWeather(input: any): Promise<string> {
  const location = input.location;
  if (!location) return JSON.stringify({ error: "Location is required" });

  const geoRes = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en`
  );
  const geoData = await geoRes.json();

  if (!geoData.results || geoData.results.length === 0) {
    return JSON.stringify({ error: `Could not find location: ${location}` });
  }

  const { latitude, longitude, name, country, timezone } = geoData.results[0];

  const weatherRes = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,weather_code,sunset,sunrise&timezone=${encodeURIComponent(timezone)}&forecast_days=3`
  );
  const weather = await weatherRes.json();

  const current = weather.current;
  const daily = weather.daily;

  const now = new Date();
  const month = now.toLocaleString("en", { month: "long" });
  const season = getSeason(latitude, now.getMonth());

  const result = {
    location: `${name}, ${country}`,
    season,
    month,
    current: {
      temperature_c: current.temperature_2m,
      temperature_f: Math.round(current.temperature_2m * 9 / 5 + 32),
      feels_like_c: current.apparent_temperature,
      feels_like_f: Math.round(current.apparent_temperature * 9 / 5 + 32),
      humidity_percent: current.relative_humidity_2m,
      wind_speed_kmh: current.wind_speed_10m,
      conditions: WMO_CODES[current.weather_code] || "Unknown",
    },
    forecast: daily.time.map((date: string, i: number) => ({
      date,
      high_c: daily.temperature_2m_max[i],
      high_f: Math.round(daily.temperature_2m_max[i] * 9 / 5 + 32),
      low_c: daily.temperature_2m_min[i],
      low_f: Math.round(daily.temperature_2m_min[i] * 9 / 5 + 32),
      conditions: WMO_CODES[daily.weather_code[i]] || "Unknown",
      sunrise: daily.sunrise[i],
      sunset: daily.sunset[i],
    })),
  };

  return JSON.stringify(result);
}

function getSeason(latitude: number, month: number): string {
  const isNorthern = latitude >= 0;
  if (isNorthern) {
    if (month >= 2 && month <= 4) return "Spring";
    if (month >= 5 && month <= 7) return "Summer";
    if (month >= 8 && month <= 10) return "Fall";
    return "Winter";
  } else {
    if (month >= 2 && month <= 4) return "Fall";
    if (month >= 5 && month <= 7) return "Winter";
    if (month >= 8 && month <= 10) return "Spring";
    return "Summer";
  }
}
