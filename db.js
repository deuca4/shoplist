const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

// Determine database path from ENV or default to local data folder
const dbDir = process.env.DATABASE_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = process.env.DATABASE_PATH || path.join(dbDir, 'shopping.db');
console.log(`[Database] Initializing SQLite database at: ${dbPath}`);

const db = new Database(dbPath);

// Enable WAL mode for high performance concurrent reads/writes
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ---------------------------------------------------------------------------
// Migration Registry
// Append new migrations to the END of this array — never edit existing ones.
// Each migration runs exactly once and is permanently recorded.
// ---------------------------------------------------------------------------
const migrations = [
  // v1 — Initial schema
  {
    version: 1,
    description: 'Initial schema: lists, categories, items, frequent_items',
    up: `
      CREATE TABLE IF NOT EXISTS lists (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT NOT NULL,
        icon        TEXT DEFAULT '🛒',
        color       TEXT DEFAULT '#6366f1',
        is_archived INTEGER DEFAULT 0,
        created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS categories (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT NOT NULL UNIQUE,
        icon       TEXT DEFAULT '📌',
        color      TEXT DEFAULT '#64748b',
        sort_order INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS items (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        list_id         INTEGER NOT NULL,
        category_id     INTEGER,
        name            TEXT NOT NULL,
        quantity        REAL DEFAULT 1,
        unit            TEXT DEFAULT 'pcs',
        estimated_price REAL DEFAULT 0,
        actual_price    REAL DEFAULT 0,
        notes           TEXT DEFAULT '',
        is_checked      INTEGER DEFAULT 0,
        priority        TEXT DEFAULT 'medium',
        added_by        TEXT DEFAULT 'User',
        created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (list_id)     REFERENCES lists(id)      ON DELETE CASCADE,
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS frequent_items (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT NOT NULL UNIQUE,
        category_id INTEGER,
        unit        TEXT DEFAULT 'pcs',
        usage_count INTEGER DEFAULT 1,
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
      );
    `
  },

  // -------------------------------------------------------------------------
  // Add future schema changes below this line.
  // Example:
  // {
  //   version: 2,
  //   description: 'Add tags column to items',
  //   up: `ALTER TABLE items ADD COLUMN tags TEXT DEFAULT ''`
  // },
  // -------------------------------------------------------------------------
];

// ---------------------------------------------------------------------------
// Migration Engine
// ---------------------------------------------------------------------------

function bootstrapMigrationsTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     INTEGER PRIMARY KEY,
      description TEXT,
      applied_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

function getCurrentVersion() {
  const row = db.prepare('SELECT MAX(version) as version FROM schema_migrations').get();
  return row?.version ?? 0;
}

function runMigrations() {
  bootstrapMigrationsTable();

  const currentVersion = getCurrentVersion();
  const pending = migrations.filter(m => m.version > currentVersion);

  if (pending.length === 0) {
    console.log(`[Migrations] Schema is up to date (v${currentVersion})`);
    return;
  }

  console.log(`[Migrations] Current version: v${currentVersion}. Applying ${pending.length} migration(s)...`);

  const recordMigration = db.prepare(
    'INSERT INTO schema_migrations (version, description) VALUES (?, ?)'
  );

  for (const migration of pending) {
    const applyMigration = db.transaction(() => {
      db.exec(migration.up);
      recordMigration.run(migration.version, migration.description);
    });

    try {
      applyMigration();
      console.log(`[Migrations] ✓ Applied v${migration.version}: ${migration.description}`);
    } catch (err) {
      console.error(`[Migrations] ✗ Failed on v${migration.version}: ${err.message}`);
      throw err; // halt startup — do not run the app on a broken schema
    }
  }

  console.log(`[Migrations] Schema upgraded to v${migrations[migrations.length - 1].version}`);
}

// ---------------------------------------------------------------------------
// Seed Data (only runs on a brand-new, empty database)
// ---------------------------------------------------------------------------

function seedDefaultData() {
  const categoryCount = db.prepare('SELECT COUNT(*) as count FROM categories').get().count;
  if (categoryCount === 0) {
    const insertCat = db.prepare(
      'INSERT INTO categories (name, icon, color, sort_order) VALUES (?, ?, ?, ?)'
    );
    const defaultCategories = [
      ['Produce',              '🍎', '#ef4444',  1],
      ['Dairy & Eggs',         '🥛', '#f59e0b',  2],
      ['Meat & Seafood',       '🥩', '#dc2626',  3],
      ['Bakery',               '🍞', '#d97706',  4],
      ['Pantry & Canned',      '📦', '#84cc16',  5],
      ['Snacks & Sweets',      '🍫', '#ec4899',  6],
      ['Beverages',            '🥤', '#06b6d4',  7],
      ['Frozen Foods',         '❄️', '#3b82f6',  8],
      ['Household & Cleaning', '🧼', '#10b981',  9],
      ['Personal Care',        '🧴', '#8b5cf6', 10],
      ['General / Other',      '📌', '#64748b', 99],
    ];
    for (const cat of defaultCategories) insertCat.run(...cat);
  }

  const listCount = db.prepare(
    'SELECT COUNT(*) as count FROM lists WHERE is_archived = 0'
  ).get().count;

  if (listCount === 0) {
    const insertList = db.prepare('INSERT INTO lists (name, icon, color) VALUES (?, ?, ?)');
    const result = insertList.run('Weekly Groceries', '🛒', '#6366f1');
    const defaultListId = result.lastInsertRowid;

    const produceCat  = db.prepare('SELECT id FROM categories WHERE name = ?').get('Produce');
    const dairyCat    = db.prepare('SELECT id FROM categories WHERE name = ?').get('Dairy & Eggs');
    const bakeryCat   = db.prepare('SELECT id FROM categories WHERE name = ?').get('Bakery');
    const beverageCat = db.prepare('SELECT id FROM categories WHERE name = ?').get('Beverages');

    const insertItem = db.prepare(`
      INSERT INTO items (list_id, category_id, name, quantity, unit, estimated_price, priority, is_checked)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertItem.run(defaultListId, produceCat?.id  || null, 'Organic Apples',            6, 'pcs',    4.99, 'medium', 0);
    insertItem.run(defaultListId, produceCat?.id  || null, 'Bananas',                   1, 'bunch',  1.99, 'high',   0);
    insertItem.run(defaultListId, dairyCat?.id    || null, 'Whole Milk (1 Gallon)',      1, 'carton', 3.49, 'high',   0);
    insertItem.run(defaultListId, dairyCat?.id    || null, 'Greek Yogurt',              2, 'tubs',   5.00, 'low',    1);
    insertItem.run(defaultListId, bakeryCat?.id   || null, 'Sourdough Bread',           1, 'loaf',   4.50, 'medium', 0);
    insertItem.run(defaultListId, beverageCat?.id || null, 'Sparkling Water (12 pack)', 2, 'packs',  9.98, 'medium', 1);

    const insertFrequent = db.prepare(
      'INSERT OR IGNORE INTO frequent_items (name, category_id, unit, usage_count) VALUES (?, ?, ?, ?)'
    );
    insertFrequent.run('Whole Milk',      dairyCat?.id   || null, 'carton', 10);
    insertFrequent.run('Eggs (12 pack)',  dairyCat?.id   || null, 'box',     8);
    insertFrequent.run('Bananas',         produceCat?.id || null, 'bunch',   7);
    insertFrequent.run('Avocados',        produceCat?.id || null, 'pcs',     6);
    insertFrequent.run('Sourdough Bread', bakeryCat?.id  || null, 'loaf',    5);
  }
}

// ---------------------------------------------------------------------------
// Boot sequence
// ---------------------------------------------------------------------------
runMigrations();
seedDefaultData();

module.exports = db;
