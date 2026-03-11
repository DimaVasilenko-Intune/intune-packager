# Intune Packager

> Chrome extension + Node.js backend that detects and packages Windows installers for Microsoft Intune deployment.

Automatically analyzes vendor pages and generates ready-to-use PowerShell scripts with silent install/uninstall commands and detection rules — ready for Intune Win32 app deployment.

![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D20.18.1-green)
![Chrome Extension](https://img.shields.io/badge/Chrome-Manifest%20V3-yellow)

---

## ⚡ Quick Start (Windows — 5 minutes)

> No prior experience with Node.js or Chrome extensions required.

### Step 1 — Download the repo

Click the green **Code** button at the top → **Download ZIP** → extract to e.g. `C:\intune-packager\`

*(Alternatively, if you have Git: `git clone https://github.com/DimaVasilenko-Intune/intune-packager`)*

### Step 2 — Install Node.js (one time)

1. Go to **[nodejs.org](https://nodejs.org)** → download the **LTS** version
2. Run the installer, click Next through all steps
3. Restart your PC if prompted

Verify it works — open **Command Prompt** (`Win + R` → type `cmd` → Enter):
```
node --version
```
Should show something like `v22.x.x`. You're good to go.

### Step 3 — Start the backend server

In the same Command Prompt window:
```
cd C:\intune-packager\backend
npm install
npm start
```

`npm install` takes 30–60 seconds the first time. After that you should see:
```
  Intune Packager backend
  → http://localhost:3001/health
```

**Keep this window open** while using the extension. The server stops if you close it.

### Step 4 — Load the extension in Chrome

1. Open Chrome and go to: `chrome://extensions/`
2. Turn on **Developer mode** (toggle in the upper right)
3. Click **Load unpacked**
4. Navigate to the `C:\intune-packager\extension\` folder → click **Select Folder**

A blue package icon appears in the Chrome toolbar. Click the pin icon (📌) to keep it visible.

### Step 5 — Test it

1. Go to e.g. [7-zip.org/download.html](https://www.7-zip.org/download.html)
2. Click the extension icon — you should see **● Connected** at the top
3. Click **Scan page**
4. Installer cards appear → click a card → copy commands or download ZIP

**Done.** The ZIP file contains Install.ps1, Uninstall.ps1, and Detection.ps1 ready for Intune.

---

> **Next time** you only need to start the backend again (Step 3) — Node.js and the extension are already installed.

---

## Screenshot

```
┌─────────────────────────────────────────┐
│  📦 Intune Packager       ● Connected ⚙│
├─────────────────────────────────────────┤
│  [MSI]  Setup-3.2.1-x64.msi      ●HIGH │
│  v3.2.1 · 45 MB · Found on page         │
├─────────────────────────────────────────┤
│  [EXE]  zoom_x64.exe             ◐MED  │
│  Found on page                          │
└─────────────────────────────────────────┘
```

---

## Features

| Feature | Description |
|---|---|
| **Auto-detection** | Scans DOM for `.msi`, `.exe`, `.msix` links and code blocks |
| **BFS crawler** | Crawls vendor websites (max 10 pages) with retry and rate-limiting |
| **SSRF protection** | URL validation blocks private IP ranges, loopback, and cloud metadata endpoints |
| **Regex analysis** | Advanced pattern matching for msiexec, Inno Setup, NSIS, InstallShield, WiX |
| **AI analysis** | Optional analysis via Claude (Haiku) or OpenAI (GPT-4o mini) |
| **Input validation** | All API routes validated with Zod schemas (type, length, format) |
| **ZIP package** | Generates complete Intune package with Install/Uninstall/Detection PS1 scripts |
| **Security hardening** | Helmet, rate limiting, compression, CORS configuration, PS1 sanitization |
| **One-click copy** | All commands have a direct copy button |
| **Dark theme** | 400px popup with modern dark UI and state machine |
| **Options page** | Configuration for backend URL, AI provider, and API key |

---

## Project Structure

```
intune-packager/
├── extension/                    ← Chrome extension (load unpacked)
│   ├── manifest.json
│   ├── background/
│   │   └── service-worker.js     Tab state and message handling
│   ├── content/
│   │   └── detector.js           DOM scanner for installers
│   ├── popup/
│   │   ├── popup.html            400px dark UI
│   │   ├── popup.css             Design tokens + state classes
│   │   └── popup.js              5-state machine (idle/scanning/results/detail/error)
│   ├── options/
│   │   ├── options.html          Settings page
│   │   ├── options.css
│   │   └── options.js
│   └── assets/icons/
│       ├── icon16.png
│       ├── icon48.png
│       ├── icon128.png
│       └── generate-icons.js     Regenerate icons: node generate-icons.js
│
└── backend/                      ← Node.js Express server
    ├── package.json
    ├── server.js                 Entry point, port 3001
    └── src/
        ├── routes/
        │   ├── health.js         GET  /health
        │   ├── analyze.js        POST /api/analyze
        │   └── generate-package.js POST /api/generate-package
        ├── services/
        │   ├── crawler/
        │   │   ├── index.js      BFS orchestrator (max 10 pages)
        │   │   ├── fetcher.js    HTTP + retry + rate-limiting + SSRF validation
        │   │   └── url-validator.js  SSRF protection (blocks private IPs/metadata)
        │   ├── analyzer/
        │   │   ├── index.js      Selects AI or regex, merges results
        │   │   ├── ai-analyzer.js  Claude + OpenAI API clients
        │   │   └── regex-analyzer.js  Advanced regex patterns
        │   └── packager/
        │       ├── index.js      ZIP generation with archiver
        │       └── templates/
        │           ├── Install.ps1
        │           ├── Uninstall.ps1
        │           └── Detection.ps1
        └── middleware/
            └── error-handler.js  Consistent JSON error format
```

---

## Getting Started

### Requirements
- Node.js 20.18.1+
- Chrome / Chromium
- (Optional) API key from [Anthropic](https://console.anthropic.com) or [OpenAI](https://platform.openai.com)

### 1 — Start backend

```bash
cd backend
npm install
npm start
# → http://localhost:3001/health
```

Verify it's running:
```bash
curl http://localhost:3001/health
# {"status":"ok","version":"1.0.0","aiProvider":"none",...}
```

### 2 — Load extension

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (upper right)
3. Click **Load unpacked**
4. Select the `extension/` folder in this repo
5. The extension icon appears in the toolbar

### 3 — Verify connection

Click the extension icon. The header should show `● Connected`. Green dot = backend is running.

---

## Usage

1. Navigate to a vendor page, e.g. `zoom.us/download`, `7-zip.org`, `code.visualstudio.com/download`
2. Click the extension icon → **Scan page**
3. The extension scans the page, crawls the vendor domain, and analyzes installers
4. Click an installer card for the detail view
5. Copy install/uninstall commands or detection rule with one click
6. Click **Download package (ZIP)** to download the complete Intune package

### Generated ZIP contents

| File | Description |
|---|---|
| `Install.ps1` | Silent install with exit code handling and logging |
| `Uninstall.ps1` | Silent uninstall with cleanup |
| `Detection.ps1` | Intune detection rule (exit 0 = installed, exit 1 = not installed) |
| `metadata.json` | App info, version, source URL, Intune settings |
| `README.txt` | Instructions, verification checklist |

### Intune setup (Win32 app)

```
Install command:   powershell.exe -ExecutionPolicy Bypass -File Install.ps1
Uninstall command: powershell.exe -ExecutionPolicy Bypass -File Uninstall.ps1
Detection rule:    Custom script: Detection.ps1
```

---

## AI Analysis (optional)

Go to ⚙ **Settings** in the extension popup.

| Setting | Description |
|---|---|
| **AI provider** | None / OpenAI / Claude |
| **API key** | Stored locally in `chrome.storage.local` (not synced), only sent to selected AI |
| **Analysis mode** | AI-first with regex fallback (recommended) / Regex only |

**Claude (Haiku)** — fast and affordable, great at structured extraction
**OpenAI (GPT-4o mini)** — alternative with good JSON output

Without an AI key, the regex analyzer is always used as fallback.

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

**Headers (optional):**
```
x-ai-provider: claude | openai | none
x-ai-key: sk-ant-... | sk-...
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

Send the full analysis result (from `/api/analyze`) and receive a ZIP file.

```bash
curl -X POST http://localhost:3001/api/generate-package \
  -H "Content-Type: application/json" \
  -d @analysis-result.json \
  --output package.zip
```

---

## Analysis Details

### Regex Patterns

The regex analyzer covers:

- **msiexec** — all flag combinations (`/i`, `/quiet`, `/qn`, `/norestart`, logging)
- **GUID/ProductCode** — `{XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}` from all contexts
- **EXE frameworks** — Inno Setup, NSIS, InstallShield, WiX, Advanced Installer
- **Registry paths** — `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\...`
- **File paths** — `%ProgramFiles%`, `C:\Program Files\...`
- **Version numbers** — from filenames and documentation text

### Confidence Scoring

| Points | Source |
|---|---|
| +30 | GUID/ProductCode found |
| +15 | MSI/MSIX type |
| +10 | EXE framework identified |
| +8  | `/quiet` flag in install command |
| +5  | `/norestart` flag |
| +7  | `msiexec` command |
| +10 | Uninstall via GUID |
| +5  | Detection via `Test-Path` |

---

## Development

### Dev mode backend

```bash
cd backend
npm run dev    # node --watch (auto-restart on changes)
```

### Regenerate icons

```bash
cd extension/assets/icons
node generate-icons.js
```

### Run a local analysis

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

## Troubleshooting

| Problem | Solution |
|---|---|
| Red dot in popup | Start backend: `cd backend && npm start` |
| "No installers found" | The page may use JavaScript-rendered download links. The backend crawler will still analyze the URL. |
| Low confidence | The vendor page lacks documentation. Use AI mode for better results. |
| AI analysis fails | Check that the API key is correct in settings. The extension automatically falls back to regex. |
| CORS error | Verify the backend is running on the correct port (default: 3001) |

**Backend log:**
```
GET /health 200 - 2.3 ms
[analyze] ZoomInstallerFull.msi (msi) from https://zoom.us/download
[analyze] crawled 4 pages, 18432 chars
```

**Intune Management Extension log (on client):**
```
C:\ProgramData\Microsoft\IntuneManagementExtension\Logs\IntuneManagementExtension.log
```

---

## Contributing

Pull requests are welcome. Feel free to open an issue for bugs or suggestions.

---

## Production Deployment

For running in production:

```bash
cd backend
NODE_ENV=production CORS_ORIGINS=https://your-domain.com npm start
```

**Windows:**
```cmd
cd backend
set NODE_ENV=production
set CORS_ORIGINS=https://your-domain.com
npm run start:prod
```

| Environment Variable | Description | Default |
|---|---|---|
| `NODE_ENV` | `production` enables strict CORS, rate limiting (30/min), and `combined` logging | `development` |
| `CORS_ORIGINS` | Comma-separated list of allowed CORS origins | All allowed (dev) |
| `PORT` | Server port | `3001` |

### Production Security Measures

- **Helmet** — Security headers (CSP, HSTS, X-Frame-Options, etc.)
- **Rate limiting** — 30 requests/minute per IP on `/api/` routes
- **Compression** — Gzip/Brotli for all responses
- **SSRF protection** — Blocks private IPs, loopback, cloud metadata
- **Input validation** — Zod schemas on all routes
- **PS1 sanitization** — Strips shell operators from template values
- **Graceful shutdown** — Handles SIGTERM/SIGINT with 10s timeout

---

## License

MIT
