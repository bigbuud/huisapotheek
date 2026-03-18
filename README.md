# 💊 MedicijnKast

PWA voor het beheren van je thuisapotheek. Bijhouden van voorraad, vervaldata en categorieën — met een database van ~1000 Belgische medicijnen en slimme autocomplete.

## Functies

- 📦 Inventarisbeheer met hoeveelheden en locaties
- ⏰ Vervaldata opvolging met kleurgecodeerde alerts
- 🔍 Autocomplete op basis van 1000+ Belgische medicijnen
- 🗂️ 28 categorieën (pijn, allergie, maag, huid…)
- 📊 Dashboard met statistieken en waarschuwingen
- 🔐 Simpele login (aanpasbaar via docker-compose)
- 📱 PWA — installeerbaar op telefoon/tablet

---

## Installatie op Synology

### 1. Map aanmaken op de NAS

```bash
mkdir -p /volume1/docker/huisapotheek
```

### 2. Clone de repo

```bash
git clone https://github.com/bigbuud/huisapotheek.git
cd huisapotheek
```

### 3. Pas login aan in `docker-compose.yml`

```yaml
environment:
  APP_USERNAME: admin          # ← jouw gebruikersnaam
  APP_PASSWORD: medicijn123    # ← jouw wachtwoord
  SESSION_SECRET: verander-dit-naar-een-lang-geheim
```

### 4. Start de container

```bash
docker-compose up -d --build
```

Open daarna `http://SYNOLOGY_IP:3525` in je browser.

---

## GitHub upload

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/bigbuud/huisapotheek.git
git push -u origin main
```

---

## Poorten & paden

| Extern | Intern | Beschrijving     |
|--------|--------|-----------------|
| 3525   | 3000   | Web interface   |

| NAS pad                           | Container pad | Inhoud         |
|-----------------------------------|--------------|----------------|
| /volume1/docker/huisapotheek      | /data        | SQLite database |

## Data

De SQLite database staat op `/volume1/docker/huisapotheek/medicijnkast.db` op je NAS. Rechtstreeks toegankelijk en eenvoudig te backuppen via Hyper Backup.

---

## Structuur

```
huisapotheek/
├── app/
│   ├── data/
│   │   └── medicines.js      # ~1000 Belgische medicijnen
│   ├── db/
│   │   └── database.js       # SQLite laag
│   ├── public/
│   │   ├── index.html        # SPA frontend
│   │   ├── sw.js             # Service worker
│   │   ├── manifest.json     # PWA manifest
│   │   └── icons/            # App icons
│   ├── server.js             # Express API
│   ├── package.json
│   └── Dockerfile
├── .github/
│   └── workflows/
│       └── docker.yml        # Auto build → Docker Hub
├── docker-compose.yml
├── .gitignore
└── README.md
```
