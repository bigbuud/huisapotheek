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

// ── Session ────────────────────────────────────────────────────────
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, maxAge: 8 * 60 * 60 * 1000 }
}));

const APP_USER     = process.env.APP_USER     || 'apotheek';
const APP_PASSWORD = process.env.APP_PASSWORD || 'apotheek';

function requireAuth(req, res, next) {
  if (req.session && req.session.loggedIn) return next();
  res.status(401).json({ error: 'Niet ingelogd' });
}

app.post('/api/login', (req, res) => {
  const { gebruiker, wachtwoord } = req.body;
  if (gebruiker === APP_USER && wachtwoord === APP_PASSWORD) {
    req.session.loggedIn = true;
    req.session.gebruiker = gebruiker;
    return res.json({ success: true });
  }
  setTimeout(() => res.status(401).json({ error: 'Ongeldige gebruikersnaam of wachtwoord' }), 1000);
});
app.post('/api/logout', (req, res) => { req.session.destroy(); res.json({ success: true }); });
app.get('/api/auth/check', (req, res) => {
  if (req.session && req.session.loggedIn) return res.json({ loggedIn: true, gebruiker: req.session.gebruiker });
  res.json({ loggedIn: false });
});

// ── Database ───────────────────────────────────────────────────────
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
    bijsluiter_url TEXT,
    toegevoegd_op TEXT DEFAULT (date('now'))
  );
  CREATE TABLE IF NOT EXISTS geneesmiddelen_db (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    naam TEXT NOT NULL,
    categorie TEXT NOT NULL,
    bijsluiter_url TEXT
  );
`);

// ── Voeg bijsluiter_url kolom toe als die nog niet bestaat (migratie) ──
try { db.exec(`ALTER TABLE medicijnen ADD COLUMN bijsluiter_url TEXT`); } catch(e) {}

// ── Geneesmiddelen databank ────────────────────────────────────────
const dbCount = db.prepare('SELECT COUNT(*) as c FROM geneesmiddelen_db').get();
if (dbCount.c === 0) {
  const ins = db.prepare('INSERT INTO geneesmiddelen_db (naam, categorie, bijsluiter_url) VALUES (?, ?, ?)');
  const medicines = [
    // Pijnstillers
    ['Paracetamol', 'pijnstiller', 'https://www.bcfi.be/nl/search?q=paracetamol'],
    ['Paracetamol 500mg', 'pijnstiller', 'https://www.bcfi.be/nl/search?q=paracetamol'],
    ['Paracetamol 1g', 'pijnstiller', 'https://www.bcfi.be/nl/search?q=paracetamol'],
    ['Dafalgan 500mg', 'pijnstiller', 'https://www.bcfi.be/nl/search?q=dafalgan'],
    ['Dafalgan 1g', 'pijnstiller', 'https://www.bcfi.be/nl/search?q=dafalgan'],
    ['Ibuprofen 200mg', 'pijnstiller', 'https://www.bcfi.be/nl/search?q=ibuprofen'],
    ['Ibuprofen 400mg', 'pijnstiller', 'https://www.bcfi.be/nl/search?q=ibuprofen'],
    ['Ibuprofen 600mg', 'pijnstiller', 'https://www.bcfi.be/nl/search?q=ibuprofen'],
    ['Brufen 400mg', 'pijnstiller', 'https://www.bcfi.be/nl/search?q=brufen'],
    ['Aspirine 500mg', 'pijnstiller', 'https://www.bcfi.be/nl/search?q=aspirine'],
    ['Aspirine 100mg', 'pijnstiller', 'https://www.bcfi.be/nl/search?q=aspirine'],
    ['Aspirine Cardio', 'pijnstiller', 'https://www.bcfi.be/nl/search?q=aspirine+cardio'],
    ['Naproxen 250mg', 'pijnstiller', 'https://www.bcfi.be/nl/search?q=naproxen'],
    ['Naproxen 500mg', 'pijnstiller', 'https://www.bcfi.be/nl/search?q=naproxen'],
    ['Aleve', 'pijnstiller', 'https://www.bcfi.be/nl/search?q=aleve'],
    ['Perdolan', 'pijnstiller', 'https://www.bcfi.be/nl/search?q=perdolan'],
    ['Tradonal', 'pijnstiller', 'https://www.bcfi.be/nl/search?q=tradonal'],
    ['Voltaren gel', 'zalf/huid', 'https://www.bcfi.be/nl/search?q=voltaren'],
    ['Voltaren 50mg', 'pijnstiller', 'https://www.bcfi.be/nl/search?q=voltaren'],
    // Koorts
    ['Nurofen 200mg', 'koorts', 'https://www.bcfi.be/nl/search?q=nurofen'],
    ['Nurofen 400mg', 'koorts', 'https://www.bcfi.be/nl/search?q=nurofen'],
    ['Nurofen kind', 'koorts', 'https://www.bcfi.be/nl/search?q=nurofen'],
    ['Perdolan kind', 'koorts', 'https://www.bcfi.be/nl/search?q=perdolan'],
    ['Dafalgan kind siroop', 'koorts', 'https://www.bcfi.be/nl/search?q=dafalgan+kind'],
    ['Efferalgan', 'koorts', 'https://www.bcfi.be/nl/search?q=efferalgan'],
    // Spijsvertering
    ['Rennie', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=rennie'],
    ['Rennie Duo', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=rennie'],
    ['Gaviscon', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=gaviscon'],
    ['Maalox', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=maalox'],
    ['Omeprazol 20mg', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=omeprazol'],
    ['Pantoprazol 40mg', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=pantoprazol'],
    ['Nexium 20mg', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=nexium'],
    ['Imodium', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=imodium'],
    ['Immodium', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=imodium'],
    ['Loperamide', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=loperamide'],
    ['Smecta', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=smecta'],
    ['Movicol', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=movicol'],
    ['Duphalac', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=duphalac'],
    ['Lactulose', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=lactulose'],
    ['Motilium', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=motilium'],
    ['Domperidon', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=domperidon'],
    ['Enterogermina', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=enterogermina'],
    ['Orale rehydratatiezouten', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=rehydratatie'],
    // Allergie
    ['Cetirizine 10mg', 'allergie', 'https://www.bcfi.be/nl/search?q=cetirizine'],
    ['Loratadine 10mg', 'allergie', 'https://www.bcfi.be/nl/search?q=loratadine'],
    ['Desloratadine', 'allergie', 'https://www.bcfi.be/nl/search?q=desloratadine'],
    ['Aerius', 'allergie', 'https://www.bcfi.be/nl/search?q=aerius'],
    ['Zyrtec', 'allergie', 'https://www.bcfi.be/nl/search?q=zyrtec'],
    ['Claritine', 'allergie', 'https://www.bcfi.be/nl/search?q=claritine'],
    ['Fenistil druppels', 'allergie', 'https://www.bcfi.be/nl/search?q=fenistil'],
    ['Telfast', 'allergie', 'https://www.bcfi.be/nl/search?q=telfast'],
    ['Xyzal', 'allergie', 'https://www.bcfi.be/nl/search?q=xyzal'],
    ['Prevalin neusspray', 'allergie', 'https://www.bcfi.be/nl/search?q=prevalin'],
    ['Flixonase neusspray', 'allergie', 'https://www.bcfi.be/nl/search?q=flixonase'],
    ['Nasonex neusspray', 'allergie', 'https://www.bcfi.be/nl/search?q=nasonex'],
    // Wondzorg
    ['Betadine', 'wondzorg', 'https://www.bcfi.be/nl/search?q=betadine'],
    ['Betadine wondspray', 'wondzorg', 'https://www.bcfi.be/nl/search?q=betadine'],
    ['Jodium tinctuur', 'wondzorg', 'https://www.bcfi.be/nl/search?q=jodium'],
    ['Waterstofperoxide', 'wondzorg', 'https://www.bcfi.be/nl/search?q=waterstofperoxide'],
    ['Chloorhexidine', 'wondzorg', 'https://www.bcfi.be/nl/search?q=chloorhexidine'],
    ['Steristrips', 'wondzorg', 'https://www.bcfi.be/nl/search?q=steristrip'],
    ['Elastoplast', 'wondzorg', 'https://www.bcfi.be/nl/search?q=elastoplast'],
    ['Compeed', 'wondzorg', 'https://www.bcfi.be/nl/search?q=compeed'],
    ['Hansaplast', 'wondzorg', 'https://www.bcfi.be/nl/search?q=hansaplast'],
    ['Gaaskompres', 'wondzorg', 'https://www.bcfi.be/nl/search?q=gaaskompres'],
    // Zalf / Huid
    ['Bepanthen zalf', 'zalf/huid', 'https://www.bcfi.be/nl/search?q=bepanthen'],
    ['Bepanthen crème', 'zalf/huid', 'https://www.bcfi.be/nl/search?q=bepanthen'],
    ['Hydrocortison crème 1%', 'zalf/huid', 'https://www.bcfi.be/nl/search?q=hydrocortison'],
    ['Hydrocortison crème 0.5%', 'zalf/huid', 'https://www.bcfi.be/nl/search?q=hydrocortison'],
    ['Fucidin crème', 'zalf/huid', 'https://www.bcfi.be/nl/search?q=fucidin'],
    ['Fucidin zalf', 'zalf/huid', 'https://www.bcfi.be/nl/search?q=fucidin'],
    ['Flamazine crème', 'zalf/huid', 'https://www.bcfi.be/nl/search?q=flamazine'],
    ['Canesten crème', 'zalf/huid', 'https://www.bcfi.be/nl/search?q=canesten'],
    ['Daktarin gel', 'zalf/huid', 'https://www.bcfi.be/nl/search?q=daktarin'],
    ['Lamisil crème', 'zalf/huid', 'https://www.bcfi.be/nl/search?q=lamisil'],
    ['Terbinafine crème', 'zalf/huid', 'https://www.bcfi.be/nl/search?q=terbinafine'],
    ['Zinkolie', 'zalf/huid', 'https://www.bcfi.be/nl/search?q=zinkolie'],
    ['Zinkzalf', 'zalf/huid', 'https://www.bcfi.be/nl/search?q=zinkzalf'],
    ['Nivea crème', 'zalf/huid', null],
    ['Vaseline', 'zalf/huid', null],
    ['Sudocrem', 'zalf/huid', 'https://www.bcfi.be/nl/search?q=sudocrem'],
    ['Aloë vera gel', 'zalf/huid', null],
    ['After sun', 'zalf/huid', null],
    ['Fenistil gel', 'zalf/huid', 'https://www.bcfi.be/nl/search?q=fenistil'],
    // Vitaminen
    ['Vitamine C 500mg', 'vitaminen', 'https://www.bcfi.be/nl/search?q=vitamine+c'],
    ['Vitamine C 1000mg', 'vitaminen', 'https://www.bcfi.be/nl/search?q=vitamine+c'],
    ['Vitamine D3 400IE', 'vitaminen', 'https://www.bcfi.be/nl/search?q=vitamine+d'],
    ['Vitamine D3 1000IE', 'vitaminen', 'https://www.bcfi.be/nl/search?q=vitamine+d'],
    ['Vitamine D3 2000IE', 'vitaminen', 'https://www.bcfi.be/nl/search?q=vitamine+d'],
    ['Vitamine B12', 'vitaminen', 'https://www.bcfi.be/nl/search?q=vitamine+b12'],
    ['Multivitamine', 'vitaminen', null],
    ['Magnesium 375mg', 'vitaminen', 'https://www.bcfi.be/nl/search?q=magnesium'],
    ['Ijzer tabletten', 'vitaminen', 'https://www.bcfi.be/nl/search?q=ijzer'],
    ['Foliumzuur', 'vitaminen', 'https://www.bcfi.be/nl/search?q=foliumzuur'],
    ['Zink 10mg', 'vitaminen', 'https://www.bcfi.be/nl/search?q=zink'],
    ['Omega-3', 'vitaminen', null],
    ['Probiotica', 'vitaminen', null],
    // Ogen / Oren
    ['Visine oogdruppels', 'ogen/oren', 'https://www.bcfi.be/nl/search?q=visine'],
    ['Artelac oogdruppels', 'ogen/oren', 'https://www.bcfi.be/nl/search?q=artelac'],
    ['Systane oogdruppels', 'ogen/oren', 'https://www.bcfi.be/nl/search?q=systane'],
    ['Otrivin neusspray', 'ogen/oren', 'https://www.bcfi.be/nl/search?q=otrivin'],
    ['Sterimar neusspray', 'ogen/oren', 'https://www.bcfi.be/nl/search?q=sterimar'],
    ['Physiomer neusspray', 'ogen/oren', 'https://www.bcfi.be/nl/search?q=physiomer'],
    ['Otosil oordruppels', 'ogen/oren', 'https://www.bcfi.be/nl/search?q=otosil'],
    ['Cerumenex oordruppels', 'ogen/oren', 'https://www.bcfi.be/nl/search?q=cerumenex'],
    // Antibiotica (vaak op voorschrift maar kan thuis staan)
    ['Amoxicilline 500mg', 'antibiotica', 'https://www.bcfi.be/nl/search?q=amoxicilline'],
    ['Amoxicilline 1g', 'antibiotica', 'https://www.bcfi.be/nl/search?q=amoxicilline'],
    ['Augmentin', 'antibiotica', 'https://www.bcfi.be/nl/search?q=augmentin'],
    ['Azithromycine', 'antibiotica', 'https://www.bcfi.be/nl/search?q=azithromycine'],
    ['Claritromycine', 'antibiotica', 'https://www.bcfi.be/nl/search?q=claritromycine'],
    ['Doxycycline', 'antibiotica', 'https://www.bcfi.be/nl/search?q=doxycycline'],
    ['Trimethoprim', 'antibiotica', 'https://www.bcfi.be/nl/search?q=trimethoprim'],
    // Hoest / Verkoudheid
    ['Bisolvon siroop', 'overige', 'https://www.bcfi.be/nl/search?q=bisolvon'],
    ['Mucosolvan siroop', 'overige', 'https://www.bcfi.be/nl/search?q=mucosolvan'],
    ['Bromhexine', 'overige', 'https://www.bcfi.be/nl/search?q=bromhexine'],
    ['ACC 200mg', 'overige', 'https://www.bcfi.be/nl/search?q=acc+200'],
    ['Stoptussin', 'overige', 'https://www.bcfi.be/nl/search?q=stoptussin'],
    ['Lysopaine', 'overige', 'https://www.bcfi.be/nl/search?q=lysopaine'],
    ['Neo-Angin', 'overige', 'https://www.bcfi.be/nl/search?q=neo-angin'],
    ['Strepsils', 'overige', 'https://www.bcfi.be/nl/search?q=strepsils'],
    ['Vicks VapoRub', 'zalf/huid', null],
    // Hulpmiddelen
    ['Thermometer digitaal', 'hulpmiddel', null],
    ['Bloeddrukmeter', 'hulpmiddel', null],
    ['Pulsoximeter', 'hulpmiddel', null],
    ['Verbandschaar', 'hulpmiddel', null],
    ['Pincet', 'hulpmiddel', null],
    ['Spuit 5ml', 'hulpmiddel', null],
    ['Handschoenen latex', 'hulpmiddel', null],
    ['Mondmasker', 'hulpmiddel', null],
  ];
  const insertMany = db.transaction((items) => { items.forEach(i => ins.run(...i)); });
  insertMany(medicines);
  console.log(`Geneesmiddelen databank: ${medicines.length} items geladen`);
}

// ── Seed voorbeelddata ─────────────────────────────────────────────
const count = db.prepare('SELECT COUNT(*) as c FROM medicijnen').get();
if (count.c === 0) {
  const insert = db.prepare(`INSERT INTO medicijnen (naam, categorie, vervaldatum, hoeveelheid, eenheid, locatie, notities) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  insert.run('Paracetamol 500mg', 'pijnstiller', '2026-08-01', '20', 'tabletten', 'badkamerkast', 'Standaard pijnstiller');
  insert.run('Ibuprofen 400mg', 'pijnstiller', '2024-12-01', '12', 'tabletten', 'badkamerkast', 'Anti-ontstekend');
  insert.run('Rennie', 'spijsvertering', '2026-03-01', '36', 'tabletten', 'keukenkast', 'Maagzuur');
  insert.run('Immodium', 'spijsvertering', '2025-11-01', '6', 'capsules', 'badkamerkast', 'Bij diarree');
  insert.run('Bepanthen zalf', 'zalf/huid', '2027-01-01', '30', 'gram', 'badkamerkast', 'Wondverzorging');
  insert.run('Vitamine D3 1000IE', 'vitaminen', '2026-12-01', '90', 'capsules', 'keukenkast', '1000 IE per dag');
  insert.run('Cetirizine 10mg', 'allergie', '2026-09-01', '20', 'tabletten', 'badkamerkast', 'Hooikoorts');
  insert.run('Betadine', 'wondzorg', '2025-04-01', '30', 'ml', 'EHBO-koffer', 'Wonddesinfectie');
  insert.run('Thermometer digitaal', 'hulpmiddel', '2099-01-01', '1', 'stuks', 'badkamerkast', 'Digitaal');
}

// ── Autocomplete endpoint ──────────────────────────────────────────
app.get('/api/zoek-geneesmiddel', requireAuth, (req, res) => {
  const q = req.query.q || '';
  if (q.length < 2) return res.json([]);
  const results = db.prepare(`
    SELECT naam, categorie, bijsluiter_url 
    FROM geneesmiddelen_db 
    WHERE naam LIKE ? 
    ORDER BY naam ASC 
    LIMIT 8
  `).all(`${q}%`);
  // Also search contains
  const contains = db.prepare(`
    SELECT naam, categorie, bijsluiter_url 
    FROM geneesmiddelen_db 
    WHERE naam LIKE ? AND naam NOT LIKE ?
    ORDER BY naam ASC 
    LIMIT 4
  `).all(`%${q}%`, `${q}%`);
  const combined = [...results, ...contains].slice(0, 8);
  res.json(combined);
});

// ── Medicijnen API ─────────────────────────────────────────────────
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
  const { naam, categorie, vervaldatum, hoeveelheid, eenheid, locatie, notities, bijsluiter_url } = req.body;
  if (!naam || !categorie || !vervaldatum)
    return res.status(400).json({ error: 'Naam, categorie en vervaldatum zijn verplicht' });
  const result = db.prepare(`
    INSERT INTO medicijnen (naam, categorie, vervaldatum, hoeveelheid, eenheid, locatie, notities, bijsluiter_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(naam, categorie, vervaldatum, hoeveelheid||null, eenheid||null, locatie||null, notities||null, bijsluiter_url||null);
  res.status(201).json(db.prepare('SELECT * FROM medicijnen WHERE id = ?').get(result.lastInsertRowid));
});

app.put('/api/medicijnen/:id', requireAuth, (req, res) => {
  const { naam, categorie, vervaldatum, hoeveelheid, eenheid, locatie, notities, bijsluiter_url } = req.body;
  if (!db.prepare('SELECT id FROM medicijnen WHERE id = ?').get(req.params.id))
    return res.status(404).json({ error: 'Niet gevonden' });
  db.prepare(`UPDATE medicijnen SET naam=?, categorie=?, vervaldatum=?, hoeveelheid=?, eenheid=?, locatie=?, notities=?, bijsluiter_url=? WHERE id=?`)
    .run(naam, categorie, vervaldatum, hoeveelheid||null, eenheid||null, locatie||null, notities||null, bijsluiter_url||null, req.params.id);
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
  const totaal    = db.prepare('SELECT COUNT(*) as c FROM medicijnen').get().c;
  const verlopen  = db.prepare('SELECT COUNT(*) as c FROM medicijnen WHERE vervaldatum < ?').get(today).c;
  const binnenkort= db.prepare('SELECT COUNT(*) as c FROM medicijnen WHERE vervaldatum >= ? AND vervaldatum <= ?').get(today, soonDate).c;
  res.json({ totaal, verlopen, binnenkort, ok: totaal - verlopen - binnenkort,
    perCategorie: db.prepare('SELECT categorie, COUNT(*) as aantal FROM medicijnen GROUP BY categorie ORDER BY aantal DESC').all() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Huisapotheek API draait op poort ${PORT}`));
