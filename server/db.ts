import Database from "better-sqlite3";
import path from "path";

const dbPath = path.resolve(process.cwd(), "cellar.db");
const db = new Database(dbPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS wines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ct_wine_id INTEGER UNIQUE,
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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS bottles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wine_id INTEGER NOT NULL REFERENCES wines(id),
    ct_inventory_id INTEGER UNIQUE,
    ct_barcode TEXT,
    purchase_date TEXT,
    purchase_price REAL,
    estimated_value REAL,
    store TEXT,
    location TEXT,
    bin TEXT,
    size TEXT DEFAULT '750ml',
    notes TEXT,
    status TEXT DEFAULT 'in_cellar',
    consumed_date TEXT,
    occasion TEXT,
    rating INTEGER,
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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_wines_ct_wine_id ON wines(ct_wine_id);
  CREATE INDEX IF NOT EXISTS idx_bottles_wine_id ON bottles(wine_id);
  CREATE INDEX IF NOT EXISTS idx_bottles_status ON bottles(status);
  CREATE INDEX IF NOT EXISTS idx_bottles_ct_inventory_id ON bottles(ct_inventory_id);
  CREATE INDEX IF NOT EXISTS idx_consumption_log_wine_id ON consumption_log(wine_id);
`);

export default db;
