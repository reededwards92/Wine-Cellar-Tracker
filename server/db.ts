import Database from "better-sqlite3";
import path from "path";
import bcrypt from "bcryptjs";

const dbPath = path.resolve(process.cwd(), "cellar.db");
const db = new Database(dbPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name TEXT,
    google_id TEXT UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS wines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS bottles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS consumption_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bottle_id INTEGER REFERENCES bottles(id),
    wine_id INTEGER NOT NULL REFERENCES wines(id),
    consumed_date TEXT NOT NULL,
    occasion TEXT,
    paired_with TEXT,
    who_with TEXT,
    rating INTEGER,
    tasting_notes TEXT,
    user_id INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_wines_ct_wine_id_user ON wines(ct_wine_id, user_id) WHERE ct_wine_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_wines_user_id ON wines(user_id);
  CREATE INDEX IF NOT EXISTS idx_bottles_wine_id ON bottles(wine_id);
  CREATE INDEX IF NOT EXISTS idx_bottles_status ON bottles(status);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_bottles_ct_inventory_id_user ON bottles(ct_inventory_id, user_id) WHERE ct_inventory_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_bottles_user_id ON bottles(user_id);
  CREATE INDEX IF NOT EXISTS idx_consumption_log_wine_id ON consumption_log(wine_id);
  CREATE INDEX IF NOT EXISTS idx_consumption_log_user_id ON consumption_log(user_id);
  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
`);

function addColumnIfMissing(table: string, column: string, type: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as any[];
  if (!cols.find((c: any) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

addColumnIfMissing("wines", "user_id", "INTEGER REFERENCES users(id)");
addColumnIfMissing("bottles", "user_id", "INTEGER REFERENCES users(id)");
addColumnIfMissing("consumption_log", "user_id", "INTEGER REFERENCES users(id)");

function seedAccounts() {
  const existingUser = db.prepare("SELECT id FROM users WHERE email = ?").get("reededwards92@gmail.com") as any;
  if (existingUser) return;

  const ownerHash = bcrypt.hashSync("winefan1992", 10);
  const ownerResult = db.prepare(
    "INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)"
  ).run("reededwards92@gmail.com", ownerHash, "Reed");

  const ownerId = ownerResult.lastInsertRowid;

  db.prepare("UPDATE wines SET user_id = ? WHERE user_id IS NULL").run(ownerId);
  db.prepare("UPDATE bottles SET user_id = ? WHERE user_id IS NULL").run(ownerId);
  db.prepare("UPDATE consumption_log SET user_id = ? WHERE user_id IS NULL").run(ownerId);

  const appleHash = bcrypt.hashSync("AppleReview2025!", 10);
  const appleResult = db.prepare(
    "INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)"
  ).run("apple@review.com", appleHash, "Apple Reviewer");

  const appleId = appleResult.lastInsertRowid;

  const insertWine = db.prepare(`
    INSERT INTO wines (producer, wine_name, vintage, color, country, region, varietal, drink_window_start, drink_window_end, ct_community_score, user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertBottle = db.prepare(`
    INSERT INTO bottles (wine_id, purchase_price, estimated_value, location, size, status, user_id)
    VALUES (?, ?, ?, ?, ?, 'in_cellar', ?)
  `);

  const sampleWines = [
    { producer: "Caymus Vineyards", wine_name: "Cabernet Sauvignon", vintage: 2021, color: "Red", country: "USA", region: "Napa Valley", varietal: "Cabernet Sauvignon", dws: 2024, dwe: 2032, score: 91.5, price: 89, value: 95, location: "Rack" },
    { producer: "Cloudy Bay", wine_name: "Sauvignon Blanc", vintage: 2023, color: "White", country: "New Zealand", region: "Marlborough", varietal: "Sauvignon Blanc", dws: 2024, dwe: 2026, score: 89.0, price: 22, value: 24, location: "Fridge" },
    { producer: "Veuve Clicquot", wine_name: "Yellow Label Brut", vintage: null, color: "Sparkling", country: "France", region: "Champagne", varietal: "Chardonnay, Pinot Noir", dws: 2024, dwe: 2028, score: 90.0, price: 55, value: 60, location: "Fridge" },
    { producer: "Antinori", wine_name: "Tignanello", vintage: 2020, color: "Red", country: "Italy", region: "Tuscany", varietal: "Sangiovese", dws: 2025, dwe: 2035, score: 94.0, price: 120, value: 140, location: "Rack" },
    { producer: "Kim Crawford", wine_name: "Sauvignon Blanc", vintage: 2023, color: "White", country: "New Zealand", region: "Marlborough", varietal: "Sauvignon Blanc", dws: 2024, dwe: 2025, score: 87.0, price: 14, value: 14, location: "Fridge" },
  ];

  for (const w of sampleWines) {
    const wineResult = insertWine.run(w.producer, w.wine_name, w.vintage, w.color, w.country, w.region, w.varietal, w.dws, w.dwe, w.score, appleId);
    insertBottle.run(wineResult.lastInsertRowid, w.price, w.value, w.location, "750ml", appleId);
  }
}

seedAccounts();

export default db;
