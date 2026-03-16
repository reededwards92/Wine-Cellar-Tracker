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

  await seedAccounts();
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
