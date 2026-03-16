import pool from "./db";
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
        location: { type: "string", description: "Storage location: Rack, Cabinet, or Fridge" },
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
        location: { type: "string", description: "Storage location: Rack, Cabinet, or Fridge" },
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
    description: "Update a specific bottle's details (location, notes, etc.).",
    input_schema: {
      type: "object" as const,
      properties: {
        bottle_id: { type: "number", description: "The bottle ID to update" },
        location: { type: "string", description: "Storage location: Rack, Cabinet, or Fridge" },
        notes: { type: "string" },
        estimated_value: { type: "number" },
        purchase_price: { type: "number" },
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
    description: "Get current weather and forecast for a location. Can optionally be used to factor weather into wine recommendations when it seems relevant (e.g., user asks what to drink tonight, or mentions the weather). You can pass either a city name OR latitude/longitude coordinates.",
    input_schema: {
      type: "object" as const,
      properties: {
        location: { type: "string", description: "City name or location (e.g., 'San Francisco', 'London', 'Paris')" },
        latitude: { type: "number", description: "GPS latitude (use this if you have coordinates from the user's device)" },
        longitude: { type: "number", description: "GPS longitude (use this if you have coordinates from the user's device)" },
      },
      required: [],
    },
  },
  {
    name: "get_consumption_history",
    description: "Get the user's consumption history — wines they've drunk, when, with whom, ratings, and tasting notes. Use this when the user asks what they've been drinking, their recent bottles, or wants to recall a specific tasting.",
    input_schema: {
      type: "object" as const,
      properties: {
        limit: { type: "number", description: "Max entries to return (default 20)" },
        wine_id: { type: "number", description: "Filter history for a specific wine" },
      },
      required: [],
    },
  },
  {
    name: "get_storage_locations",
    description: "Get the user's defined storage locations (wine racks, fridges, cabinets, etc.) and how many bottles are in each. Use this when the user asks about their storage, wants to find bottles in a specific location, or needs to know what locations exist before moving bottles.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "undo_consumption",
    description: "Undo a recent bottle consumption — restores the bottle to 'in cellar' status and removes the consumption log entry. Use this when the user says they logged a bottle by mistake or wants to reverse a consumption.",
    input_schema: {
      type: "object" as const,
      properties: {
        bottle_id: { type: "number", description: "The bottle ID to restore. Search for the wine first if the ID is unknown." },
      },
      required: ["bottle_id"],
    },
  },
  {
    name: "save_memory",
    description: "Save something about the user to your long-term memory. Use this to remember preferences, tastes, habits, dietary restrictions, people they drink with, occasions, or anything that would help you make better recommendations in future conversations. Each memory should be a single, concise fact. You can also update an existing memory by passing its ID.",
    input_schema: {
      type: "object" as const,
      properties: {
        content: { type: "string", description: "The fact to remember, e.g. 'Prefers bold, full-bodied reds' or 'Partner is Sarah, doesn\\'t like tannic wines' or 'Friday night is usually pizza night'" },
        memory_id: { type: "number", description: "If updating an existing memory, pass its ID. Otherwise omit to create a new one." },
      },
      required: ["content"],
    },
  },
  {
    name: "delete_memory",
    description: "Delete a memory that is no longer accurate or relevant. Use this when the user corrects a previous preference or something has changed.",
    input_schema: {
      type: "object" as const,
      properties: {
        memory_id: { type: "number", description: "The ID of the memory to delete" },
      },
      required: ["memory_id"],
    },
  },
];

export async function executeTool(name: string, input: any, userId?: number): Promise<string> {
  try {
    switch (name) {
      case "search_wines":
        return await searchWines(input, userId);
      case "get_wine_details":
        return await getWineDetails(input, userId);
      case "add_wine":
        return await addWine(input, userId);
      case "add_bottles":
        return await addBottles(input, userId);
      case "update_wine":
        return await updateWine(input, userId);
      case "update_bottle":
        return await updateBottle(input, userId);
      case "consume_bottle":
        return await consumeBottle(input, userId);
      case "get_cellar_stats":
        return await getCellarStats(userId);
      case "get_recommendations":
        return await getRecommendations(input, userId);
      case "get_weather":
        return await getWeather(input);
      case "get_consumption_history":
        return await getConsumptionHistory(input, userId);
      case "get_storage_locations":
        return await getStorageLocations(userId);
      case "undo_consumption":
        return await undoConsumption(input, userId);
      case "save_memory":
        return await saveMemory(input, userId);
      case "delete_memory":
        return await deleteMemory(input, userId);
      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  } catch (err: any) {
    return JSON.stringify({ error: err.message });
  }
}

async function searchWines(input: any, userId?: number): Promise<string> {
  const conditions: string[] = [];
  const params: any[] = [];
  let paramIdx = 1;

  if (userId) {
    conditions.push(`w.user_id = $${paramIdx++}`);
    params.push(userId);
  }
  const currentYear = new Date().getFullYear();

  if (input.query) {
    conditions.push(`(unaccent(w.producer) ILIKE unaccent($${paramIdx}) OR unaccent(w.wine_name) ILIKE unaccent($${paramIdx}) OR unaccent(w.varietal) ILIKE unaccent($${paramIdx}) OR unaccent(w.region) ILIKE unaccent($${paramIdx}) OR unaccent(w.appellation) ILIKE unaccent($${paramIdx}))`);
    params.push(`%${input.query}%`);
    paramIdx++;
  }
  if (input.color) {
    conditions.push(`w.color = $${paramIdx++}`);
    params.push(input.color);
  }
  if (input.region) {
    conditions.push(`(unaccent(w.region) ILIKE unaccent($${paramIdx}) OR unaccent(w.sub_region) ILIKE unaccent($${paramIdx}))`);
    params.push(`%${input.region}%`);
    paramIdx++;
  }
  if (input.country) {
    conditions.push(`w.country = $${paramIdx++}`);
    params.push(input.country);
  }
  if (input.varietal) {
    conditions.push(`unaccent(w.varietal) ILIKE unaccent($${paramIdx++})`);
    params.push(`%${input.varietal}%`);
  }
  if (input.vintage_min) {
    conditions.push(`w.vintage >= $${paramIdx++}`);
    params.push(input.vintage_min);
  }
  if (input.vintage_max) {
    conditions.push(`w.vintage <= $${paramIdx++}`);
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
  const havingStr = inStock ? "HAVING COUNT(CASE WHEN b.status = 'in_cellar' THEN 1 END) > 0" : "";
  const limit = input.limit || 20;

  params.push(limit);

  const result = await pool.query(`
    SELECT w.*,
      COUNT(CASE WHEN b.status = 'in_cellar' THEN 1 END) as bottle_count,
      COALESCE(AVG(CASE WHEN b.status = 'in_cellar' THEN b.estimated_value END), 0) as avg_value
    FROM wines w
    LEFT JOIN bottles b ON w.id = b.wine_id
    ${whereStr}
    GROUP BY w.id
    ${havingStr}
    ORDER BY w.producer ASC
    LIMIT $${paramIdx}
  `, params);

  return JSON.stringify({ wines: result.rows, count: result.rows.length });
}

async function getWineDetails(input: any, userId?: number): Promise<string> {
  const wineResult = userId
    ? await pool.query("SELECT * FROM wines WHERE id = $1 AND user_id = $2", [input.wine_id, userId])
    : await pool.query("SELECT * FROM wines WHERE id = $1", [input.wine_id]);
  if (wineResult.rows.length === 0) return JSON.stringify({ error: "Wine not found" });

  const bottleResult = userId
    ? await pool.query("SELECT * FROM bottles WHERE wine_id = $1 AND user_id = $2 ORDER BY status, created_at DESC", [input.wine_id, userId])
    : await pool.query("SELECT * FROM bottles WHERE wine_id = $1 ORDER BY status, created_at DESC", [input.wine_id]);

  return JSON.stringify({ wine: wineResult.rows[0], bottles: bottleResult.rows });
}

async function addWine(input: any, userId?: number): Promise<string> {
  const result = await pool.query(`
    INSERT INTO wines (producer, wine_name, vintage, color, country, region, sub_region, appellation, varietal, designation, vineyard, drink_window_start, drink_window_end, user_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id
  `, [
    input.producer, input.wine_name, input.vintage || null,
    input.color || null, input.country || null, input.region || null,
    input.sub_region || null, input.appellation || null, input.varietal || null,
    input.designation || null, input.vineyard || null,
    input.drink_window_start || null, input.drink_window_end || null,
    userId || null
  ]);

  const wineId = result.rows[0].id;
  const qty = input.quantity || 1;

  for (let i = 0; i < qty; i++) {
    await pool.query(`
      INSERT INTO bottles (wine_id, purchase_price, estimated_value, location, size, notes, user_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [wineId, input.purchase_price || null, input.estimated_value || null,
        input.location || null, input.size || "750ml", input.notes || null, userId || null]);
  }

  return JSON.stringify({ success: true, wine_id: wineId, bottles_added: qty, message: `Added ${input.producer} ${input.wine_name}${input.vintage ? ` ${input.vintage}` : ""} with ${qty} bottle(s)` });
}

async function addBottles(input: any, userId?: number): Promise<string> {
  const wineResult = userId
    ? await pool.query("SELECT * FROM wines WHERE id = $1 AND user_id = $2", [input.wine_id, userId])
    : await pool.query("SELECT * FROM wines WHERE id = $1", [input.wine_id]);
  if (wineResult.rows.length === 0) return JSON.stringify({ error: "Wine not found" });
  const wine = wineResult.rows[0];

  const qty = input.quantity || 1;
  for (let i = 0; i < qty; i++) {
    await pool.query(`
      INSERT INTO bottles (wine_id, purchase_price, estimated_value, location, size, notes, user_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [input.wine_id, input.purchase_price || null, input.estimated_value || null,
        input.location || null, input.size || "750ml", input.notes || null, userId || null]);
  }

  return JSON.stringify({ success: true, message: `Added ${qty} bottle(s) of ${wine.producer} ${wine.wine_name}` });
}

async function updateWine(input: any, userId?: number): Promise<string> {
  const wineResult = userId
    ? await pool.query("SELECT * FROM wines WHERE id = $1 AND user_id = $2", [input.wine_id, userId])
    : await pool.query("SELECT * FROM wines WHERE id = $1", [input.wine_id]);
  if (wineResult.rows.length === 0) return JSON.stringify({ error: "Wine not found" });

  const fields = ["producer", "wine_name", "vintage", "color", "country", "region", "sub_region", "appellation", "varietal", "designation", "vineyard", "drink_window_start", "drink_window_end", "ct_community_score"];
  const updates: string[] = [];
  const values: any[] = [];
  let paramIdx = 1;

  for (const field of fields) {
    if (input[field] !== undefined) {
      updates.push(`${field} = $${paramIdx++}`);
      values.push(input[field]);
    }
  }

  if (updates.length === 0) return JSON.stringify({ error: "No fields to update" });

  updates.push(`updated_at = NOW()`);
  values.push(input.wine_id);
  await pool.query(`UPDATE wines SET ${updates.join(", ")} WHERE id = $${paramIdx}`, values);

  return JSON.stringify({ success: true, message: "Wine updated" });
}

async function updateBottle(input: any, userId?: number): Promise<string> {
  const bottleResult = userId
    ? await pool.query("SELECT * FROM bottles WHERE id = $1 AND user_id = $2", [input.bottle_id, userId])
    : await pool.query("SELECT * FROM bottles WHERE id = $1", [input.bottle_id]);
  if (bottleResult.rows.length === 0) return JSON.stringify({ error: "Bottle not found" });

  const fields = ["location", "notes", "estimated_value", "purchase_price"];
  const updates: string[] = [];
  const values: any[] = [];
  let paramIdx = 1;

  for (const field of fields) {
    if (input[field] !== undefined) {
      updates.push(`${field} = $${paramIdx++}`);
      values.push(input[field]);
    }
  }

  if (updates.length === 0) return JSON.stringify({ error: "No fields to update" });

  values.push(input.bottle_id);
  await pool.query(`UPDATE bottles SET ${updates.join(", ")} WHERE id = $${paramIdx}`, values);

  return JSON.stringify({ success: true, message: "Bottle updated" });
}

async function consumeBottle(input: any, userId?: number): Promise<string> {
  const bottleResult = userId
    ? await pool.query("SELECT * FROM bottles WHERE id = $1 AND user_id = $2", [input.bottle_id, userId])
    : await pool.query("SELECT * FROM bottles WHERE id = $1", [input.bottle_id]);
  if (bottleResult.rows.length === 0) return JSON.stringify({ error: "Bottle not found" });
  const bottle = bottleResult.rows[0];
  if (bottle.status !== "in_cellar") return JSON.stringify({ error: "This bottle is not in the cellar (already consumed/removed)" });

  const wineResult = await pool.query("SELECT * FROM wines WHERE id = $1", [bottle.wine_id]);
  const wine = wineResult.rows[0];
  const consumeDate = input.consumed_date || new Date().toISOString().split("T")[0];

  await pool.query(
    "UPDATE bottles SET status = 'consumed', consumed_date = $1, occasion = $2, rating = $3 WHERE id = $4",
    [consumeDate, input.occasion || null, input.rating || null, input.bottle_id]
  );

  await pool.query(`
    INSERT INTO consumption_log (bottle_id, wine_id, consumed_date, occasion, paired_with, who_with, rating, tasting_notes, user_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
  `, [input.bottle_id, bottle.wine_id, consumeDate, input.occasion || null, input.paired_with || null,
      input.who_with || null, input.rating || null, input.tasting_notes || null, userId || null]);

  return JSON.stringify({
    success: true,
    message: `Recorded consumption of ${wine.producer} ${wine.wine_name}${wine.vintage ? ` ${wine.vintage}` : ""}. ${input.rating ? `Rated ${input.rating}/5.` : ""}`
  });
}

async function getCellarStats(userId?: number): Promise<string> {
  const userFilter = userId ? "AND user_id = $1" : "";
  const userParams = userId ? [userId] : [];

  const bottleFilter = userId ? "AND b.user_id = $1" : "";

  const totalBottles = (await pool.query(`SELECT COUNT(*) as c FROM bottles WHERE status = 'in_cellar' ${userFilter}`, userParams)).rows[0].c;
  const totalValue = (await pool.query(`SELECT COALESCE(SUM(estimated_value), 0) as v FROM bottles WHERE status = 'in_cellar' ${userFilter}`, userParams)).rows[0].v;
  const uniqueWines = (await pool.query(`SELECT COUNT(DISTINCT wine_id) as c FROM bottles WHERE status = 'in_cellar' ${userFilter}`, userParams)).rows[0].c;
  const consumedBottles = (await pool.query(`SELECT COUNT(*) as c FROM bottles WHERE status = 'consumed' ${userFilter}`, userParams)).rows[0].c;

  const basic = { total_bottles: Number(totalBottles), total_value: Number(totalValue), unique_wines: Number(uniqueWines), consumed_bottles: Number(consumedBottles) };

  const byColor = (await pool.query(`
    SELECT w.color, COUNT(*) as count
    FROM bottles b JOIN wines w ON b.wine_id = w.id
    WHERE b.status = 'in_cellar' AND w.color IS NOT NULL ${bottleFilter}
    GROUP BY w.color ORDER BY count DESC
  `, userParams)).rows;

  const topRegions = (await pool.query(`
    SELECT w.region, COUNT(*) as count
    FROM bottles b JOIN wines w ON b.wine_id = w.id
    WHERE b.status = 'in_cellar' AND w.region IS NOT NULL ${bottleFilter}
    GROUP BY w.region ORDER BY count DESC LIMIT 10
  `, userParams)).rows;

  const topVarietals = (await pool.query(`
    SELECT w.varietal, COUNT(*) as count
    FROM bottles b JOIN wines w ON b.wine_id = w.id
    WHERE b.status = 'in_cellar' AND w.varietal IS NOT NULL ${bottleFilter}
    GROUP BY w.varietal ORDER BY count DESC LIMIT 10
  `, userParams)).rows;

  return JSON.stringify({ ...basic, by_color: byColor, top_regions: topRegions, top_varietals: topVarietals });
}

async function getRecommendations(input: any, userId?: number): Promise<string> {
  const currentYear = new Date().getFullYear();
  const limit = input.limit || 5;
  const params: any[] = [];
  let paramIdx = 1;
  let query = "";

  const userScope = userId ? `AND b.user_id = $${paramIdx}` : "";
  if (userId) { params.push(userId); paramIdx++; }

  switch (input.criteria) {
    case "ready_to_drink":
    case "in_window":
      params.push(currentYear, currentYear);
      query = `
        SELECT w.*, COUNT(CASE WHEN b.status = 'in_cellar' THEN 1 END) as bottle_count,
          AVG(CASE WHEN b.status = 'in_cellar' THEN b.estimated_value END) as avg_value
        FROM wines w JOIN bottles b ON w.id = b.wine_id
        WHERE w.drink_window_start <= $${paramIdx++} AND w.drink_window_end >= $${paramIdx++} AND b.status = 'in_cellar'
        ${userScope}
        ${input.color ? `AND w.color = $${paramIdx}` : ""}
        GROUP BY w.id HAVING COUNT(CASE WHEN b.status = 'in_cellar' THEN 1 END) > 0
        ORDER BY w.ct_community_score DESC NULLS LAST
        LIMIT $${input.color ? paramIdx + 1 : paramIdx}
      `;
      if (input.color) { params.push(input.color); paramIdx++; }
      params.push(limit);
      break;

    case "past_peak":
      params.push(currentYear);
      query = `
        SELECT w.*, COUNT(CASE WHEN b.status = 'in_cellar' THEN 1 END) as bottle_count,
          AVG(CASE WHEN b.status = 'in_cellar' THEN b.estimated_value END) as avg_value
        FROM wines w JOIN bottles b ON w.id = b.wine_id
        WHERE w.drink_window_end < $${paramIdx++} AND w.drink_window_end IS NOT NULL AND b.status = 'in_cellar'
        ${userScope}
        GROUP BY w.id HAVING COUNT(CASE WHEN b.status = 'in_cellar' THEN 1 END) > 0
        ORDER BY w.drink_window_end ASC
        LIMIT $${paramIdx}
      `;
      params.push(limit);
      break;

    case "best_value":
      query = `
        SELECT w.*, COUNT(CASE WHEN b.status = 'in_cellar' THEN 1 END) as bottle_count,
          AVG(CASE WHEN b.status = 'in_cellar' THEN b.estimated_value END) as avg_value
        FROM wines w JOIN bottles b ON w.id = b.wine_id
        WHERE b.status = 'in_cellar'
        ${userScope}
        ${input.color ? `AND w.color = $${paramIdx}` : ""}
        GROUP BY w.id HAVING COUNT(CASE WHEN b.status = 'in_cellar' THEN 1 END) > 0
        ORDER BY avg_value DESC
        LIMIT $${input.color ? paramIdx + 1 : paramIdx}
      `;
      if (input.color) { params.push(input.color); paramIdx++; }
      params.push(limit);
      break;

    case "highest_rated":
      query = `
        SELECT w.*, COUNT(CASE WHEN b.status = 'in_cellar' THEN 1 END) as bottle_count,
          AVG(CASE WHEN b.status = 'in_cellar' THEN b.estimated_value END) as avg_value
        FROM wines w JOIN bottles b ON w.id = b.wine_id
        WHERE b.status = 'in_cellar' AND w.ct_community_score IS NOT NULL
        ${userScope}
        ${input.color ? `AND w.color = $${paramIdx}` : ""}
        GROUP BY w.id HAVING COUNT(CASE WHEN b.status = 'in_cellar' THEN 1 END) > 0
        ORDER BY w.ct_community_score DESC
        LIMIT $${input.color ? paramIdx + 1 : paramIdx}
      `;
      if (input.color) { params.push(input.color); paramIdx++; }
      params.push(limit);
      break;

    case "by_color":
      params.push(input.color || "Red");
      query = `
        SELECT w.*, COUNT(CASE WHEN b.status = 'in_cellar' THEN 1 END) as bottle_count,
          AVG(CASE WHEN b.status = 'in_cellar' THEN b.estimated_value END) as avg_value
        FROM wines w JOIN bottles b ON w.id = b.wine_id
        WHERE b.status = 'in_cellar' AND w.color = $${paramIdx++}
        ${userScope}
        GROUP BY w.id HAVING COUNT(CASE WHEN b.status = 'in_cellar' THEN 1 END) > 0
        ORDER BY w.ct_community_score DESC NULLS LAST
        LIMIT $${paramIdx}
      `;
      params.push(limit);
      break;

    default:
      query = `
        SELECT w.*, COUNT(CASE WHEN b.status = 'in_cellar' THEN 1 END) as bottle_count,
          AVG(CASE WHEN b.status = 'in_cellar' THEN b.estimated_value END) as avg_value
        FROM wines w JOIN bottles b ON w.id = b.wine_id
        WHERE b.status = 'in_cellar'
        ${userScope}
        GROUP BY w.id HAVING COUNT(CASE WHEN b.status = 'in_cellar' THEN 1 END) > 0
        ORDER BY w.ct_community_score DESC NULLS LAST
        LIMIT $${paramIdx}
      `;
      params.push(limit);
      break;
  }

  const result = await pool.query(query, params);
  return JSON.stringify({ recommendations: result.rows, criteria: input.criteria });
}

async function getConsumptionHistory(input: any, userId?: number): Promise<string> {
  const limit = input.limit || 20;
  const params: any[] = [];
  let paramIdx = 1;
  const conditions: string[] = [];

  if (userId) {
    conditions.push(`cl.user_id = $${paramIdx++}`);
    params.push(userId);
  }
  if (input.wine_id) {
    conditions.push(`cl.wine_id = $${paramIdx++}`);
    params.push(input.wine_id);
  }

  const whereStr = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  params.push(limit);

  const result = await pool.query(`
    SELECT cl.*, w.producer, w.wine_name, w.vintage, w.color, w.varietal, w.region
    FROM consumption_log cl
    JOIN wines w ON cl.wine_id = w.id
    ${whereStr}
    ORDER BY cl.consumed_date DESC, cl.id DESC
    LIMIT $${paramIdx}
  `, params);

  return JSON.stringify({ history: result.rows, count: result.rows.length });
}

async function getStorageLocations(userId?: number): Promise<string> {
  const userFilter = userId ? "WHERE sl.user_id = $1" : "";
  const userParams = userId ? [userId] : [];

  const locations = await pool.query(`
    SELECT sl.*, COUNT(b.id) as bottle_count
    FROM storage_locations sl
    LEFT JOIN bottles b ON b.location = sl.name AND b.user_id = sl.user_id AND b.status = 'in_cellar'
    ${userFilter}
    GROUP BY sl.id
    ORDER BY sl.sort_order ASC, sl.id ASC
  `, userParams);

  // Also count bottles in locations not in the storage_locations table
  const untaggedFilter = userId ? "AND user_id = $1" : "";
  const untaggedBottles = await pool.query(`
    SELECT location, COUNT(*) as bottle_count
    FROM bottles
    WHERE status = 'in_cellar' AND location IS NOT NULL ${untaggedFilter}
    GROUP BY location
  `, userParams);

  return JSON.stringify({ locations: locations.rows, all_bottle_locations: untaggedBottles.rows });
}

async function undoConsumption(input: any, userId?: number): Promise<string> {
  const bottleResult = userId
    ? await pool.query("SELECT * FROM bottles WHERE id = $1 AND user_id = $2 AND status = 'consumed'", [input.bottle_id, userId])
    : await pool.query("SELECT * FROM bottles WHERE id = $1 AND status = 'consumed'", [input.bottle_id]);

  if (bottleResult.rows.length === 0) {
    return JSON.stringify({ error: "Bottle not found or not marked as consumed. It may already be back in the cellar." });
  }

  const bottle = bottleResult.rows[0];
  const wineResult = await pool.query("SELECT producer, wine_name, vintage FROM wines WHERE id = $1", [bottle.wine_id]);
  const wine = wineResult.rows[0];

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "UPDATE bottles SET status = 'in_cellar', consumed_date = NULL, occasion = NULL, rating = NULL WHERE id = $1 AND user_id = $2",
      [input.bottle_id, userId]
    );
    await client.query(
      "DELETE FROM consumption_log WHERE bottle_id = $1 AND user_id = $2",
      [input.bottle_id, userId]
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  return JSON.stringify({
    success: true,
    message: `Done — ${wine.producer} ${wine.wine_name}${wine.vintage ? ` ${wine.vintage}` : ""} is back in your cellar.`
  });
}

async function getWeather(input: any): Promise<string> {
  try {
    let url: string;
    if (input.latitude && input.longitude) {
      url = `https://api.open-meteo.com/v1/forecast?latitude=${input.latitude}&longitude=${input.longitude}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=auto&forecast_days=3`;
    } else if (input.location) {
      const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(input.location)}&count=1`);
      const geoData = await geoRes.json() as any;
      if (!geoData.results || geoData.results.length === 0) {
        return JSON.stringify({ error: `Could not find location: ${input.location}` });
      }
      const { latitude, longitude, name, country } = geoData.results[0];
      url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=auto&forecast_days=3`;
    } else {
      return JSON.stringify({ error: "Please provide either a location name or latitude/longitude" });
    }

    const res = await fetch(url);
    const data = await res.json() as any;

    const weatherCodes: Record<number, string> = {
      0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
      45: "Foggy", 48: "Depositing rime fog",
      51: "Light drizzle", 53: "Moderate drizzle", 55: "Dense drizzle",
      61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
      71: "Slight snow", 73: "Moderate snow", 75: "Heavy snow",
      80: "Slight rain showers", 81: "Moderate rain showers", 82: "Violent rain showers",
      95: "Thunderstorm", 96: "Thunderstorm with slight hail", 99: "Thunderstorm with heavy hail",
    };

    const current = data.current;
    const tempF = Math.round(current.temperature_2m * 9 / 5 + 32);

    return JSON.stringify({
      location: input.location || `${data.latitude}, ${data.longitude}`,
      current: {
        temperature_c: current.temperature_2m,
        temperature_f: tempF,
        humidity: current.relative_humidity_2m,
        wind_speed_kmh: current.wind_speed_10m,
        condition: weatherCodes[current.weather_code] || "Unknown",
      },
      forecast: data.daily.time.map((date: string, i: number) => ({
        date,
        high_c: data.daily.temperature_2m_max[i],
        low_c: data.daily.temperature_2m_min[i],
        high_f: Math.round(data.daily.temperature_2m_max[i] * 9 / 5 + 32),
        low_f: Math.round(data.daily.temperature_2m_min[i] * 9 / 5 + 32),
        condition: weatherCodes[data.daily.weather_code[i]] || "Unknown",
      })),
    });
  } catch (err: any) {
    return JSON.stringify({ error: `Weather lookup failed: ${err.message}` });
  }
}

async function saveMemory(input: any, userId?: number): Promise<string> {
  if (!userId) return JSON.stringify({ error: "Authentication required" });
  if (!input.content?.trim()) return JSON.stringify({ error: "Memory content is required" });

  if (input.memory_id) {
    // Update existing memory
    const result = await pool.query(
      "UPDATE cru_memories SET content = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3 RETURNING id",
      [input.content.trim(), input.memory_id, userId]
    );
    if (result.rows.length === 0) return JSON.stringify({ error: "Memory not found" });
    return JSON.stringify({ success: true, memory_id: result.rows[0].id, action: "updated" });
  }

  // Create new memory
  const result = await pool.query(
    "INSERT INTO cru_memories (user_id, content) VALUES ($1, $2) RETURNING id",
    [userId, input.content.trim()]
  );
  return JSON.stringify({ success: true, memory_id: result.rows[0].id, action: "saved" });
}

async function deleteMemory(input: any, userId?: number): Promise<string> {
  if (!userId) return JSON.stringify({ error: "Authentication required" });
  const result = await pool.query(
    "DELETE FROM cru_memories WHERE id = $1 AND user_id = $2 RETURNING id",
    [input.memory_id, userId]
  );
  if (result.rows.length === 0) return JSON.stringify({ error: "Memory not found" });
  return JSON.stringify({ success: true, deleted: input.memory_id });
}

export async function getUserMemories(userId: number): Promise<string[]> {
  const result = await pool.query(
    "SELECT id, content FROM cru_memories WHERE user_id = $1 ORDER BY updated_at DESC",
    [userId]
  );
  return result.rows.map((r: any) => `[#${r.id}] ${r.content}`);
}
