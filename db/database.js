const Database = require('better-sqlite3');
const path = require('path');
const { MEDICINES, CATEGORIES } = require('../data/medicines');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../data/medicijnkast.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initDb();
  }
  return db;
}

function initDb() {
  const db = getDb();

  // Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Medicines reference table (autocomplete)
  db.exec(`
    CREATE TABLE IF NOT EXISTS medicine_db (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      generic TEXT,
      category TEXT NOT NULL,
      form TEXT,
      rx INTEGER DEFAULT 0
    );
  `);

  // Inventory table
  db.exec(`
    CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      generic TEXT,
      category TEXT NOT NULL,
      form TEXT,
      quantity INTEGER DEFAULT 1,
      unit TEXT DEFAULT 'stuks',
      expiry_date DATE,
      notes TEXT,
      location TEXT DEFAULT 'Medicijnkastje',
      rx INTEGER DEFAULT 0,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Alerts / follow-up table
  db.exec(`
    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      inventory_id INTEGER,
      alert_type TEXT NOT NULL,
      alert_date DATE,
      message TEXT,
      resolved INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (inventory_id) REFERENCES inventory(id) ON DELETE CASCADE
    );
  `);

  // Populate medicine_db if empty
  const count = db.prepare('SELECT COUNT(*) as c FROM medicine_db').get();
  if (count.c === 0) {
    const insert = db.prepare(
      'INSERT INTO medicine_db (name, generic, category, form, rx) VALUES (@name, @generic, @category, @form, @rx)'
    );
    const insertMany = db.transaction((meds) => {
      for (const m of meds) {
        insert.run({
          name: m.name,
          generic: m.generic || '',
          category: m.category,
          form: m.form || '',
          rx: m.rx ? 1 : 0
        });
      }
    });
    insertMany(MEDICINES);
    console.log(`✅ Medicine database loaded: ${MEDICINES.length} medicines`);
  }
}

// Search medicines for autocomplete
function searchMedicines(query, limit = 15) {
  const db = getDb();
  const q = `%${query}%`;
  return db.prepare(`
    SELECT name, generic, category, form, rx 
    FROM medicine_db 
    WHERE name LIKE ? OR generic LIKE ?
    ORDER BY 
      CASE WHEN name LIKE ? THEN 0 ELSE 1 END,
      name ASC
    LIMIT ?
  `).all(q, q, `${query}%`, limit);
}

// Get all categories with counts
function getCategoryStats() {
  const db = getDb();
  return db.prepare(`
    SELECT category, COUNT(*) as count 
    FROM inventory 
    GROUP BY category 
    ORDER BY category
  `).all();
}

// Get inventory with optional filters
function getInventory(filters = {}) {
  const db = getDb();
  let query = 'SELECT * FROM inventory WHERE 1=1';
  const params = [];

  if (filters.category) {
    query += ' AND category = ?';
    params.push(filters.category);
  }
  if (filters.search) {
    query += ' AND (name LIKE ? OR generic LIKE ? OR notes LIKE ?)';
    const s = `%${filters.search}%`;
    params.push(s, s, s);
  }
  if (filters.expiring) {
    query += ' AND expiry_date IS NOT NULL AND expiry_date <= date("now", "+30 days")';
  }

  query += ' ORDER BY expiry_date ASC, name ASC';
  return db.prepare(query).all(...params);
}

// Add inventory item
function addInventoryItem(item) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO inventory (name, generic, category, form, quantity, unit, expiry_date, notes, location, rx)
    VALUES (@name, @generic, @category, @form, @quantity, @unit, @expiry_date, @notes, @location, @rx)
  `);
  const result = stmt.run(item);
  return result.lastInsertRowid;
}

// Update inventory item
function updateInventoryItem(id, item) {
  const db = getDb();
  const stmt = db.prepare(`
    UPDATE inventory SET
      name = @name,
      generic = @generic,
      category = @category,
      form = @form,
      quantity = @quantity,
      unit = @unit,
      expiry_date = @expiry_date,
      notes = @notes,
      location = @location,
      rx = @rx,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `);
  return stmt.run({ ...item, id });
}

// Delete inventory item
function deleteInventoryItem(id) {
  const db = getDb();
  return db.prepare('DELETE FROM inventory WHERE id = ?').run(id);
}

// Get dashboard stats
function getDashboardStats() {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];
  const in30 = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
  const in90 = new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0];

  return {
    total: db.prepare('SELECT COUNT(*) as c FROM inventory').get().c,
    expired: db.prepare('SELECT COUNT(*) as c FROM inventory WHERE expiry_date IS NOT NULL AND expiry_date < ?').get(today).c,
    expiring30: db.prepare('SELECT COUNT(*) as c FROM inventory WHERE expiry_date IS NOT NULL AND expiry_date >= ? AND expiry_date <= ?').get(today, in30).c,
    expiring90: db.prepare('SELECT COUNT(*) as c FROM inventory WHERE expiry_date IS NOT NULL AND expiry_date > ? AND expiry_date <= ?').get(in30, in90).c,
    categories: db.prepare('SELECT COUNT(DISTINCT category) as c FROM inventory').get().c,
    rx: db.prepare('SELECT COUNT(*) as c FROM inventory WHERE rx = 1').get().c,
  };
}

// Get expiring items
function getExpiringItems(days = 30) {
  const db = getDb();
  const future = new Date(Date.now() + days * 86400000).toISOString().split('T')[0];
  const today = new Date().toISOString().split('T')[0];
  return db.prepare(`
    SELECT * FROM inventory 
    WHERE expiry_date IS NOT NULL AND expiry_date <= ? 
    ORDER BY expiry_date ASC
  `).all(future);
}

module.exports = {
  getDb,
  searchMedicines,
  getCategoryStats,
  getInventory,
  addInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  getDashboardStats,
  getExpiringItems,
  CATEGORIES,
};
