const express = require('express');
const Database = require('better-sqlite3');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const session = require('express-session');

const app = express();
app.use(cors());
app.use(express.json());

// ── Session setup ──────────────────────────────────────────────────
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    maxAge: 8 * 60 * 60 * 1000  // 8 uur
  }
}));

// ── Credentials via env vars ───────────────────────────────────────
const APP_USER     = process.env.APP_USER     || 'apotheek';
const APP_PASSWORD = process.env.APP_PASSWORD || 'apotheek';

// ── Auth middleware ────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (req.session && req.session.loggedIn) return next();
  res.status(401).json({ error: 'Niet ingelogd' });
}

// ── Login endpoints ────────────────────────────────────────────────
app.post('/api/login', (req, res) => {
  const { gebruiker, wachtwoord } = req.body;
  if (gebruiker === APP_USER && wachtwoord === APP_PASSWORD) {
    req.session.loggedIn = true;
    req.session.gebruiker = gebruiker;
    return res.json({ success: true });
  }
  // Kleine vertraging tegen brute force
  setTimeout(() => res.status(401).json({ error: 'Ongeldige gebruikersnaam of wachtwoord' }), 1000);
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/auth/check', (req, res) => {
  if (req.session && req.session.loggedIn) {
    return res.json({ loggedIn: true, gebruiker: req.session.gebruiker });
  }
  res.json({ loggedIn: false });
});

// ── Database setup ─────────────────────────────────────────────────
const dataDir = '/data';
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'apotheek.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS medicijnen (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    naam TEXT NOT NULL,
    categorie TEXT NOT NULL,
    vervaldatum TEXT NOT NULL,
    hoeveelheid TEXT,
    eenheid TEXT,
    locatie TEXT,
    notities TEXT,
    toegevoegd_op TEXT DEFAULT (date('now'))
  );
`);

const count = db.prepare('SELECT COUNT(*) as c FROM medicijnen').get();
if (count.c === 0) {
  const insert = db.prepare(`
    INSERT INTO medicijnen (naam, categorie, vervaldatum, hoeveelheid, eenheid, locatie, notities)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  insert.run('Paracetamol 500mg', 'pijnstiller', '2026-08-01', '20', 'tabletten', 'badkamerkast', 'Standaard pijnstiller');
  insert.run('Ibuprofen 400mg', 'pijnstiller', '2024-12-01', '12', 'tabletten', 'badkamerkast', 'Anti-ontstekend');
  insert.run('Rennie', 'spijsvertering', '2026-03-01', '36', 'tabletten', 'keukenkast', 'Maagzuur');
  insert.run('Immodium', 'spijsvertering', '2025-11-01', '6', 'capsules', 'badkamerkast', 'Bij diarree');
  insert.run('Bepanthen', 'zalf/huid', '2027-01-01', '30', 'gram', 'badkamerkast', 'Wondverzorging');
  insert.run('Hydrocortison crème', 'zalf/huid', '2025-06-01', '15', 'gram', 'badkamerkast', 'Jeuk en irritatie');
  insert.run('Vitamine D3', 'vitaminen', '2026-12-01', '90', 'capsules', 'keukenkast', '1000 IE per dag');
  insert.run('Antihistamine', 'allergie', '2026-09-01', '20', 'tabletten', 'badkamerkast', 'Hooikoorts');
  insert.run('Jodium tinctuur', 'wondzorg', '2025-04-01', '30', 'ml', 'EHBO-koffer', 'Wonddesinfectie');
  insert.run('Thermometer', 'hulpmiddel', '2099-01-01', '1', 'stuks', 'badkamerkast', 'Digitaal');
}

// ── API routes (allemaal beveiligd) ───────────────────────────────
app.get('/api/medicijnen', requireAuth, (req, res) => {
  const { categorie, zoek, sorteer } = req.query;
  let query = 'SELECT * FROM medicijnen WHERE 1=1';
  const params = [];
  if (categorie && categorie !== 'alle') { query += ' AND categorie = ?'; params.push(categorie); }
  if (zoek) { query += ' AND (naam LIKE ? OR notities LIKE ?)'; params.push(`%${zoek}%`, `%${zoek}%`); }
  switch (sorteer) {
    case 'naam':            query += ' ORDER BY naam ASC'; break;
    case 'categorie':       query += ' ORDER BY categorie ASC, naam ASC'; break;
    case 'vervaldatum_asc': query += ' ORDER BY vervaldatum ASC'; break;
    case 'vervaldatum_desc':query += ' ORDER BY vervaldatum DESC'; break;
    default:                query += ' ORDER BY vervaldatum ASC';
  }
  res.json(db.prepare(query).all(...params));
});

app.get('/api/medicijnen/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM medicijnen WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Niet gevonden' });
  res.json(row);
});

app.post('/api/medicijnen', requireAuth, (req, res) => {
  const { naam, categorie, vervaldatum, hoeveelheid, eenheid, locatie, notities } = req.body;
  if (!naam || !categorie || !vervaldatum)
    return res.status(400).json({ error: 'Naam, categorie en vervaldatum zijn verplicht' });
  const result = db.prepare(`
    INSERT INTO medicijnen (naam, categorie, vervaldatum, hoeveelheid, eenheid, locatie, notities)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(naam, categorie, vervaldatum, hoeveelheid||null, eenheid||null, locatie||null, notities||null);
  res.status(201).json(db.prepare('SELECT * FROM medicijnen WHERE id = ?').get(result.lastInsertRowid));
});

app.put('/api/medicijnen/:id', requireAuth, (req, res) => {
  const { naam, categorie, vervaldatum, hoeveelheid, eenheid, locatie, notities } = req.body;
  if (!db.prepare('SELECT id FROM medicijnen WHERE id = ?').get(req.params.id))
    return res.status(404).json({ error: 'Niet gevonden' });
  db.prepare(`UPDATE medicijnen SET naam=?, categorie=?, vervaldatum=?, hoeveelheid=?, eenheid=?, locatie=?, notities=? WHERE id=?`)
    .run(naam, categorie, vervaldatum, hoeveelheid||null, eenheid||null, locatie||null, notities||null, req.params.id);
  res.json(db.prepare('SELECT * FROM medicijnen WHERE id = ?').get(req.params.id));
});

app.delete('/api/medicijnen/:id', requireAuth, (req, res) => {
  if (!db.prepare('SELECT id FROM medicijnen WHERE id = ?').get(req.params.id))
    return res.status(404).json({ error: 'Niet gevonden' });
  db.prepare('DELETE FROM medicijnen WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.get('/api/statistieken', requireAuth, (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const soon = new Date(); soon.setMonth(soon.getMonth() + 3);
  const soonDate = soon.toISOString().split('T')[0];
  const totaal   = db.prepare('SELECT COUNT(*) as c FROM medicijnen').get().c;
  const verlopen  = db.prepare('SELECT COUNT(*) as c FROM medicijnen WHERE vervaldatum < ?').get(today).c;
  const binnenkort= db.prepare('SELECT COUNT(*) as c FROM medicijnen WHERE vervaldatum >= ? AND vervaldatum <= ?').get(today, soonDate).c;
  res.json({ totaal, verlopen, binnenkort, ok: totaal - verlopen - binnenkort,
    perCategorie: db.prepare('SELECT categorie, COUNT(*) as aantal FROM medicijnen GROUP BY categorie ORDER BY aantal DESC').all() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Huisapotheek API draait op poort ${PORT} | gebruiker: ${APP_USER}`));
