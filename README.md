# Intune Packager

> Chrome-extension + Node.js backend for å detektere og pakke Windows-installere til Microsoft Intune.

Analyserer leverandørsider automatisk og genererer ferdige PowerShell-skript med silent install/uninstall-kommandoer og detection rules — klar til bruk i Intune Win32-deployering.

![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18-green)
![Chrome Extension](https://img.shields.io/badge/Chrome-Manifest%20V3-yellow)

---

## ⚡ Quick Start (Windows — 5 minutter)

> Ingen tidligere erfaring med Node.js eller Chrome-extensions nødvendig.

### Steg 1 — Last ned repoet

Klikk den grønne **Code**-knappen øverst → **Download ZIP** → pakk ut til f.eks. `C:\intune-packager\`

*(Alternativt hvis du har Git: `git clone https://github.com/DimaVasilenko-Intune/intune-packager`)*

### Steg 2 — Installer Node.js (én gang)

1. Gå til **[nodejs.org](https://nodejs.org)** → last ned **LTS**-versjonen
2. Kjør installeren, klikk Next hele veien
3. Restart PC hvis du blir bedt om det

Verifiser at det virket — åpne **Ledetekst** (`Win + R` → skriv `cmd` → Enter):
```
node --version
```
Skal vise noe som `v22.x.x`. Da er du klar.

### Steg 3 — Start backend-serveren

I samme Ledetekst-vindu:
```
cd C:\intune-packager\backend
npm install
npm start
```

`npm install` tar 30–60 sekunder første gang. Etterpå skal du se:
```
  Intune Packager backend
  → http://localhost:3001/health
```

**La dette vinduet stå åpent** mens du bruker extension-en. Serveren stopper hvis du lukker det.

### Steg 4 — Last inn extension i Chrome

1. Åpne Chrome og gå til: `chrome://extensions/`
2. Skru på **Developer mode** (toggle øverst til høyre)
3. Klikk **Load unpacked**
4. Naviger til mappen `C:\intune-packager\extension\` → klikk **Select Folder**

Et blått pakke-ikon dukker opp i Chrome-verktøylinjen. Klikk på det for å feste det (📌).

### Steg 5 — Test det

1. Gå til f.eks. [7-zip.org/download.html](https://www.7-zip.org/download.html)
2. Klikk extension-ikonet — du skal se **● Tilkoblet** øverst
3. Klikk **Scan siden**
4. Installer-kortene dukker opp → klikk et kort → kopier kommandoer eller last ned ZIP

**Ferdig.** ZIP-filen inneholder Install.ps1, Uninstall.ps1 og Detection.ps1 klare for Intune.

---

> **Neste gang** trenger du bare å starte backend igjen (Steg 3) — Node.js og extension er allerede installert.

---

## Skjermbilde

```
┌─────────────────────────────────────────┐
│  📦 Intune Packager        ● Tilkoblet ⚙│
├─────────────────────────────────────────┤
│  [MSI]  Setup-3.2.1-x64.msi      ●HIGH │
│  v3.2.1 · 45 MB · Funnet på siden       │
├─────────────────────────────────────────┤
│  [EXE]  zoom_x64.exe             ◐MED  │
│  Funnet på siden                        │
└─────────────────────────────────────────┘
```

---

## Funksjoner

| Funksjon | Beskrivelse |
|---|---|
| **Automatisk deteksjon** | Skanner DOM for `.msi`, `.exe`, `.msix`-lenker og kodeblokker |
| **BFS-crawler** | Crawles leverandørens nettsted (maks 10 sider) med retry og rate-limiting |
| **Regex-analyse** | Utvidet mønstergjenkjenning for msiexec, Inno Setup, NSIS, InstallShield, WiX |
| **AI-analyse** | Valgfri analyse via Claude, OpenAI, Google Gemini eller Mistral — med OAuth-støtte |
| **ZIP-pakke** | Genererer komplett Intune-pakke med Install/Uninstall/Detection PS1-skript |
| **En-klikk kopier** | Alle kommandoer har direkte kopieringsknapp |
| **Mørkt tema** | 400px popup med moderne dark UI og state machine |
| **Options-side** | Provider-kort med toggle, modellvelger, API-nøkkel og OAuth per leverandør |

---

## Prosjektstruktur

```
intune-packager/
├── extension/                    ← Chrome extension (load unpacked)
│   ├── manifest.json
│   ├── background/
│   │   └── service-worker.js     Tab-state og meldingshåndtering
│   ├── content/
│   │   └── detector.js           DOM-skanner for installere
│   ├── popup/
│   │   ├── popup.html            400px mørk UI
│   │   ├── popup.css             Design tokens + state-klasser
│   │   └── popup.js              5-state machine (idle/scanning/results/detail/error)
│   ├── options/
│   │   ├── options.html          Innstillingside
│   │   ├── options.css
│   │   └── options.js
│   └── assets/icons/
│       ├── icon16.png
│       ├── icon48.png
│       ├── icon128.png
│       └── generate-icons.js     Regenerer ikoner: node generate-icons.js
│
└── backend/                      ← Node.js Express server
    ├── package.json
    ├── server.js                 Inngangspunkt, port 3001
    └── src/
        ├── routes/
        │   ├── health.js         GET  /health
        │   ├── analyze.js        POST /api/analyze
        │   └── generate-package.js POST /api/generate-package
        ├── services/
        │   ├── crawler/
        │   │   ├── index.js      BFS-orchestrator (maks 10 sider)
        │   │   └── fetcher.js    HTTP + retry + rate-limiting
        │   ├── analyzer/
        │   │   ├── index.js      Velger AI eller regex, merger resultater
        │   │   ├── ai-analyzer.js  Tynn shim → delegerer til ai-providers/
        │   │   └── regex-analyzer.js  Utvidede regex-mønstre
        │   ├── ai-providers/
        │   │   ├── index.js      Registry + dispatcher (felles prompt/parser)
        │   │   ├── anthropic.js  Claude-adapter
        │   │   ├── openai.js     OpenAI-adapter (API-nøkkel + OAuth)
        │   │   ├── gemini.js     Gemini-adapter (API-nøkkel + OAuth)
        │   │   └── mistral.js    Mistral-adapter (OpenAI-kompatibelt format)
        │   └── packager/
        │       ├── index.js      ZIP-generering med archiver
        │       └── templates/
        │           ├── Install.ps1
        │           ├── Uninstall.ps1
        │           └── Detection.ps1
        └── middleware/
            └── error-handler.js  Konsistent JSON-feilformat
```

---

## Kom i gang

### Krav
- Node.js 18+
- Chrome / Chromium
- (Valgfritt) API-nøkkel fra [Anthropic](https://console.anthropic.com) eller [OpenAI](https://platform.openai.com)

### 1 — Start backend

```bash
cd backend
npm install
npm start
# → http://localhost:3001/health
```

Verifiser at den kjører:
```bash
curl http://localhost:3001/health
# {"status":"ok","version":"1.0.0","aiProvider":"none",...}
```

### 2 — Last inn extension

1. Åpne Chrome og gå til `chrome://extensions/`
2. Aktiver **Developer mode** (øverst til høyre)
3. Klikk **Load unpacked**
4. Velg mappen `extension/` i dette repoet
5. Extension-ikonet dukker opp i verktøylinjen

### 3 — Verifiser tilkobling

Klikk på extension-ikonet. Headeren skal vise `● Tilkoblet`. Grønn dot = backend er oppe.

---

## Bruk

1. Gå til en leverandørside, f.eks. `zoom.us/download`, `7-zip.org`, `code.visualstudio.com/download`
2. Klikk extension-ikonet → **Scan siden**
3. Extension-en skanner siden, crawles leverandørdomenet og analyserer installere
4. Klikk på et installer-kort for detaljvisning
5. Kopier install/uninstall-kommandoer eller detection rule med ett klikk
6. Klikk **Last ned pakke (ZIP)** for å laste ned ferdig Intune-pakke

### Generert ZIP-innhold

| Fil | Beskrivelse |
|---|---|
| `Install.ps1` | Silent install med exit-kode-håndtering og logging |
| `Uninstall.ps1` | Silent uninstall med cleanup |
| `Detection.ps1` | Intune detection rule (exit 0 = installert, exit 1 = ikke installert) |
| `metadata.json` | App-info, versjon, kilde-URL, Intune-innstillinger |
| `README.txt` | Instruksjoner, verifiseringssjekkliste |

### Intune-oppsett (Win32-app)

```
Install command:   powershell.exe -ExecutionPolicy Bypass -File Install.ps1
Uninstall command: powershell.exe -ExecutionPolicy Bypass -File Uninstall.ps1
Detection rule:    Custom script: Detection.ps1
```

---

## AI-analyse (valgfritt)

Gå til ⚙ **Innstillinger** i extension-popupen.

### Støttede leverandører

| Leverandør | Auth | Modeller |
|---|---|---|
| **Claude** (Anthropic) | API-nøkkel | Opus 4.6, Sonnet 4.6, Haiku 4.5 |
| **OpenAI** | API-nøkkel eller OAuth | GPT-4o, GPT-4o mini, GPT-4 Turbo, o1, o3, o3-mini |
| **Google Gemini** | API-nøkkel eller OAuth | Gemini 2.0 Flash, Gemini 1.5 Pro, Gemini 2.0 Pro (exp) |
| **Mistral** | API-nøkkel | Mistral Large, Mistral Medium, Codestral |

### Oppsett

1. Åpne **Innstillinger** (⚙-ikonet i popup-headeren)
2. Velg **Aktiv leverandør** øverst
3. Klikk på provider-kortet og slå på toggle
4. Velg ønsket **modell** fra nedtrekkslisten
5. Fyll inn **API-nøkkel** — eller bruk **OAuth** (Gemini / OpenAI)
6. Klikk **Test** for å verifisere tilkoblingen
7. Lagre innstillinger

### OAuth-flyt (Gemini og OpenAI)

1. Fyll inn **Client ID** fra din Google Cloud / OpenAI-applikasjon
2. Klikk **Koble til Google / Koble til OpenAI**
3. Fullfør autentisering i popup-vinduet som åpner seg
4. Token lagres automatisk med utløpstidspunkt

### Analysemodus

| Modus | Beskrivelse |
|---|---|
| **AI-first** | AI analyserer teksten, regex brukes som fallback (anbefalt) |
| **Kun regex** | Ingen API-kall, rask og gratis |

Uten gyldig nøkkel/token faller extension automatisk tilbake til regex-analyse.

---

## Backend API

### `GET /health`

```json
{
  "status": "ok",
  "version": "1.0.0",
  "aiProvider": "none",
  "timestamp": "2026-03-03T08:00:00.000Z"
}
```

### `POST /api/analyze`

**Request:**
```json
{
  "url": "https://zoom.us/client/latest/ZoomInstallerFull.msi",
  "filename": "ZoomInstallerFull.msi",
  "type": "msi",
  "pageUrl": "https://zoom.us/download"
}
```

**Headers (valgfritt):**
```
x-ai-provider:  claude | openai | gemini | mistral | none
x-ai-model:     claude-sonnet-4-6 | gpt-4o | gemini-2.0-flash | mistral-large-latest
x-ai-key:       API-nøkkel (hvis authType=apikey)
x-ai-oauth:     OAuth access token (hvis authType=oauth)
x-analyze-mode: ai-first | regex-only
```

**Response:**
```json
{
  "filename": "ZoomInstallerFull.msi",
  "type": "msi",
  "version": "6.3.0",
  "size": "45 MB",
  "install": "msiexec.exe /i \"ZoomInstallerFull.msi\" /quiet /norestart /l*v \"%TEMP%\\zoom_install.log\"",
  "uninstall": "msiexec.exe /x \"{GUID}\" /quiet /norestart",
  "detection": "$regPath = \"HKLM:\\SOFTWARE\\...\\{GUID}\"\nif (Test-Path $regPath) { exit 0 } else { exit 1 }",
  "confidence": 85,
  "guid": "{D1F6243A-...}",
  "aiUsed": true,
  "pagesCrawled": 4
}
```

### `POST /api/generate-package`

Sender inn hele analyse-resultatet (fra `/api/analyze`) og mottar en ZIP-fil.

```bash
curl -X POST http://localhost:3001/api/generate-package \
  -H "Content-Type: application/json" \
  -d @analyse-result.json \
  --output pakke.zip
```

---

## Analyse-detaljer

### Regex-mønstre

Regex-analyzeren dekker:

- **msiexec** — alle flaggkombinasjoner (`/i`, `/quiet`, `/qn`, `/norestart`, logging)
- **GUID/ProductCode** — `{XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}` fra alle kontekster
- **EXE-rammeverk** — Inno Setup, NSIS, InstallShield, WiX, Advanced Installer
- **Registry-stier** — `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\...`
- **Fil-stier** — `%ProgramFiles%`, `C:\Program Files\...`
- **Versjonsnummer** — fra filnavn og dokumentasjonstekst

### Konfidensscoring

| Poeng | Kilde |
|---|---|
| +30 | GUID/ProductCode funnet |
| +15 | MSI/MSIX-type |
| +10 | EXE-rammeverk identifisert |
| +8  | `/quiet`-flagg i install-kommando |
| +5  | `/norestart`-flagg |
| +7  | `msiexec`-kommando |
| +10 | Uninstall via GUID |
| +5  | Detection via `Test-Path` |

---

## Utvikling

### Dev-modus backend

```bash
cd backend
npm run dev    # node --watch (auto-restart ved endringer)
```

### Regenerer ikoner

```bash
cd extension/assets/icons
node generate-icons.js
```

### Kjør en lokal analyse

```bash
curl -X POST http://localhost:3001/api/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.7-zip.org/a/7z2408-x64.msi",
    "filename": "7z2408-x64.msi",
    "type": "msi",
    "pageUrl": "https://www.7-zip.org/download.html"
  }'
```

---

## Feilsøking

| Problem | Løsning |
|---|---|
| Rød dot i popup | Start backend: `cd backend && npm start` |
| "Ingen installere funnet" | Siden har kanskje JavaScript-rendret nedlastingslenker. Backend crawlen vil likevel analysere URL-en. |
| Lav konfidens | Leverandørsiden mangler dokumentasjon. Bruk AI-modus for bedre resultat. |
| AI-analyse feiler | Sjekk at API-nøkkelen er korrekt i innstillinger. Extension faller automatisk tilbake til regex. |
| CORS-feil | Sjekk at backend kjører på riktig port (standard: 3001) |

**Backend-logg:**
```
GET /health 200 - 2.3 ms
[analyze] ZoomInstallerFull.msi (msi) from https://zoom.us/download
[analyze] crawled 4 pages, 18432 chars
```

**Intune Management Extension-logg (på klient):**
```
C:\ProgramData\Microsoft\IntuneManagementExtension\Logs\IntuneManagementExtension.log
```

---

## Bidrag

Pull requests mottas med takk. Åpne gjerne en issue for bugs eller forslag.

---

## Lisens

MIT
