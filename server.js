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
// Voeg UNIQUE constraint toe als die nog niet bestaat
try { db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_geneesmiddelen_naam ON geneesmiddelen_db(naam)'); } catch(e) {}
// Altijd nieuwe middelen toevoegen (INSERT OR IGNORE = geen duplicaten)
{
  const ins = db.prepare('INSERT OR IGNORE INTO geneesmiddelen_db (naam, categorie, bijsluiter_url) VALUES (?, ?, ?)');
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

    // ── Uitbreiding: Allergie ──────────────────────────────────────
    ['Bellozal 20mg', 'allergie', 'https://www.bcfi.be/nl/search?q=bilastine'],
    ['Bellozal ODT 20mg', 'allergie', 'https://www.bcfi.be/nl/search?q=bilastine'],
    ['Bilastine 20mg', 'allergie', 'https://www.bcfi.be/nl/search?q=bilastine'],
    ['Rupafin 10mg', 'allergie', 'https://www.bcfi.be/nl/search?q=rupatadine'],
    ['Rupatadine 10mg', 'allergie', 'https://www.bcfi.be/nl/search?q=rupatadine'],
    ['Polaramine', 'allergie', 'https://www.bcfi.be/nl/search?q=dexchlorfeniramine'],
    ['Atarax 25mg', 'allergie', 'https://www.bcfi.be/nl/search?q=hydroxyzine'],
    ['Hydroxyzine 25mg', 'allergie', 'https://www.bcfi.be/nl/search?q=hydroxyzine'],
    ['Kestin 20mg', 'allergie', 'https://www.bcfi.be/nl/search?q=ebastine'],
    ['Reactine', 'allergie', 'https://www.bcfi.be/nl/search?q=cetirizine'],
    ['Rhinocort neusspray', 'allergie', 'https://www.bcfi.be/nl/search?q=budesonide'],
    ['Avamys neusspray', 'allergie', 'https://www.bcfi.be/nl/search?q=fluticason'],
    ['Dymista neusspray', 'allergie', 'https://www.bcfi.be/nl/search?q=dymista'],
    ['Opticrom oogdruppels', 'ogen/oren', 'https://www.bcfi.be/nl/search?q=cromoglicinezuur'],

    // ── Uitbreiding: Pijnstillers / Ontstekingsremmers ────────────
    ['Dafalgan Odis', 'pijnstiller', 'https://www.bcfi.be/nl/search?q=paracetamol'],
    ['Dafalgan Forte 1g', 'pijnstiller', 'https://www.bcfi.be/nl/search?q=dafalgan'],
    ['Paracetamol kind 250mg', 'pijnstiller', 'https://www.bcfi.be/nl/search?q=paracetamol'],
    ['Paracetamol kind 500mg', 'pijnstiller', 'https://www.bcfi.be/nl/search?q=paracetamol'],
    ['Ibuprofen kind 100mg', 'pijnstiller', 'https://www.bcfi.be/nl/search?q=ibuprofen'],
    ['Ibuprofen kind 200mg', 'pijnstiller', 'https://www.bcfi.be/nl/search?q=ibuprofen'],
    ['Ketoprofen 100mg', 'pijnstiller', 'https://www.bcfi.be/nl/search?q=ketoprofen'],
    ['Diclofenac 50mg', 'pijnstiller', 'https://www.bcfi.be/nl/search?q=diclofenac'],
    ['Celecoxib 200mg', 'pijnstiller', 'https://www.bcfi.be/nl/search?q=celecoxib'],
    ['Tramadol 50mg', 'pijnstiller', 'https://www.bcfi.be/nl/search?q=tramadol'],
    ['Codeine 20mg', 'pijnstiller', 'https://www.bcfi.be/nl/search?q=codeine'],
    ['Codeisan', 'pijnstiller', 'https://www.bcfi.be/nl/search?q=codeine'],
    ['Nimed 100mg', 'pijnstiller', 'https://www.bcfi.be/nl/search?q=nimesulide'],
    ['Valdispert', 'overige', 'https://www.bcfi.be/nl/search?q=valeriaanwortel'],

    // ── Uitbreiding: Spijsvertering ───────────────────────────────
    ['Imodium Lingual', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=loperamide'],
    ['Imodium Instant', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=loperamide'],
    ['Nifuroxazide 200mg', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=nifuroxazide'],
    ['Ercefuryl', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=nifuroxazide'],
    ['Dioralyte', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=rehydratatie'],
    ['Pedialyte', 'spijsvertering', null],
    ['Normacol', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=sterculiagom'],
    ['Metamucil', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=psyllium'],
    ['Psyllium vezels', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=psyllium'],
    ['Bisacodyl 5mg', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=bisacodyl'],
    ['Dulcolax', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=bisacodyl'],
    ['Microlax klysma', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=microlax'],
    ['Forlax', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=macrogol'],
    ['Macrogol sachets', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=macrogol'],
    ['Debridat', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=trimebutine'],
    ['Trimebutine', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=trimebutine'],
    ['Buscopan 10mg', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=butylscopolamine'],
    ['Scopolamine', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=butylscopolamine'],
    ['Lansor 15mg', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=lansoprazol'],
    ['Lansoprazol 15mg', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=lansoprazol'],
    ['Lansoprazol 30mg', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=lansoprazol'],
    ['Esomeprazol 20mg', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=esomeprazol'],
    ['Esomeprazol 40mg', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=esomeprazol'],
    ['Ranitidine 150mg', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=ranitidine'],
    ['Simethicone', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=simethicone'],
    ['Lefax', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=simethicone'],
    ['Iberogast', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=iberogast'],
    ['Gaviscon Advance', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=gaviscon'],
    ['Questran', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=colestyramine'],

    // ── Uitbreiding: Hoest / Verkoudheid ─────────────────────────
    ['Actifed', 'overige', 'https://www.bcfi.be/nl/search?q=actifed'],
    ['Rhinathiol', 'overige', 'https://www.bcfi.be/nl/search?q=carbocisteïne'],
    ['Carbocisteïne', 'overige', 'https://www.bcfi.be/nl/search?q=carbocisteine'],
    ['Fluimucil 200mg', 'overige', 'https://www.bcfi.be/nl/search?q=acetylcysteine'],
    ['Fluimucil 600mg', 'overige', 'https://www.bcfi.be/nl/search?q=acetylcysteine'],
    ['Acetylcysteine 200mg', 'overige', 'https://www.bcfi.be/nl/search?q=acetylcysteine'],
    ['Acetylcysteine 600mg', 'overige', 'https://www.bcfi.be/nl/search?q=acetylcysteine'],
    ['Ambroxol siroop', 'overige', 'https://www.bcfi.be/nl/search?q=ambroxol'],
    ['Pectoral siroop', 'overige', null],
    ['Prospan hoestsiroop', 'overige', null],
    ['Eucalyptine', 'overige', null],
    ['Dextromethorfan', 'overige', 'https://www.bcfi.be/nl/search?q=dextromethorfan'],
    ['Noscapine', 'overige', 'https://www.bcfi.be/nl/search?q=noscapine'],
    ['Toplexil', 'overige', 'https://www.bcfi.be/nl/search?q=oxomemazine'],
    ['Vicks Formula 44', 'overige', null],
    ['Coldrex', 'overige', 'https://www.bcfi.be/nl/search?q=coldrex'],
    ['Neocitran', 'overige', null],
    ['Sinutab', 'overige', 'https://www.bcfi.be/nl/search?q=sinutab'],
    ['Decongestivum', 'overige', null],
    ['Xylometazoline neusspray', 'ogen/oren', 'https://www.bcfi.be/nl/search?q=xylometazoline'],
    ['Oxymetazoline neusspray', 'ogen/oren', 'https://www.bcfi.be/nl/search?q=oxymetazoline'],

    // ── Uitbreiding: Zalf / Huid ──────────────────────────────────
    ['Bactroban zalf', 'zalf/huid', 'https://www.bcfi.be/nl/search?q=mupirocine'],
    ['Mupirocine zalf', 'zalf/huid', 'https://www.bcfi.be/nl/search?q=mupirocine'],
    ['Aciclovir crème 5%', 'zalf/huid', 'https://www.bcfi.be/nl/search?q=aciclovir'],
    ['Zovirax crème', 'zalf/huid', 'https://www.bcfi.be/nl/search?q=aciclovir'],
    ['Pencivir crème', 'zalf/huid', 'https://www.bcfi.be/nl/search?q=penciclovir'],
    ['Elidel crème', 'zalf/huid', 'https://www.bcfi.be/nl/search?q=pimecrolimus'],
    ['Protopic zalf', 'zalf/huid', 'https://www.bcfi.be/nl/search?q=tacrolimus'],
    ['Locoid crème', 'zalf/huid', 'https://www.bcfi.be/nl/search?q=hydrocortison+butyraat'],
    ['Diprosone crème', 'zalf/huid', 'https://www.bcfi.be/nl/search?q=betametason'],
    ['Betametason crème', 'zalf/huid', 'https://www.bcfi.be/nl/search?q=betametason'],
    ['Clarelux schuim', 'zalf/huid', 'https://www.bcfi.be/nl/search?q=clobetasol'],
    ['Nizoral shampoo', 'zalf/huid', 'https://www.bcfi.be/nl/search?q=ketoconazol'],
    ['Ketoconazol shampoo', 'zalf/huid', 'https://www.bcfi.be/nl/search?q=ketoconazol'],
    ['Exoderil crème', 'zalf/huid', 'https://www.bcfi.be/nl/search?q=naftifine'],
    ['Pevaryl crème', 'zalf/huid', 'https://www.bcfi.be/nl/search?q=econazol'],
    ['Econazol crème', 'zalf/huid', 'https://www.bcfi.be/nl/search?q=econazol'],
    ['Daktarin poeder', 'zalf/huid', 'https://www.bcfi.be/nl/search?q=miconazol'],
    ['Miconazol crème', 'zalf/huid', 'https://www.bcfi.be/nl/search?q=miconazol'],
    ['Wartner', 'zalf/huid', null],
    ['Octenisept', 'wondzorg', null],
    ['Prontosan wondgel', 'wondzorg', null],
    ['Inadine wondverband', 'wondzorg', null],
    ['Silvercel verband', 'wondzorg', null],
    ['Mepilex', 'wondzorg', null],
    ['Lyofoam verband', 'wondzorg', null],

    // ── Uitbreiding: Ogen / Oren ──────────────────────────────────
    ['Tobradex oogdruppels', 'ogen/oren', 'https://www.bcfi.be/nl/search?q=tobramycine'],
    ['Tobrex oogdruppels', 'ogen/oren', 'https://www.bcfi.be/nl/search?q=tobramycine'],
    ['Chloramphenicol oogdruppels', 'ogen/oren', 'https://www.bcfi.be/nl/search?q=chloorfenicum'],
    ['Voltaren oogdruppels', 'ogen/oren', 'https://www.bcfi.be/nl/search?q=diclofenac'],
    ['Zaditen oogdruppels', 'ogen/oren', 'https://www.bcfi.be/nl/search?q=ketotifen'],
    ['Hylo-Comod oogdruppels', 'ogen/oren', null],
    ['Tears Naturale oogdruppels', 'ogen/oren', null],
    ['Lacryvisc oogdruppels', 'ogen/oren', null],
    ['Otipax oordruppels', 'ogen/oren', 'https://www.bcfi.be/nl/search?q=lidocaine+fenazon'],
    ['Panotile oordruppels', 'ogen/oren', 'https://www.bcfi.be/nl/search?q=ciprofloxacine'],
    ['Aqua maris neusspray', 'ogen/oren', null],
    ['Nasonex kind', 'allergie', 'https://www.bcfi.be/nl/search?q=mometason'],
    ['Mometason neusspray', 'allergie', 'https://www.bcfi.be/nl/search?q=mometason'],

    // ── Uitbreiding: Vitaminen / Supplementen ─────────────────────
    ['Vitamine B1 100mg', 'vitaminen', 'https://www.bcfi.be/nl/search?q=thiamine'],
    ['Vitamine B6 40mg', 'vitaminen', 'https://www.bcfi.be/nl/search?q=pyridoxine'],
    ['Vitamine E 400IE', 'vitaminen', 'https://www.bcfi.be/nl/search?q=vitamine+e'],
    ['Vitamine K2', 'vitaminen', null],
    ['Calcium 500mg', 'vitaminen', 'https://www.bcfi.be/nl/search?q=calcium'],
    ['Calcium 1000mg', 'vitaminen', 'https://www.bcfi.be/nl/search?q=calcium'],
    ['Calcimagon D3', 'vitaminen', 'https://www.bcfi.be/nl/search?q=calcimagon'],
    ['Cacit D3', 'vitaminen', 'https://www.bcfi.be/nl/search?q=cacit'],
    ['Magnesium 250mg', 'vitaminen', null],
    ['Magnesium 500mg', 'vitaminen', null],
    ['Magnesium Bisglycinaat', 'vitaminen', null],
    ['IJzer 50mg', 'vitaminen', 'https://www.bcfi.be/nl/search?q=ijzer'],
    ['Losferron bruistablet', 'vitaminen', 'https://www.bcfi.be/nl/search?q=losferron'],
    ['Ferrostrane siroop', 'vitaminen', 'https://www.bcfi.be/nl/search?q=ijzer'],
    ['Coenzyme Q10', 'vitaminen', null],
    ['Melatonine 0.5mg', 'vitaminen', null],
    ['Melatonine 1mg', 'vitaminen', null],
    ['Melatonine 5mg', 'vitaminen', null],
    ['Ginkgo Biloba', 'vitaminen', null],
    ['Echinacea', 'vitaminen', null],
    ['Cranberry capsules', 'vitaminen', null],
    ['D-Mannose', 'vitaminen', null],
    ['Zink 25mg', 'vitaminen', null],
    ['Selenium 200mcg', 'vitaminen', null],

    // ── Uitbreiding: Slaap / Stress / Zenuwstelsel ────────────────
    ['Sedistress', 'overige', null],
    ['Dormiplant', 'overige', null],
    ['Baldrian ratiopharm', 'overige', null],
    ['Passiflora', 'overige', null],
    ['Euphytose', 'overige', null],
    ['Biral', 'overige', null],

    // ── Uitbreiding: Antibiotica (op voorschrift) ─────────────────
    ['Amoxicilline 250mg', 'antibiotica', 'https://www.bcfi.be/nl/search?q=amoxicilline'],
    ['Amoxicilline suspensie', 'antibiotica', 'https://www.bcfi.be/nl/search?q=amoxicilline'],
    ['Clamoxyl', 'antibiotica', 'https://www.bcfi.be/nl/search?q=amoxicilline'],
    ['Co-amoxiclav', 'antibiotica', 'https://www.bcfi.be/nl/search?q=co-amoxiclav'],
    ['Flemoxin', 'antibiotica', 'https://www.bcfi.be/nl/search?q=amoxicilline'],
    ['Zinnat 250mg', 'antibiotica', 'https://www.bcfi.be/nl/search?q=cefuroxim'],
    ['Cefuroxim 250mg', 'antibiotica', 'https://www.bcfi.be/nl/search?q=cefuroxim'],
    ['Orelox 100mg', 'antibiotica', 'https://www.bcfi.be/nl/search?q=cefpodoxim'],
    ['Zithromax 250mg', 'antibiotica', 'https://www.bcfi.be/nl/search?q=azithromycine'],
    ['Zithromax 500mg', 'antibiotica', 'https://www.bcfi.be/nl/search?q=azithromycine'],
    ['Rulid 150mg', 'antibiotica', 'https://www.bcfi.be/nl/search?q=roxitromycine'],
    ['Klacid 250mg', 'antibiotica', 'https://www.bcfi.be/nl/search?q=claritromycine'],
    ['Ciprofloxacine 250mg', 'antibiotica', 'https://www.bcfi.be/nl/search?q=ciprofloxacine'],
    ['Ciprofloxacine 500mg', 'antibiotica', 'https://www.bcfi.be/nl/search?q=ciprofloxacine'],
    ['Nitrofurantoïne 100mg', 'antibiotica', 'https://www.bcfi.be/nl/search?q=nitrofurantoine'],
    ['Fosfomycine sachets', 'antibiotica', 'https://www.bcfi.be/nl/search?q=fosfomycine'],
    ['Monuril', 'antibiotica', 'https://www.bcfi.be/nl/search?q=fosfomycine'],
    ['Metronidazol 250mg', 'antibiotica', 'https://www.bcfi.be/nl/search?q=metronidazol'],
    ['Metronidazol 500mg', 'antibiotica', 'https://www.bcfi.be/nl/search?q=metronidazol'],
    ['Flagyl', 'antibiotica', 'https://www.bcfi.be/nl/search?q=metronidazol'],

    // ── Uitbreiding: Hart / Bloeddruk / Cholesterol ───────────────
    ['Atorvastatine 10mg', 'overige', 'https://www.bcfi.be/nl/search?q=atorvastatine'],
    ['Atorvastatine 20mg', 'overige', 'https://www.bcfi.be/nl/search?q=atorvastatine'],
    ['Simvastatine 20mg', 'overige', 'https://www.bcfi.be/nl/search?q=simvastatine'],
    ['Rosuvastatine 10mg', 'overige', 'https://www.bcfi.be/nl/search?q=rosuvastatine'],
    ['Lisinopril 5mg', 'overige', 'https://www.bcfi.be/nl/search?q=lisinopril'],
    ['Lisinopril 10mg', 'overige', 'https://www.bcfi.be/nl/search?q=lisinopril'],
    ['Amlodipine 5mg', 'overige', 'https://www.bcfi.be/nl/search?q=amlodipine'],
    ['Amlodipine 10mg', 'overige', 'https://www.bcfi.be/nl/search?q=amlodipine'],
    ['Bisoprolol 2.5mg', 'overige', 'https://www.bcfi.be/nl/search?q=bisoprolol'],
    ['Bisoprolol 5mg', 'overige', 'https://www.bcfi.be/nl/search?q=bisoprolol'],
    ['Metoprolol 50mg', 'overige', 'https://www.bcfi.be/nl/search?q=metoprolol'],
    ['Metoprolol 100mg', 'overige', 'https://www.bcfi.be/nl/search?q=metoprolol'],
    ['Valsartan 80mg', 'overige', 'https://www.bcfi.be/nl/search?q=valsartan'],
    ['Losartan 50mg', 'overige', 'https://www.bcfi.be/nl/search?q=losartan'],

    // ── Uitbreiding: Diabetes ─────────────────────────────────────
    ['Metformine 500mg', 'overige', 'https://www.bcfi.be/nl/search?q=metformine'],
    ['Metformine 850mg', 'overige', 'https://www.bcfi.be/nl/search?q=metformine'],
    ['Metformine 1000mg', 'overige', 'https://www.bcfi.be/nl/search?q=metformine'],
    ['Glucophage', 'overige', 'https://www.bcfi.be/nl/search?q=metformine'],
    ['Insuline pen', 'hulpmiddel', null],
    ['Glucosemeter', 'hulpmiddel', null],
    ['Teststrips glucose', 'hulpmiddel', null],

    // ── Uitbreiding: Gynaecologie ─────────────────────────────────
    ['Canesten vaginaal', 'zalf/huid', 'https://www.bcfi.be/nl/search?q=clotrimazol'],
    ['Gyno-Pevaryl vaginaal', 'zalf/huid', 'https://www.bcfi.be/nl/search?q=econazol'],
    ['Vagisil', 'zalf/huid', null],
    ['Replens vaginaalgel', 'zalf/huid', null],

    // ── Uitbreiding: Reisgeneeskunde ──────────────────────────────
    ['Malarone', 'overige', 'https://www.bcfi.be/nl/search?q=atovaquon+proguanil'],
    ['Doxycycline 100mg', 'antibiotica', 'https://www.bcfi.be/nl/search?q=doxycycline'],
    ['Primaquine', 'overige', 'https://www.bcfi.be/nl/search?q=primaquine'],
    ['Cinnarizine 25mg', 'overige', 'https://www.bcfi.be/nl/search?q=cinnarizine'],
    ['Stugeron', 'overige', 'https://www.bcfi.be/nl/search?q=cinnarizine'],
    ['Tanderil', 'overige', null],
    ['DEET spray', 'hulpmiddel', null],
    ['Zonnebrand SPF30', 'zalf/huid', null],
    ['Zonnebrand SPF50', 'zalf/huid', null],
    ['Lifesystems reiskit', 'hulpmiddel', null],

    // ── Uitbreiding: Overige veelgebruikte ────────────────────────
    ['Levothyroxine 25mcg', 'overige', 'https://www.bcfi.be/nl/search?q=levothyroxine'],
    ['Levothyroxine 50mcg', 'overige', 'https://www.bcfi.be/nl/search?q=levothyroxine'],
    ['Levothyroxine 100mcg', 'overige', 'https://www.bcfi.be/nl/search?q=levothyroxine'],
    ['Euthyrox 50mcg', 'overige', 'https://www.bcfi.be/nl/search?q=levothyroxine'],
    ['Prednisolon 5mg', 'overige', 'https://www.bcfi.be/nl/search?q=prednisolon'],
    ['Medrol 4mg', 'overige', 'https://www.bcfi.be/nl/search?q=methylprednisolon'],
    ['Salbutamol inhaler', 'overige', 'https://www.bcfi.be/nl/search?q=salbutamol'],
    ['Ventolin inhaler', 'overige', 'https://www.bcfi.be/nl/search?q=salbutamol'],
    ['Serevent inhaler', 'overige', 'https://www.bcfi.be/nl/search?q=salmeterol'],
    ['Seretide inhaler', 'overige', 'https://www.bcfi.be/nl/search?q=salmeterol+fluticason'],
    ['Spiriva inhaler', 'overige', 'https://www.bcfi.be/nl/search?q=tiotropium'],
    ['Montelukast 10mg', 'allergie', 'https://www.bcfi.be/nl/search?q=montelukast'],
    ['Singulair', 'allergie', 'https://www.bcfi.be/nl/search?q=montelukast'],
    ['Sertraline 50mg', 'overige', 'https://www.bcfi.be/nl/search?q=sertraline'],
    ['Escitalopram 10mg', 'overige', 'https://www.bcfi.be/nl/search?q=escitalopram'],
    ['Paroxetine 20mg', 'overige', 'https://www.bcfi.be/nl/search?q=paroxetine'],
    ['Alprazolam 0.25mg', 'overige', 'https://www.bcfi.be/nl/search?q=alprazolam'],
    ['Lorazepam 1mg', 'overige', 'https://www.bcfi.be/nl/search?q=lorazepam'],
    ['Zolpidem 5mg', 'overige', 'https://www.bcfi.be/nl/search?q=zolpidem'],
    ['Zolpidem 10mg', 'overige', 'https://www.bcfi.be/nl/search?q=zolpidem'],

    // ── Pijnstillers uitgebreid ───────────────────────────────────
    ['Doliprane 1000mg', 'pijnstiller', 'https://www.bcfi.be/nl/search?q=paracetamol'],
    ['Paracetamol zetpil 250mg', 'pijnstiller', 'https://www.bcfi.be/nl/search?q=paracetamol'],
    ['Paracetamol zetpil 500mg', 'pijnstiller', 'https://www.bcfi.be/nl/search?q=paracetamol'],
    ['Paracetamol zetpil 1g', 'pijnstiller', 'https://www.bcfi.be/nl/search?q=paracetamol'],
    ['Dafalgan zetpil 600mg', 'pijnstiller', 'https://www.bcfi.be/nl/search?q=dafalgan'],
    ['Ibuprofen 800mg', 'pijnstiller', 'https://www.bcfi.be/nl/search?q=ibuprofen'],
    ['Ibuprofen gel', 'zalf/huid', 'https://www.bcfi.be/nl/search?q=ibuprofen'],
    ['Ibuprofen zetpil 500mg', 'pijnstiller', 'https://www.bcfi.be/nl/search?q=ibuprofen'],
    ['Brufen Retard 800mg', 'pijnstiller', 'https://www.bcfi.be/nl/search?q=brufen'],
    ['Naproxen 375mg', 'pijnstiller', 'https://www.bcfi.be/nl/search?q=naproxen'],
    ['Naproxen Retard 750mg', 'pijnstiller', 'https://www.bcfi.be/nl/search?q=naproxen'],
    ['Aspirine 300mg', 'pijnstiller', 'https://www.bcfi.be/nl/search?q=aspirine'],
    ['Aspirine Bruis 500mg', 'pijnstiller', 'https://www.bcfi.be/nl/search?q=aspirine'],
    ['Aspirine PROTECT 100mg', 'pijnstiller', 'https://www.bcfi.be/nl/search?q=aspirine'],
    ['Ketoprofen gel', 'zalf/huid', 'https://www.bcfi.be/nl/search?q=ketoprofen'],
    ['Voltaren Emulgel', 'zalf/huid', 'https://www.bcfi.be/nl/search?q=diclofenac'],
    ['Diclofenac 75mg', 'pijnstiller', 'https://www.bcfi.be/nl/search?q=diclofenac'],
    ['Diclofenac gel 1%', 'zalf/huid', 'https://www.bcfi.be/nl/search?q=diclofenac'],
    ['Indometacine 25mg', 'pijnstiller', 'https://www.bcfi.be/nl/search?q=indometacine'],
    ['Piroxicam 20mg', 'pijnstiller', 'https://www.bcfi.be/nl/search?q=piroxicam'],
    ['Meloxicam 7.5mg', 'pijnstiller', 'https://www.bcfi.be/nl/search?q=meloxicam'],
    ['Meloxicam 15mg', 'pijnstiller', 'https://www.bcfi.be/nl/search?q=meloxicam'],
    ['Arcoxia 60mg', 'pijnstiller', 'https://www.bcfi.be/nl/search?q=etoricoxib'],
    ['Arcoxia 90mg', 'pijnstiller', 'https://www.bcfi.be/nl/search?q=etoricoxib'],
    ['Tramadol 100mg', 'pijnstiller', 'https://www.bcfi.be/nl/search?q=tramadol'],
    ['Tramadol Retard 150mg', 'pijnstiller', 'https://www.bcfi.be/nl/search?q=tramadol'],
    ['Contramal 50mg', 'pijnstiller', 'https://www.bcfi.be/nl/search?q=tramadol'],
    ['Topalgic 50mg', 'pijnstiller', 'https://www.bcfi.be/nl/search?q=tramadol'],
    ['Zaldiar', 'pijnstiller', 'https://www.bcfi.be/nl/search?q=tramadol+paracetamol'],
    ['Ixprim', 'pijnstiller', 'https://www.bcfi.be/nl/search?q=tramadol+paracetamol'],
    ['Nefopam 20mg', 'pijnstiller', 'https://www.bcfi.be/nl/search?q=nefopam'],
    ['Acupan 20mg', 'pijnstiller', 'https://www.bcfi.be/nl/search?q=nefopam'],
    ['Lyrica 25mg', 'pijnstiller', 'https://www.bcfi.be/nl/search?q=pregabaline'],
    ['Lyrica 75mg', 'pijnstiller', 'https://www.bcfi.be/nl/search?q=pregabaline'],
    ['Pregabaline 75mg', 'pijnstiller', 'https://www.bcfi.be/nl/search?q=pregabaline'],
    ['Gabapentine 300mg', 'pijnstiller', 'https://www.bcfi.be/nl/search?q=gabapentine'],
    ['Neurontin 300mg', 'pijnstiller', 'https://www.bcfi.be/nl/search?q=gabapentine'],
    ['Capsaicine crème', 'zalf/huid', 'https://www.bcfi.be/nl/search?q=capsaicine'],
    ['Lidocaïne gel', 'zalf/huid', 'https://www.bcfi.be/nl/search?q=lidocaine'],
    ['EMLA crème', 'zalf/huid', 'https://www.bcfi.be/nl/search?q=lidocaine+prilocaine'],

    // ── Koorts uitgebreid ─────────────────────────────────────────
    ['Perdolan Mono 500mg', 'koorts', 'https://www.bcfi.be/nl/search?q=paracetamol'],
    ['Nurofen Express 200mg', 'koorts', 'https://www.bcfi.be/nl/search?q=ibuprofen'],
    ['Aspirine Kind 100mg', 'koorts', 'https://www.bcfi.be/nl/search?q=aspirine'],
    ['Dafalgan Kind 250mg', 'koorts', 'https://www.bcfi.be/nl/search?q=paracetamol'],
    ['Dafalgan Kind 500mg', 'koorts', 'https://www.bcfi.be/nl/search?q=paracetamol'],
    ['Paracetamol Kind siroop', 'koorts', 'https://www.bcfi.be/nl/search?q=paracetamol'],
    ['Ibuprofen Kind 100mg/5ml', 'koorts', 'https://www.bcfi.be/nl/search?q=ibuprofen'],
    ['Apiretal siroop', 'koorts', 'https://www.bcfi.be/nl/search?q=paracetamol'],

    // ── Spijsvertering uitgebreid ─────────────────────────────────
    ['Omeprazol 10mg', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=omeprazol'],
    ['Omeprazol 40mg', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=omeprazol'],
    ['Losec 20mg', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=omeprazol'],
    ['Pantoprazol 20mg', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=pantoprazol'],
    ['Nexium 40mg', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=esomeprazol'],
    ['Pariet 10mg', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=rabeprazol'],
    ['Rabeprazol 10mg', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=rabeprazol'],
    ['Zantac 150mg', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=ranitidine'],
    ['Rennie Deflatine', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=rennie'],
    ['Rennie Liquid', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=rennie'],
    ['Gaviscon Extra', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=gaviscon'],
    ['Phosphalugel', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=aluminiumfosfaat'],
    ['Algeldraat gel', 'spijsvertering', null],
    ['Imodium Plus', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=loperamide'],
    ['Loperamide 2mg', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=loperamide'],
    ['Racecadotril 100mg', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=racecadotril'],
    ['Tiorfix 100mg', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=racecadotril'],
    ['Duspatalin 135mg', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=mebeverine'],
    ['Mebeverine 135mg', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=mebeverine'],
    ['Spasmomen 40mg', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=otilonium'],
    ['Meteospasmyl', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=meteospasmyl'],
    ['Dicetel 50mg', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=pinaverium'],
    ['Cholestyramine sachets', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=colestyramine'],
    ['Colesevelam 625mg', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=colesevelam'],
    ['Ursochol 300mg', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=ursodeoxycholzuur'],
    ['Lactulose siroop', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=lactulose'],
    ['Miralax sachets', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=macrogol'],
    ['Moviprep', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=macrogol'],
    ['Colopeg', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=macrogol'],
    ['Normolact', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=lactulose'],
    ['Probilife', 'spijsvertering', null],
    ['Biogaia druppels', 'spijsvertering', null],
    ['Lactibiane', 'spijsvertering', null],
    ['Drastic capsules', 'spijsvertering', null],
    ['Pancrease capsules', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=pancreatine'],
    ['Creon 10000', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=pancreatine'],
    ['Sucralfaat 1g', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=sucralfaat'],
    ['Bismuth subsalicylaat', 'spijsvertering', null],

    // ── Allergie uitgebreid ───────────────────────────────────────
    ['Cetirizine 5mg', 'allergie', 'https://www.bcfi.be/nl/search?q=cetirizine'],
    ['Levocetirizine 5mg', 'allergie', 'https://www.bcfi.be/nl/search?q=levocetirizine'],
    ['Xyzal 5mg', 'allergie', 'https://www.bcfi.be/nl/search?q=levocetirizine'],
    ['Fexofenadine 120mg', 'allergie', 'https://www.bcfi.be/nl/search?q=fexofenadine'],
    ['Fexofenadine 180mg', 'allergie', 'https://www.bcfi.be/nl/search?q=fexofenadine'],
    ['Mizollen 10mg', 'allergie', 'https://www.bcfi.be/nl/search?q=mizolastine'],
    ['Mizolastine 10mg', 'allergie', 'https://www.bcfi.be/nl/search?q=mizolastine'],
    ['Dimetindeen gel', 'zalf/huid', 'https://www.bcfi.be/nl/search?q=dimetindeen'],
    ['Phenergan crème', 'zalf/huid', 'https://www.bcfi.be/nl/search?q=promethazine'],
    ['Promethazine 25mg', 'allergie', 'https://www.bcfi.be/nl/search?q=promethazine'],
    ['Claritine Kind siroop', 'allergie', 'https://www.bcfi.be/nl/search?q=loratadine'],
    ['Zyrtec Kind druppels', 'allergie', 'https://www.bcfi.be/nl/search?q=cetirizine'],
    ['Aerius Kind siroop', 'allergie', 'https://www.bcfi.be/nl/search?q=desloratadine'],
    ['Montelukast 5mg kind', 'allergie', 'https://www.bcfi.be/nl/search?q=montelukast'],
    ['Cromolyn neusspray', 'allergie', 'https://www.bcfi.be/nl/search?q=cromoglicinezuur'],
    ['Beconase neusspray', 'allergie', 'https://www.bcfi.be/nl/search?q=beclometason'],
    ['Beclometason neusspray', 'allergie', 'https://www.bcfi.be/nl/search?q=beclometason'],

    // ── Wondzorg uitgebreid ───────────────────────────────────────
    ['Betadine scrub', 'wondzorg', 'https://www.bcfi.be/nl/search?q=povidon-jood'],
    ['Betadine wondgel', 'wondzorg', 'https://www.bcfi.be/nl/search?q=povidon-jood'],
    ['Betadine oogdruppels', 'ogen/oren', 'https://www.bcfi.be/nl/search?q=povidon-jood'],
    ['Flaminal Forte gel', 'wondzorg', null],
    ['Inadine verband', 'wondzorg', null],
    ['Mepitel verband', 'wondzorg', null],
    ['Urgotul verband', 'wondzorg', null],
    ['Aquacel verband', 'wondzorg', null],
    ['Allevyn verband', 'wondzorg', null],
    ['Tegaderm folie', 'wondzorg', null],
    ['Compeed blaar', 'wondzorg', null],
    ['Compeed likdoorn', 'wondzorg', null],
    ['Scholl callus', 'wondzorg', null],
    ['Duofilm', 'wondzorg', null],
    ['Verrucid', 'wondzorg', null],
    ['Elmex tandgel', 'wondzorg', null],
    ['Corsodyl mondspoeling', 'wondzorg', null],
    ['Chloorhexidine mondspoeling', 'wondzorg', null],
    ['Tantum Verde spray', 'wondzorg', 'https://www.bcfi.be/nl/search?q=benzydamine'],
    ['Collu-Blache spray', 'wondzorg', null],
    ['Xylocaïne spray', 'wondzorg', 'https://www.bcfi.be/nl/search?q=lidocaine'],
    ['Traumeel gel', 'wondzorg', null],
    ['Arnica gel', 'zalf/huid', null],
    ['Arnica zalf', 'zalf/huid', null],

    // ── Zalf/Huid uitgebreid ──────────────────────────────────────
    ['Advantan crème', 'zalf/huid', 'https://www.bcfi.be/nl/search?q=methylprednisolon'],
    ['Elocom crème', 'zalf/huid', 'https://www.bcfi.be/nl/search?q=mometason'],
    ['Mometason crème', 'zalf/huid', 'https://www.bcfi.be/nl/search?q=mometason'],
    ['Dermovate crème', 'zalf/huid', 'https://www.bcfi.be/nl/search?q=clobetasol'],
    ['Clobetasol crème', 'zalf/huid', 'https://www.bcfi.be/nl/search?q=clobetasol'],
    ['Triam-Sanavita crème', 'zalf/huid', 'https://www.bcfi.be/nl/search?q=triamcinolon'],
    ['Daivobet zalf', 'zalf/huid', 'https://www.bcfi.be/nl/search?q=calcipotriol+betametason'],
    ['Dovobet gel', 'zalf/huid', 'https://www.bcfi.be/nl/search?q=calcipotriol+betametason'],
    ['Daivonex zalf', 'zalf/huid', 'https://www.bcfi.be/nl/search?q=calcipotriol'],
    ['Psorcutan zalf', 'zalf/huid', 'https://www.bcfi.be/nl/search?q=calcipotriol'],
    ['Alphosyl shampoo', 'zalf/huid', null],
    ['Polytar shampoo', 'zalf/huid', null],
    ['Stiprox shampoo', 'zalf/huid', null],
    ['Head & Shoulders', 'zalf/huid', null],
    ['Selsun shampoo', 'zalf/huid', null],
    ['Luizenshampoo', 'zalf/huid', null],
    ['Hedrin luizenlotion', 'zalf/huid', null],
    ['Lyclear crème', 'zalf/huid', 'https://www.bcfi.be/nl/search?q=permetrine'],
    ['Permetrine 5% crème', 'zalf/huid', 'https://www.bcfi.be/nl/search?q=permetrine'],
    ['Jacutin emulsie', 'zalf/huid', 'https://www.bcfi.be/nl/search?q=lindaan'],
    ['Nystatine crème', 'zalf/huid', 'https://www.bcfi.be/nl/search?q=nystatine'],
    ['Nystatine suspensie', 'zalf/huid', 'https://www.bcfi.be/nl/search?q=nystatine'],
    ['Daktacort crème', 'zalf/huid', 'https://www.bcfi.be/nl/search?q=miconazol+hydrocortison'],
    ['Lotriderm crème', 'zalf/huid', 'https://www.bcfi.be/nl/search?q=clotrimazol+betametason'],
    ['Kenacomb zalf', 'zalf/huid', 'https://www.bcfi.be/nl/search?q=triamcinolon'],
    ['Aureomycine zalf', 'zalf/huid', 'https://www.bcfi.be/nl/search?q=chloortetracycline'],
    ['Neomycine zalf', 'zalf/huid', null],
    ['Sofra-Tulle', 'wondzorg', null],
    ['Urgo filmzalf', 'zalf/huid', null],
    ['Contractubex gel', 'zalf/huid', null],
    ['Kelo-cote gel', 'zalf/huid', null],
    ['Bio-oil', 'zalf/huid', null],

    // ── Ogen/Oren uitgebreid ──────────────────────────────────────
    ['Bion Tears oogdruppels', 'ogen/oren', null],
    ['Refresh oogdruppels', 'ogen/oren', null],
    ['Optive oogdruppels', 'ogen/oren', null],
    ['Viscotears ooggel', 'ogen/oren', null],
    ['Vidisic ooggel', 'ogen/oren', null],
    ['Allergo-Comod oogdruppels', 'ogen/oren', null],
    ['Alomide oogdruppels', 'ogen/oren', 'https://www.bcfi.be/nl/search?q=lodoxamide'],
    ['Emadine oogdruppels', 'ogen/oren', 'https://www.bcfi.be/nl/search?q=emedastine'],
    ['Livostin oogdruppels', 'ogen/oren', 'https://www.bcfi.be/nl/search?q=levocabastine'],
    ['Spersallerg oogdruppels', 'ogen/oren', null],
    ['Ciloxan oogdruppels', 'ogen/oren', 'https://www.bcfi.be/nl/search?q=ciprofloxacine'],
    ['Exocin oogdruppels', 'ogen/oren', 'https://www.bcfi.be/nl/search?q=ofloxacine'],
    ['Fucithalmic ooggel', 'ogen/oren', 'https://www.bcfi.be/nl/search?q=fusidine'],
    ['Gentamicine oogdruppels', 'ogen/oren', 'https://www.bcfi.be/nl/search?q=gentamicine'],
    ['Pred Forte oogdruppels', 'ogen/oren', 'https://www.bcfi.be/nl/search?q=prednisolon'],
    ['Maxidex oogdruppels', 'ogen/oren', 'https://www.bcfi.be/nl/search?q=dexametason'],
    ['Acular oogdruppels', 'ogen/oren', 'https://www.bcfi.be/nl/search?q=ketorolac'],
    ['Isopto Carpine oogdruppels', 'ogen/oren', 'https://www.bcfi.be/nl/search?q=pilocarpine'],
    ['Timolol oogdruppels', 'ogen/oren', 'https://www.bcfi.be/nl/search?q=timolol'],
    ['Xalatan oogdruppels', 'ogen/oren', 'https://www.bcfi.be/nl/search?q=latanoprost'],
    ['Otrivin Duo neusspray', 'ogen/oren', null],
    ['Nasacort neusspray', 'allergie', 'https://www.bcfi.be/nl/search?q=triamcinolon'],
    ['Prorhinel neusspray', 'ogen/oren', null],
    ['Humer neusspray', 'ogen/oren', null],
    ['Audispray oorspray', 'ogen/oren', null],
    ['Earex oordruppels', 'ogen/oren', null],

    // ── Vitaminen uitgebreid ──────────────────────────────────────
    ['Vitamine A 5000IE', 'vitaminen', null],
    ['Vitamine B complex', 'vitaminen', null],
    ['Vitamine B2 riboflavine', 'vitaminen', null],
    ['Vitamine B3 niacine', 'vitaminen', null],
    ['Vitamine B5 pantotheenzuur', 'vitaminen', null],
    ['Vitamine C 250mg', 'vitaminen', null],
    ['Vitamine C bruis 1000mg', 'vitaminen', null],
    ['Redoxon 1000mg', 'vitaminen', 'https://www.bcfi.be/nl/search?q=vitamine+c'],
    ['Cebion 500mg', 'vitaminen', null],
    ['Vitamine D 400IE druppels', 'vitaminen', 'https://www.bcfi.be/nl/search?q=vitamine+d'],
    ['Vitamine D 800IE', 'vitaminen', 'https://www.bcfi.be/nl/search?q=vitamine+d'],
    ['Vitamine D 25000IE', 'vitaminen', 'https://www.bcfi.be/nl/search?q=vitamine+d'],
    ['Steovit D3', 'vitaminen', 'https://www.bcfi.be/nl/search?q=calcium+vitamine+d'],
    ['Ideos kauwtablet', 'vitaminen', 'https://www.bcfi.be/nl/search?q=calcium+vitamine+d'],
    ['Vitamine K 10mg', 'vitaminen', null],
    ['Vitamine E 200IE', 'vitaminen', null],
    ['Bion 3', 'vitaminen', null],
    ['Berocca bruis', 'vitaminen', null],
    ['Supradyn', 'vitaminen', null],
    ['Pharmaton', 'vitaminen', null],
    ['Centrum', 'vitaminen', null],
    ['Magnesium citraat', 'vitaminen', null],
    ['Magnesium oxide 300mg', 'vitaminen', null],
    ['Magnesium Diasporal', 'vitaminen', null],
    ['Slow-Mag', 'vitaminen', null],
    ['Ferro-Gradumet', 'vitaminen', 'https://www.bcfi.be/nl/search?q=ijzer'],
    ['Tardyferon 80mg', 'vitaminen', 'https://www.bcfi.be/nl/search?q=ijzer'],
    ['IJzer druppels kind', 'vitaminen', null],
    ['Foliumzuur 0.4mg', 'vitaminen', 'https://www.bcfi.be/nl/search?q=foliumzuur'],
    ['Foliumzuur 5mg', 'vitaminen', 'https://www.bcfi.be/nl/search?q=foliumzuur'],
    ['Iodiumzout tabletten', 'vitaminen', null],
    ['Kalium 600mg', 'vitaminen', null],
    ['Calcium sandoz bruis', 'vitaminen', null],
    ['Zink 15mg', 'vitaminen', null],
    ['Zink 45mg', 'vitaminen', null],
    ['Biotine 5mg', 'vitaminen', null],
    ['Silicium supplement', 'vitaminen', null],
    ['MSM supplement', 'vitaminen', null],
    ['Glucosamine 1500mg', 'vitaminen', null],
    ['Chondroïtine 800mg', 'vitaminen', null],
    ['Glucosamine + Chondroïtine', 'vitaminen', null],
    ['Collageen supplement', 'vitaminen', null],
    ['Curcuma extract', 'vitaminen', null],
    ['Resveratrol capsules', 'vitaminen', null],
    ['Astaxanthine', 'vitaminen', null],
    ['L-lysine 500mg', 'vitaminen', null],
    ['Taurine 500mg', 'vitaminen', null],
    ['L-carnitine 500mg', 'vitaminen', null],
    ['Spirulina tabletten', 'vitaminen', null],
    ['Visolie 1000mg', 'vitaminen', null],
    ['Krillolie capsules', 'vitaminen', null],
    ['Evening primrose olie', 'vitaminen', null],
    ['Teunisbloemolie', 'vitaminen', null],
    ['Lijnzaadolie capsules', 'vitaminen', null],

    // ── Antibiotica uitgebreid ────────────────────────────────────
    ['Amoxicilline 750mg', 'antibiotica', 'https://www.bcfi.be/nl/search?q=amoxicilline'],
    ['Penicilline V 500mg', 'antibiotica', 'https://www.bcfi.be/nl/search?q=fenoxymethylpenicilline'],
    ['Flucloxacilline 500mg', 'antibiotica', 'https://www.bcfi.be/nl/search?q=flucloxacilline'],
    ['Staphycid 500mg', 'antibiotica', 'https://www.bcfi.be/nl/search?q=flucloxacilline'],
    ['Cefadroxil 500mg', 'antibiotica', 'https://www.bcfi.be/nl/search?q=cefadroxil'],
    ['Cefalexine 500mg', 'antibiotica', 'https://www.bcfi.be/nl/search?q=cefalexine'],
    ['Cefixim 200mg', 'antibiotica', 'https://www.bcfi.be/nl/search?q=cefixim'],
    ['Suprax 200mg', 'antibiotica', 'https://www.bcfi.be/nl/search?q=cefixim'],
    ['Roxitromycine 150mg', 'antibiotica', 'https://www.bcfi.be/nl/search?q=roxitromycine'],
    ['Erytromycine 500mg', 'antibiotica', 'https://www.bcfi.be/nl/search?q=erytromycine'],
    ['Eryc 250mg', 'antibiotica', 'https://www.bcfi.be/nl/search?q=erytromycine'],
    ['Spiramycine 3MIU', 'antibiotica', 'https://www.bcfi.be/nl/search?q=spiramycine'],
    ['Josamycine 500mg', 'antibiotica', 'https://www.bcfi.be/nl/search?q=josamycine'],
    ['Levofloxacine 500mg', 'antibiotica', 'https://www.bcfi.be/nl/search?q=levofloxacine'],
    ['Tavanic 500mg', 'antibiotica', 'https://www.bcfi.be/nl/search?q=levofloxacine'],
    ['Moxifloxacine 400mg', 'antibiotica', 'https://www.bcfi.be/nl/search?q=moxifloxacine'],
    ['Avelox 400mg', 'antibiotica', 'https://www.bcfi.be/nl/search?q=moxifloxacine'],
    ['Tetracycline 500mg', 'antibiotica', 'https://www.bcfi.be/nl/search?q=tetracycline'],
    ['Minocycline 100mg', 'antibiotica', 'https://www.bcfi.be/nl/search?q=minocycline'],
    ['Lincomycine 500mg', 'antibiotica', null],
    ['Clindamycine 150mg', 'antibiotica', 'https://www.bcfi.be/nl/search?q=clindamycine'],
    ['Clindamycine 300mg', 'antibiotica', 'https://www.bcfi.be/nl/search?q=clindamycine'],
    ['Dalacin C', 'antibiotica', 'https://www.bcfi.be/nl/search?q=clindamycine'],
    ['Vancomycine', 'antibiotica', 'https://www.bcfi.be/nl/search?q=vancomycine'],
    ['Nitrofurantoïne 50mg', 'antibiotica', 'https://www.bcfi.be/nl/search?q=nitrofurantoine'],
    ['Furadantine 100mg', 'antibiotica', 'https://www.bcfi.be/nl/search?q=nitrofurantoine'],
    ['Pivmecillinam 200mg', 'antibiotica', 'https://www.bcfi.be/nl/search?q=pivmecillinam'],
    ['Selexid 200mg', 'antibiotica', 'https://www.bcfi.be/nl/search?q=pivmecillinam'],
    ['Tinidazol 500mg', 'antibiotica', 'https://www.bcfi.be/nl/search?q=tinidazol'],

    // ── Hart/Bloeddruk uitgebreid ─────────────────────────────────
    ['Enalapril 5mg', 'overige', 'https://www.bcfi.be/nl/search?q=enalapril'],
    ['Enalapril 10mg', 'overige', 'https://www.bcfi.be/nl/search?q=enalapril'],
    ['Enalapril 20mg', 'overige', 'https://www.bcfi.be/nl/search?q=enalapril'],
    ['Ramipril 2.5mg', 'overige', 'https://www.bcfi.be/nl/search?q=ramipril'],
    ['Ramipril 5mg', 'overige', 'https://www.bcfi.be/nl/search?q=ramipril'],
    ['Ramipril 10mg', 'overige', 'https://www.bcfi.be/nl/search?q=ramipril'],
    ['Perindopril 4mg', 'overige', 'https://www.bcfi.be/nl/search?q=perindopril'],
    ['Coversyl 5mg', 'overige', 'https://www.bcfi.be/nl/search?q=perindopril'],
    ['Candesartan 8mg', 'overige', 'https://www.bcfi.be/nl/search?q=candesartan'],
    ['Candesartan 16mg', 'overige', 'https://www.bcfi.be/nl/search?q=candesartan'],
    ['Irbesartan 150mg', 'overige', 'https://www.bcfi.be/nl/search?q=irbesartan'],
    ['Telmisartan 40mg', 'overige', 'https://www.bcfi.be/nl/search?q=telmisartan'],
    ['Olmesartan 20mg', 'overige', 'https://www.bcfi.be/nl/search?q=olmesartan'],
    ['Hydrochloorthiazide 12.5mg', 'overige', 'https://www.bcfi.be/nl/search?q=hydrochloorthiazide'],
    ['Indapamide 1.5mg', 'overige', 'https://www.bcfi.be/nl/search?q=indapamide'],
    ['Furosemide 20mg', 'overige', 'https://www.bcfi.be/nl/search?q=furosemide'],
    ['Furosemide 40mg', 'overige', 'https://www.bcfi.be/nl/search?q=furosemide'],
    ['Lasix 40mg', 'overige', 'https://www.bcfi.be/nl/search?q=furosemide'],
    ['Spironolacton 25mg', 'overige', 'https://www.bcfi.be/nl/search?q=spironolacton'],
    ['Atenolol 50mg', 'overige', 'https://www.bcfi.be/nl/search?q=atenolol'],
    ['Atenolol 100mg', 'overige', 'https://www.bcfi.be/nl/search?q=atenolol'],
    ['Nebivolol 5mg', 'overige', 'https://www.bcfi.be/nl/search?q=nebivolol'],
    ['Carvedilol 6.25mg', 'overige', 'https://www.bcfi.be/nl/search?q=carvedilol'],
    ['Nifedipine 30mg', 'overige', 'https://www.bcfi.be/nl/search?q=nifedipine'],
    ['Diltiazem 90mg', 'overige', 'https://www.bcfi.be/nl/search?q=diltiazem'],
    ['Verapamil 80mg', 'overige', 'https://www.bcfi.be/nl/search?q=verapamil'],
    ['Nitroglycerine spray', 'overige', 'https://www.bcfi.be/nl/search?q=nitroglycerine'],
    ['Isosorbidedinitraat 5mg', 'overige', 'https://www.bcfi.be/nl/search?q=isosorbidedinitraat'],
    ['Clopidogrel 75mg', 'overige', 'https://www.bcfi.be/nl/search?q=clopidogrel'],
    ['Plavix 75mg', 'overige', 'https://www.bcfi.be/nl/search?q=clopidogrel'],
    ['Prasugrel 10mg', 'overige', 'https://www.bcfi.be/nl/search?q=prasugrel'],
    ['Ticagrelor 90mg', 'overige', 'https://www.bcfi.be/nl/search?q=ticagrelor'],
    ['Warfarine 1mg', 'overige', 'https://www.bcfi.be/nl/search?q=warfarine'],
    ['Warfarine 5mg', 'overige', 'https://www.bcfi.be/nl/search?q=warfarine'],
    ['Marevan 5mg', 'overige', 'https://www.bcfi.be/nl/search?q=warfarine'],
    ['Rivaroxaban 10mg', 'overige', 'https://www.bcfi.be/nl/search?q=rivaroxaban'],
    ['Xarelto 20mg', 'overige', 'https://www.bcfi.be/nl/search?q=rivaroxaban'],
    ['Apixaban 5mg', 'overige', 'https://www.bcfi.be/nl/search?q=apixaban'],
    ['Eliquis 5mg', 'overige', 'https://www.bcfi.be/nl/search?q=apixaban'],
    ['Dabigatran 110mg', 'overige', 'https://www.bcfi.be/nl/search?q=dabigatran'],
    ['Pradaxa 150mg', 'overige', 'https://www.bcfi.be/nl/search?q=dabigatran'],
    ['Ezetimibe 10mg', 'overige', 'https://www.bcfi.be/nl/search?q=ezetimibe'],
    ['Fenofibrate 145mg', 'overige', 'https://www.bcfi.be/nl/search?q=fenofibrate'],
    ['Pravastatin 20mg', 'overige', 'https://www.bcfi.be/nl/search?q=pravastatine'],
    ['Fluvastatin 40mg', 'overige', 'https://www.bcfi.be/nl/search?q=fluvastatine'],

    // ── Diabetes uitgebreid ───────────────────────────────────────
    ['Gliclazide 30mg', 'overige', 'https://www.bcfi.be/nl/search?q=gliclazide'],
    ['Gliclazide 80mg', 'overige', 'https://www.bcfi.be/nl/search?q=gliclazide'],
    ['Glimepiride 1mg', 'overige', 'https://www.bcfi.be/nl/search?q=glimepiride'],
    ['Sitagliptine 100mg', 'overige', 'https://www.bcfi.be/nl/search?q=sitagliptine'],
    ['Januvia 100mg', 'overige', 'https://www.bcfi.be/nl/search?q=sitagliptine'],
    ['Empagliflozin 10mg', 'overige', 'https://www.bcfi.be/nl/search?q=empagliflozin'],
    ['Jardiance 10mg', 'overige', 'https://www.bcfi.be/nl/search?q=empagliflozin'],
    ['Dapagliflozin 10mg', 'overige', 'https://www.bcfi.be/nl/search?q=dapagliflozin'],
    ['Forxiga 10mg', 'overige', 'https://www.bcfi.be/nl/search?q=dapagliflozin'],
    ['Liraglutide pen', 'overige', 'https://www.bcfi.be/nl/search?q=liraglutide'],
    ['Victoza pen', 'overige', 'https://www.bcfi.be/nl/search?q=liraglutide'],
    ['Semaglutide pen', 'overige', 'https://www.bcfi.be/nl/search?q=semaglutide'],
    ['Ozempic pen', 'overige', 'https://www.bcfi.be/nl/search?q=semaglutide'],
    ['Pioglitazon 15mg', 'overige', 'https://www.bcfi.be/nl/search?q=pioglitazon'],
    ['Actos 30mg', 'overige', 'https://www.bcfi.be/nl/search?q=pioglitazon'],
    ['Repaglinide 0.5mg', 'overige', 'https://www.bcfi.be/nl/search?q=repaglinide'],
    ['Glucagon kit', 'hulpmiddel', null],
    ['Insulinepen naald', 'hulpmiddel', null],
    ['Freestyle Libre sensor', 'hulpmiddel', null],
    ['Dextrose gel', 'overige', null],

    // ── Zenuwstelsel / Psychiatrie ────────────────────────────────
    ['Fluoxetine 20mg', 'overige', 'https://www.bcfi.be/nl/search?q=fluoxetine'],
    ['Prozac 20mg', 'overige', 'https://www.bcfi.be/nl/search?q=fluoxetine'],
    ['Fluvoxamine 50mg', 'overige', 'https://www.bcfi.be/nl/search?q=fluvoxamine'],
    ['Venlafaxine 37.5mg', 'overige', 'https://www.bcfi.be/nl/search?q=venlafaxine'],
    ['Efexor 75mg', 'overige', 'https://www.bcfi.be/nl/search?q=venlafaxine'],
    ['Duloxetine 30mg', 'overige', 'https://www.bcfi.be/nl/search?q=duloxetine'],
    ['Cymbalta 60mg', 'overige', 'https://www.bcfi.be/nl/search?q=duloxetine'],
    ['Mirtazapine 15mg', 'overige', 'https://www.bcfi.be/nl/search?q=mirtazapine'],
    ['Remeron 30mg', 'overige', 'https://www.bcfi.be/nl/search?q=mirtazapine'],
    ['Citalopram 20mg', 'overige', 'https://www.bcfi.be/nl/search?q=citalopram'],
    ['Amitriptyline 10mg', 'overige', 'https://www.bcfi.be/nl/search?q=amitriptyline'],
    ['Amitriptyline 25mg', 'overige', 'https://www.bcfi.be/nl/search?q=amitriptyline'],
    ['Nortriptyline 25mg', 'overige', 'https://www.bcfi.be/nl/search?q=nortriptyline'],
    ['Quetiapine 25mg', 'overige', 'https://www.bcfi.be/nl/search?q=quetiapine'],
    ['Seroquel 100mg', 'overige', 'https://www.bcfi.be/nl/search?q=quetiapine'],
    ['Risperidon 1mg', 'overige', 'https://www.bcfi.be/nl/search?q=risperidon'],
    ['Olanzapine 5mg', 'overige', 'https://www.bcfi.be/nl/search?q=olanzapine'],
    ['Lithiumcarbonaat 400mg', 'overige', 'https://www.bcfi.be/nl/search?q=lithium'],
    ['Valproaat 500mg', 'overige', 'https://www.bcfi.be/nl/search?q=valproaat'],
    ['Depakine 500mg', 'overige', 'https://www.bcfi.be/nl/search?q=valproaat'],
    ['Lamotrigine 25mg', 'overige', 'https://www.bcfi.be/nl/search?q=lamotrigine'],
    ['Lamotrigine 100mg', 'overige', 'https://www.bcfi.be/nl/search?q=lamotrigine'],
    ['Carbamazepine 200mg', 'overige', 'https://www.bcfi.be/nl/search?q=carbamazepine'],
    ['Tegretol 200mg', 'overige', 'https://www.bcfi.be/nl/search?q=carbamazepine'],
    ['Levetiracetam 500mg', 'overige', 'https://www.bcfi.be/nl/search?q=levetiracetam'],
    ['Keppra 500mg', 'overige', 'https://www.bcfi.be/nl/search?q=levetiracetam'],
    ['Diazepam 2mg', 'overige', 'https://www.bcfi.be/nl/search?q=diazepam'],
    ['Diazepam 5mg', 'overige', 'https://www.bcfi.be/nl/search?q=diazepam'],
    ['Valium 5mg', 'overige', 'https://www.bcfi.be/nl/search?q=diazepam'],
    ['Oxazepam 10mg', 'overige', 'https://www.bcfi.be/nl/search?q=oxazepam'],
    ['Bromazepam 3mg', 'overige', 'https://www.bcfi.be/nl/search?q=bromazepam'],
    ['Lexotan 3mg', 'overige', 'https://www.bcfi.be/nl/search?q=bromazepam'],
    ['Clonazepam 0.5mg', 'overige', 'https://www.bcfi.be/nl/search?q=clonazepam'],
    ['Rivotril 0.5mg', 'overige', 'https://www.bcfi.be/nl/search?q=clonazepam'],
    ['Zopiclone 7.5mg', 'overige', 'https://www.bcfi.be/nl/search?q=zopiclon'],
    ['Imovane 7.5mg', 'overige', 'https://www.bcfi.be/nl/search?q=zopiclon'],
    ['Temesta 1mg', 'overige', 'https://www.bcfi.be/nl/search?q=lorazepam'],
    ['Methylfenidaat 10mg', 'overige', 'https://www.bcfi.be/nl/search?q=methylfenidaat'],
    ['Ritalin 10mg', 'overige', 'https://www.bcfi.be/nl/search?q=methylfenidaat'],
    ['Concerta 18mg', 'overige', 'https://www.bcfi.be/nl/search?q=methylfenidaat'],
    ['Atomoxetine 18mg', 'overige', 'https://www.bcfi.be/nl/search?q=atomoxetine'],
    ['Donepezil 5mg', 'overige', 'https://www.bcfi.be/nl/search?q=donepezil'],
    ['Aricept 10mg', 'overige', 'https://www.bcfi.be/nl/search?q=donepezil'],
    ['Memantine 10mg', 'overige', 'https://www.bcfi.be/nl/search?q=memantine'],
    ['Sumatriptan 50mg', 'pijnstiller', 'https://www.bcfi.be/nl/search?q=sumatriptan'],
    ['Imigran 50mg', 'pijnstiller', 'https://www.bcfi.be/nl/search?q=sumatriptan'],
    ['Rizatriptan 10mg', 'pijnstiller', 'https://www.bcfi.be/nl/search?q=rizatriptan'],
    ['Zolmitriptan 2.5mg', 'pijnstiller', 'https://www.bcfi.be/nl/search?q=zolmitriptan'],
    ['Eletriptan 40mg', 'pijnstiller', 'https://www.bcfi.be/nl/search?q=eletriptan'],
    ['Propranolol 40mg', 'overige', 'https://www.bcfi.be/nl/search?q=propranolol'],
    ['Cinnarizine 75mg', 'overige', 'https://www.bcfi.be/nl/search?q=cinnarizine'],
    ['Betahistine 8mg', 'overige', 'https://www.bcfi.be/nl/search?q=betahistine'],
    ['Betahistine 16mg', 'overige', 'https://www.bcfi.be/nl/search?q=betahistine'],
    ['Serc 16mg', 'overige', 'https://www.bcfi.be/nl/search?q=betahistine'],

    // ── Schildklier / Hormonen ────────────────────────────────────
    ['Levothyroxine 75mcg', 'overige', 'https://www.bcfi.be/nl/search?q=levothyroxine'],
    ['Levothyroxine 125mcg', 'overige', 'https://www.bcfi.be/nl/search?q=levothyroxine'],
    ['Thyrax 100mcg', 'overige', 'https://www.bcfi.be/nl/search?q=levothyroxine'],
    ['Carbimazol 5mg', 'overige', 'https://www.bcfi.be/nl/search?q=carbimazol'],
    ['Propylthiouracil 50mg', 'overige', 'https://www.bcfi.be/nl/search?q=propylthiouracil'],
    ['Hydrocortison 10mg', 'overige', 'https://www.bcfi.be/nl/search?q=hydrocortison'],
    ['Prednisone 5mg', 'overige', 'https://www.bcfi.be/nl/search?q=prednison'],
    ['Prednisone 20mg', 'overige', 'https://www.bcfi.be/nl/search?q=prednison'],
    ['Medrol 16mg', 'overige', 'https://www.bcfi.be/nl/search?q=methylprednisolon'],
    ['Dexamethason 0.5mg', 'overige', 'https://www.bcfi.be/nl/search?q=dexametason'],
    ['Estradiol 1mg', 'overige', 'https://www.bcfi.be/nl/search?q=estradiol'],
    ['Estradiol pleister', 'overige', 'https://www.bcfi.be/nl/search?q=estradiol'],
    ['Progesterone 200mg', 'overige', 'https://www.bcfi.be/nl/search?q=progesteron'],
    ['Utrogestan 200mg', 'overige', 'https://www.bcfi.be/nl/search?q=progesteron'],
    ['Tibolon 2.5mg', 'overige', 'https://www.bcfi.be/nl/search?q=tibolon'],
    ['Livial 2.5mg', 'overige', 'https://www.bcfi.be/nl/search?q=tibolon'],
    ['Testosteron gel', 'overige', 'https://www.bcfi.be/nl/search?q=testosteron'],
    ['Androgel', 'overige', 'https://www.bcfi.be/nl/search?q=testosteron'],

    // ── Gynaecologie uitgebreid ───────────────────────────────────
    ['Fluconazol 150mg', 'overige', 'https://www.bcfi.be/nl/search?q=fluconazol'],
    ['Diflucan 150mg', 'overige', 'https://www.bcfi.be/nl/search?q=fluconazol'],
    ['Clotrimazol vaginaal', 'zalf/huid', 'https://www.bcfi.be/nl/search?q=clotrimazol'],
    ['Gyno-Daktarin vaginaal', 'zalf/huid', 'https://www.bcfi.be/nl/search?q=miconazol'],
    ['Metronidazol vaginaal', 'zalf/huid', 'https://www.bcfi.be/nl/search?q=metronidazol'],
    ['Zidoval vaginaalgel', 'zalf/huid', 'https://www.bcfi.be/nl/search?q=metronidazol'],
    ['Neophedan vaginaal', 'zalf/huid', null],
    ['Combipack', 'zalf/huid', null],
    ['Morning-after pil', 'overige', 'https://www.bcfi.be/nl/search?q=levonorgestrel'],
    ['Norlevo 1.5mg', 'overige', 'https://www.bcfi.be/nl/search?q=levonorgestrel'],
    ['Ellaone 30mg', 'overige', 'https://www.bcfi.be/nl/search?q=ulipristal'],

    // ── Urologie ──────────────────────────────────────────────────
    ['Tamsulosine 0.4mg', 'overige', 'https://www.bcfi.be/nl/search?q=tamsulosine'],
    ['Omnic 0.4mg', 'overige', 'https://www.bcfi.be/nl/search?q=tamsulosine'],
    ['Alfuzosine 10mg', 'overige', 'https://www.bcfi.be/nl/search?q=alfuzosine'],
    ['Finasteride 5mg', 'overige', 'https://www.bcfi.be/nl/search?q=finasteride'],
    ['Proscar 5mg', 'overige', 'https://www.bcfi.be/nl/search?q=finasteride'],
    ['Solifenacine 5mg', 'overige', 'https://www.bcfi.be/nl/search?q=solifenacine'],
    ['Vesicare 5mg', 'overige', 'https://www.bcfi.be/nl/search?q=solifenacine'],
    ['Oxybutynine 5mg', 'overige', 'https://www.bcfi.be/nl/search?q=oxybutynine'],

    // ── Luchtwegen / Astma / COPD uitgebreid ─────────────────────
    ['Salbutamol 100mcg', 'overige', 'https://www.bcfi.be/nl/search?q=salbutamol'],
    ['Bricanyl inhaler', 'overige', 'https://www.bcfi.be/nl/search?q=terbutaline'],
    ['Terbutaline inhaler', 'overige', 'https://www.bcfi.be/nl/search?q=terbutaline'],
    ['Formoterol inhaler', 'overige', 'https://www.bcfi.be/nl/search?q=formoterol'],
    ['Foradil inhaler', 'overige', 'https://www.bcfi.be/nl/search?q=formoterol'],
    ['Fluticason inhaler', 'overige', 'https://www.bcfi.be/nl/search?q=fluticason'],
    ['Flixotide inhaler', 'overige', 'https://www.bcfi.be/nl/search?q=fluticason'],
    ['Budesonide inhaler', 'overige', 'https://www.bcfi.be/nl/search?q=budesonide'],
    ['Pulmicort inhaler', 'overige', 'https://www.bcfi.be/nl/search?q=budesonide'],
    ['Beclometason inhaler', 'overige', 'https://www.bcfi.be/nl/search?q=beclometason'],
    ['Qvar inhaler', 'overige', 'https://www.bcfi.be/nl/search?q=beclometason'],
    ['Symbicort inhaler', 'overige', 'https://www.bcfi.be/nl/search?q=budesonide+formoterol'],
    ['Foster inhaler', 'overige', 'https://www.bcfi.be/nl/search?q=beclometason+formoterol'],
    ['Relvar inhaler', 'overige', 'https://www.bcfi.be/nl/search?q=fluticason+vilanterol'],
    ['Ipratropium inhaler', 'overige', 'https://www.bcfi.be/nl/search?q=ipratropium'],
    ['Atrovent inhaler', 'overige', 'https://www.bcfi.be/nl/search?q=ipratropium'],
    ['Tiotropium inhaler', 'overige', 'https://www.bcfi.be/nl/search?q=tiotropium'],
    ['Umeclidinium inhaler', 'overige', 'https://www.bcfi.be/nl/search?q=umeclidinium'],
    ['Theofylline 200mg', 'overige', 'https://www.bcfi.be/nl/search?q=theofylline'],
    ['Aerobid inhaler', 'overige', null],
    ['Spacer inhalator', 'hulpmiddel', null],
    ['Vernevelaar', 'hulpmiddel', null],

    // ── Overige / Diversen ────────────────────────────────────────
    ['Hydroxychloroquine 200mg', 'overige', 'https://www.bcfi.be/nl/search?q=hydroxychloroquine'],
    ['Plaquenil 200mg', 'overige', 'https://www.bcfi.be/nl/search?q=hydroxychloroquine'],
    ['Allopurinol 100mg', 'overige', 'https://www.bcfi.be/nl/search?q=allopurinol'],
    ['Allopurinol 300mg', 'overige', 'https://www.bcfi.be/nl/search?q=allopurinol'],
    ['Colchicine 0.5mg', 'overige', 'https://www.bcfi.be/nl/search?q=colchicine'],
    ['Colchicine 1mg', 'overige', 'https://www.bcfi.be/nl/search?q=colchicine'],
    ['Febuxostat 80mg', 'overige', 'https://www.bcfi.be/nl/search?q=febuxostat'],
    ['Adalimumab pen', 'overige', 'https://www.bcfi.be/nl/search?q=adalimumab'],
    ['Humira pen', 'overige', 'https://www.bcfi.be/nl/search?q=adalimumab'],
    ['Methotrexaat 2.5mg', 'overige', 'https://www.bcfi.be/nl/search?q=methotrexaat'],
    ['Sulfasalazine 500mg', 'overige', 'https://www.bcfi.be/nl/search?q=sulfasalazine'],
    ['Leflunomide 10mg', 'overige', 'https://www.bcfi.be/nl/search?q=leflunomide'],
    ['Mesalazine 400mg', 'overige', 'https://www.bcfi.be/nl/search?q=mesalazine'],
    ['Pentasa 500mg', 'overige', 'https://www.bcfi.be/nl/search?q=mesalazine'],
    ['Azathioprine 50mg', 'overige', 'https://www.bcfi.be/nl/search?q=azathioprine'],
    ['Imuran 50mg', 'overige', 'https://www.bcfi.be/nl/search?q=azathioprine'],
    ['Ciclosporine 25mg', 'overige', 'https://www.bcfi.be/nl/search?q=ciclosporine'],
    ['Acitretine 25mg', 'overige', 'https://www.bcfi.be/nl/search?q=acitretine'],
    ['Varenicline 1mg', 'overige', 'https://www.bcfi.be/nl/search?q=varenicline'],
    ['Champix 1mg', 'overige', 'https://www.bcfi.be/nl/search?q=varenicline'],
    ['Bupropion 150mg', 'overige', 'https://www.bcfi.be/nl/search?q=bupropion'],
    ['Nicotinepleisters 21mg', 'overige', null],
    ['Nicotinekauwgom 2mg', 'overige', null],
    ['Nicotine zuigtablet', 'overige', null],
    ['Acamprosaat 333mg', 'overige', 'https://www.bcfi.be/nl/search?q=acamprosaat'],
    ['Naltrexon 50mg', 'overige', 'https://www.bcfi.be/nl/search?q=naltrexon'],
    ['Disulfiram 250mg', 'overige', 'https://www.bcfi.be/nl/search?q=disulfiram'],
    ['Domperidone 10mg', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=domperidon'],
    ['Ondansetron 4mg', 'overige', 'https://www.bcfi.be/nl/search?q=ondansetron'],
    ['Zofran 4mg', 'overige', 'https://www.bcfi.be/nl/search?q=ondansetron'],
    ['Metoclopramide 10mg', 'overige', 'https://www.bcfi.be/nl/search?q=metoclopramide'],
    ['Primperan 10mg', 'overige', 'https://www.bcfi.be/nl/search?q=metoclopramide'],
    ['Dexamethason 4mg', 'overige', 'https://www.bcfi.be/nl/search?q=dexametason'],
    ['Erythropoëtine', 'overige', null],
    ['Granulocyt-CSF', 'overige', null],
    ['Sildenafil 50mg', 'overige', 'https://www.bcfi.be/nl/search?q=sildenafil'],
    ['Viagra 50mg', 'overige', 'https://www.bcfi.be/nl/search?q=sildenafil'],
    ['Tadalafil 10mg', 'overige', 'https://www.bcfi.be/nl/search?q=tadalafil'],
    ['Cialis 20mg', 'overige', 'https://www.bcfi.be/nl/search?q=tadalafil'],
    ['Bisacodyl zetpil', 'spijsvertering', 'https://www.bcfi.be/nl/search?q=bisacodyl'],
    ['Glycerine zetpil', 'spijsvertering', null],
    ['Microlax baby', 'spijsvertering', null],
    ['Colpermin', 'spijsvertering', null],
    ['Pepermuntolie capsules', 'spijsvertering', null],
  ];
  const insertMany = db.transaction((items) => { items.forEach(i => ins.run(...i)); });
  insertMany(medicines);
  const total = db.prepare('SELECT COUNT(*) as c FROM geneesmiddelen_db').get().c;
  console.log(`Geneesmiddelen databank: ${total} middelen beschikbaar`);
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

// ── Locaties endpoint (alle unieke locaties uit database) ─────────
app.get('/api/locaties', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT DISTINCT locatie FROM medicijnen 
    WHERE locatie IS NOT NULL AND locatie != '' 
    ORDER BY locatie ASC
  `).all();
  const defaults = ['Badkamerkast', 'Keukenkast', 'EHBO-koffer', 'Nachtkastje', 'Garageapotheekkast', 'Reistas'];
  const fromDb = rows.map(r => r.locatie);
  // Merge: eerst uit DB (gebruikerseigen), dan defaults die er nog niet in zitten
  const all = [...new Set([...fromDb, ...defaults.filter(d => !fromDb.map(l=>l.toLowerCase()).includes(d.toLowerCase()))])];
  res.json(all);
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
