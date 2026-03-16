import pg from "pg";
import bcrypt from "bcryptjs";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function initializeDatabase() {
  await pool.query(`CREATE EXTENSION IF NOT EXISTS unaccent`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      display_name TEXT,
      google_id TEXT UNIQUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS wines (
      id SERIAL PRIMARY KEY,
      ct_wine_id INTEGER,
      producer TEXT NOT NULL,
      wine_name TEXT NOT NULL,
      vintage INTEGER,
      country TEXT,
      region TEXT,
      sub_region TEXT,
      appellation TEXT,
      varietal TEXT,
      color TEXT,
      wine_type TEXT,
      category TEXT,
      designation TEXT,
      vineyard TEXT,
      drink_window_start INTEGER,
      drink_window_end INTEGER,
      ct_community_score REAL,
      critic_scores TEXT,
      user_id INTEGER REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS bottles (
      id SERIAL PRIMARY KEY,
      wine_id INTEGER NOT NULL REFERENCES wines(id),
      ct_inventory_id INTEGER,
      ct_barcode TEXT,
      purchase_date TEXT,
      purchase_price REAL,
      estimated_value REAL,
      location TEXT,
      size TEXT DEFAULT '750ml',
      notes TEXT,
      status TEXT DEFAULT 'in_cellar',
      consumed_date TEXT,
      occasion TEXT,
      rating INTEGER,
      user_id INTEGER REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS consumption_log (
      id SERIAL PRIMARY KEY,
      bottle_id INTEGER REFERENCES bottles(id),
      wine_id INTEGER NOT NULL REFERENCES wines(id),
      consumed_date TEXT NOT NULL,
      occasion TEXT,
      paired_with TEXT,
      who_with TEXT,
      rating INTEGER,
      tasting_notes TEXT,
      user_id INTEGER REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS storage_locations (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS cru_memories (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_storage_locations_user_id ON storage_locations(user_id)`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_wines_ct_wine_id_user ON wines(ct_wine_id, user_id) WHERE ct_wine_id IS NOT NULL`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_wines_user_id ON wines(user_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_bottles_wine_id ON bottles(wine_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_bottles_status ON bottles(status)`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_bottles_ct_inventory_id_user ON bottles(ct_inventory_id, user_id) WHERE ct_inventory_id IS NOT NULL`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_bottles_user_id ON bottles(user_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_consumption_log_wine_id ON consumption_log(wine_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_consumption_log_user_id ON consumption_log(user_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL`);
  await pool.query(`ALTER TABLE cru_memories ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT 'general'`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS push_token TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS has_completed_onboarding BOOLEAN DEFAULT false`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notification_preferences (
      user_id INTEGER PRIMARY KEY REFERENCES users(id),
      drink_window_alerts BOOLEAN DEFAULT true,
      weekly_digest BOOLEAN DEFAULT true,
      daily_max INTEGER DEFAULT 2,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notification_log (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      wine_id INTEGER REFERENCES wines(id),
      type VARCHAR(50),
      sent_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_cru_memories_user_id ON cru_memories(user_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id)`);

  await pool.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);

  await pool.query(`
    CREATE OR REPLACE FUNCTION normalize_wine_text(input TEXT) RETURNS TEXT AS $$
      SELECT TRIM(
        REGEXP_REPLACE(
          REGEXP_REPLACE(
            REGEXP_REPLACE(
              LOWER(unaccent(input)),
              '\\mch\\.\\s*', 'chateau ', 'gi'),
            '\\mdom\\.\\s*', 'domaine ', 'gi'),
          '\\s+', ' ', 'g')
      );
    $$ LANGUAGE SQL STABLE;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS master_wines (
      id SERIAL PRIMARY KEY,
      producer TEXT NOT NULL,
      producer_normalized TEXT NOT NULL,
      wine_name TEXT,
      wine_name_normalized TEXT,
      vintage INTEGER,
      color TEXT,
      country TEXT,
      region TEXT,
      sub_region TEXT,
      appellation TEXT,
      varietal TEXT,
      designation TEXT,
      vineyard TEXT,
      wine_type TEXT,
      drink_window_start INTEGER,
      drink_window_end INTEGER,
      avg_community_score NUMERIC(4,2),
      avg_purchase_price NUMERIC(10,2),
      avg_estimated_value NUMERIC(10,2),
      field_confidence JSONB NOT NULL DEFAULT '{}',
      source TEXT NOT NULL DEFAULT 'ai',
      times_added INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS wine_field_corrections (
      id SERIAL PRIMARY KEY,
      master_wine_id INTEGER NOT NULL REFERENCES master_wines(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      field_name TEXT NOT NULL,
      old_value TEXT,
      new_value TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(master_wine_id, user_id, field_name, new_value)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS master_wine_audit_log (
      id SERIAL PRIMARY KEY,
      master_wine_id INTEGER NOT NULL REFERENCES master_wines(id) ON DELETE CASCADE,
      field_name TEXT NOT NULL,
      old_value TEXT,
      new_value TEXT NOT NULL,
      trigger_type TEXT NOT NULL DEFAULT 'auto',
      correction_count INTEGER NOT NULL,
      total_users INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_master_wines_producer_norm ON master_wines (producer_normalized)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_master_wines_composite ON master_wines (producer_normalized, vintage, color)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_master_wines_trgm ON master_wines USING GIN (producer_normalized gin_trgm_ops)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_corrections_master_wine ON wine_field_corrections (master_wine_id, field_name)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_master_wine ON master_wine_audit_log (master_wine_id)`);
  await pool.query(`ALTER TABLE wines ADD COLUMN IF NOT EXISTS master_wine_id INTEGER REFERENCES master_wines(id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_wines_master_wine ON wines (master_wine_id) WHERE master_wine_id IS NOT NULL`);

  await backfillMasterWines();

  await seedAccounts();
}

async function backfillMasterWines() {
  // Only run if there are wines not yet linked to a master record
  const unlinked = await pool.query(
    "SELECT COUNT(*) FROM wines WHERE master_wine_id IS NULL"
  );
  if (parseInt(unlinked.rows[0].count) === 0) return;

  console.log("[backfill] Linking existing wines to master records...");

  // Group wines by normalized identity and create master records
  const groups = await pool.query(`
    SELECT
      normalize_wine_text(producer) as producer_norm,
      MIN(producer) as producer,
      wine_name,
      vintage,
      color,
      MIN(country) as country,
      MIN(region) as region,
      MIN(sub_region) as sub_region,
      MIN(appellation) as appellation,
      MIN(varietal) as varietal,
      MIN(designation) as designation,
      MIN(vineyard) as vineyard,
      MIN(wine_type) as wine_type,
      MIN(drink_window_start) as drink_window_start,
      MIN(drink_window_end) as drink_window_end,
      AVG(ct_community_score) as avg_score,
      COUNT(*) as wine_count
    FROM wines
    WHERE master_wine_id IS NULL AND producer IS NOT NULL
    GROUP BY normalize_wine_text(producer), wine_name, vintage, color
  `);

  for (const g of groups.rows) {
    const wineNameNorm = g.wine_name
      ? g.wine_name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()
      : null;

    // Check if master already exists
    const existing = await pool.query(
      `SELECT id FROM master_wines WHERE producer_normalized = $1 AND (vintage = $2 OR (vintage IS NULL AND $2 IS NULL)) AND (color = $3 OR (color IS NULL AND $3 IS NULL))`,
      [g.producer_norm, g.vintage, g.color]
    );

    let masterWineId: number;
    if (existing.rows.length > 0) {
      masterWineId = existing.rows[0].id;
    } else {
      const inserted = await pool.query(`
        INSERT INTO master_wines (producer, producer_normalized, wine_name, wine_name_normalized, vintage, color, country, region, sub_region, appellation, varietal, designation, vineyard, wine_type, drink_window_start, drink_window_end, avg_community_score, field_confidence, source, times_added)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, 'import', $19)
        RETURNING id
      `, [
        g.producer, g.producer_norm, g.wine_name, wineNameNorm,
        g.vintage, g.color, g.country, g.region, g.sub_region,
        g.appellation, g.varietal, g.designation, g.vineyard, g.wine_type,
        g.drink_window_start, g.drink_window_end,
        g.avg_score ? Math.round(Number(g.avg_score) * 100) / 100 : null,
        JSON.stringify({ producer: 0.5, wine_name: 0.5, vintage: 0.5, color: 0.5 }),
        parseInt(g.wine_count),
      ]);
      masterWineId = inserted.rows[0].id;
    }

    await pool.query(
      "UPDATE wines SET master_wine_id = $1 WHERE master_wine_id IS NULL AND normalize_wine_text(producer) = $2 AND (wine_name = $3 OR (wine_name IS NULL AND $3 IS NULL)) AND (vintage = $4 OR (vintage IS NULL AND $4 IS NULL)) AND (color = $5 OR (color IS NULL AND $5 IS NULL))",
      [masterWineId, g.producer_norm, g.wine_name, g.vintage, g.color]
    );
  }

  console.log(`[backfill] Done. Processed ${groups.rows.length} wine groups.`);
}

async function seedAccounts() {
  const existing = await pool.query("SELECT id FROM users WHERE email = $1", ["reededwards92@gmail.com"]);
  if (existing.rows.length > 0) return;

  const ownerHash = bcrypt.hashSync("winefan1992", 10);
  const ownerResult = await pool.query(
    "INSERT INTO users (email, password_hash, display_name) VALUES ($1, $2, $3) RETURNING id",
    ["reededwards92@gmail.com", ownerHash, "Reed"]
  );
  const ownerId = ownerResult.rows[0].id;

  await pool.query("UPDATE wines SET user_id = $1 WHERE user_id IS NULL", [ownerId]);
  await pool.query("UPDATE bottles SET user_id = $1 WHERE user_id IS NULL", [ownerId]);
  await pool.query("UPDATE consumption_log SET user_id = $1 WHERE user_id IS NULL", [ownerId]);

  const appleHash = bcrypt.hashSync("AppleReview2025!", 10);
  const appleResult = await pool.query(
    "INSERT INTO users (email, password_hash, display_name) VALUES ($1, $2, $3) RETURNING id",
    ["apple@review.com", appleHash, "Apple Reviewer"]
  );
  const appleId = appleResult.rows[0].id;

  const sampleWines = [
    { producer: "Caymus Vineyards", wine_name: "Cabernet Sauvignon", vintage: 2021, color: "Red", country: "USA", region: "Napa Valley", varietal: "Cabernet Sauvignon", dws: 2024, dwe: 2032, score: 91.5, price: 89, value: 95, location: "Rack" },
    { producer: "Cloudy Bay", wine_name: "Sauvignon Blanc", vintage: 2023, color: "White", country: "New Zealand", region: "Marlborough", varietal: "Sauvignon Blanc", dws: 2024, dwe: 2026, score: 89.0, price: 22, value: 24, location: "Fridge" },
    { producer: "Veuve Clicquot", wine_name: "Yellow Label Brut", vintage: null, color: "Sparkling", country: "France", region: "Champagne", varietal: "Chardonnay, Pinot Noir", dws: 2024, dwe: 2028, score: 90.0, price: 55, value: 60, location: "Fridge" },
    { producer: "Antinori", wine_name: "Tignanello", vintage: 2020, color: "Red", country: "Italy", region: "Tuscany", varietal: "Sangiovese", dws: 2025, dwe: 2035, score: 94.0, price: 120, value: 140, location: "Rack" },
    { producer: "Kim Crawford", wine_name: "Sauvignon Blanc", vintage: 2023, color: "White", country: "New Zealand", region: "Marlborough", varietal: "Sauvignon Blanc", dws: 2024, dwe: 2025, score: 87.0, price: 14, value: 14, location: "Fridge" },
  ];

  for (const w of sampleWines) {
    const wineResult = await pool.query(
      `INSERT INTO wines (producer, wine_name, vintage, color, country, region, varietal, drink_window_start, drink_window_end, ct_community_score, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
      [w.producer, w.wine_name, w.vintage, w.color, w.country, w.region, w.varietal, w.dws, w.dwe, w.score, appleId]
    );
    await pool.query(
      `INSERT INTO bottles (wine_id, purchase_price, estimated_value, location, size, status, user_id)
       VALUES ($1, $2, $3, $4, $5, 'in_cellar', $6)`,
      [wineResult.rows[0].id, w.price, w.value, w.location, "750ml", appleId]
    );
  }
}

export default pool;
