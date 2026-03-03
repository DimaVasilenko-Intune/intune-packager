# Intune Packager

> Chrome extension + Node.js backend for detecting and packaging Windows installers for Microsoft Intune.

Automatically analyzes vendor pages and generates ready-to-use PowerShell scripts with silent install/uninstall commands and detection rules — ready for Intune Win32 app deployment.

![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18-green)
![Chrome Extension](https://img.shields.io/badge/Chrome-Manifest%20V3-yellow)

---

## ⚡ Quick Start (Windows — 5 minutes)

> No prior experience with Node.js or Chrome extensions required.

### Step 1 — Download the repo

Click the green **Code** button → **Download ZIP** → extract to e.g. `C:\intune-packager\`

*(Or if you have Git: `git clone https://github.com/DimaVasilenko-Intune/intune-packager`)*

### Step 2 — Install Node.js (once)

1. Go to **[nodejs.org](https://nodejs.org)** → download the **LTS** version
2. Run the installer, click Next all the way through
3. Restart your PC if prompted

Verify it worked — open **Command Prompt** (`Win + R` → type `cmd` → Enter):
```
node --version
```
Should show something like `v22.x.x`. You're ready.

### Step 3 — Start the backend server

In the same Command Prompt window:
```
cd C:\intune-packager\backend
npm install
npm start
```

`npm install` takes 30–60 seconds the first time. Then you should see:
```
  Intune Packager backend
  → http://localhost:3001/health
```

**Keep this window open** while using the extension. The server stops when you close it.

### Step 4 — Load the extension in Chrome

1. Open Chrome and go to: `chrome://extensions/`
2. Enable **Developer mode** (toggle in the top right)
3. Click **Load unpacked**
4. Navigate to the `C:\intune-packager\extension\` folder → click **Select Folder**

A blue package icon appears in the Chrome toolbar. Click it to pin it (📌).

### Step 5 — Test it

1. Go to e.g. [7-zip.org/download.html](https://www.7-zip.org/download.html)
2. Click the extension icon — you should see **● Connected** at the top
3. Click **Scan page**
4. Installer cards appear → click a card → copy commands or download ZIP

**Done.** The ZIP contains Install.ps1, Uninstall.ps1 and Detection.ps1 ready for Intune.

---

> **Next time** you only need to start the backend again (Step 3) — Node.js and the extension are already installed.

---

## Screenshot

```
┌─────────────────────────────────────────┐
│  📦 Intune Packager        ● Connected ⚙│
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
| **Auto-detection** | Scans the DOM for `.msi`, `.exe`, `.msix` links and code blocks |
| **BFS crawler** | Crawls the vendor website (up to 10 pages) with retry and rate-limiting |
| **Regex analysis** | Extended pattern matching for msiexec, Inno Setup, NSIS, InstallShield, WiX |
| **AI analysis** | Optional analysis via Claude, OpenAI, Google Gemini or Mistral — with OAuth support |
| **ZIP package** | Generates a complete Intune package with Install/Uninstall/Detection PS1 scripts |
| **One-click copy** | All commands have a direct copy button |
| **Dark theme** | 400px popup with modern dark UI and state machine |
| **Options page** | Provider cards with toggle, model selector, API key and OAuth per provider |

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
│   │   ├── options.html          Settings page with provider cards
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
        │   │   └── fetcher.js    HTTP + retry + rate-limiting
        │   ├── analyzer/
        │   │   ├── index.js      Selects AI or regex, merges results
        │   │   ├── ai-analyzer.js  Thin shim → delegates to ai-providers/
        │   │   └── regex-analyzer.js  Extended regex patterns
        │   ├── ai-providers/
        │   │   ├── index.js      Registry + dispatcher (shared prompt/parser)
        │   │   ├── anthropic.js  Claude adapter
        │   │   ├── openai.js     OpenAI adapter (API key + OAuth)
        │   │   ├── gemini.js     Gemini adapter (API key + OAuth)
        │   │   └── mistral.js    Mistral adapter (OpenAI-compatible format)
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
- Node.js 18+
- Chrome / Chromium
- (Optional) API key from [Anthropic](https://console.anthropic.com), [OpenAI](https://platform.openai.com), [Google AI Studio](https://aistudio.google.com) or [Mistral](https://console.mistral.ai)

### 1 — Start the backend

```bash
cd backend
npm install
npm start
# → http://localhost:3001/health
```

Verify it's running:
```bash
curl http://localhost:3001/health
# {"status":"ok","version":"1.0.0",...}
```

### 2 — Load the extension

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `extension/` folder in this repo
5. The extension icon appears in the toolbar

### 3 — Verify connection

Click the extension icon. The header should show `● Connected`. Green dot = backend is up.

---

## Usage

1. Go to a vendor page, e.g. `zoom.us/download`, `7-zip.org`, `code.visualstudio.com/download`
2. Click the extension icon → **Scan page**
3. The extension scans the page, crawls the vendor domain and analyzes installers
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
| `README.txt` | Instructions and manual verification checklist |

### Intune setup (Win32 app)

```
Install command:   powershell.exe -ExecutionPolicy Bypass -File Install.ps1
Uninstall command: powershell.exe -ExecutionPolicy Bypass -File Uninstall.ps1
Detection rule:    Custom script: Detection.ps1
```

---

## AI Analysis (optional)

Open ⚙ **Settings** from the extension popup.

### Supported providers

| Provider | Auth | Models |
|---|---|---|
| **Claude** (Anthropic) | API key | Opus 4.6, Sonnet 4.6, Haiku 4.5 |
| **OpenAI** | API key or OAuth | GPT-4o, GPT-4o mini, GPT-4 Turbo, o1, o3, o3-mini |
| **Google Gemini** | API key or OAuth | Gemini 2.0 Flash, Gemini 1.5 Pro, Gemini 2.0 Pro (exp) |
| **Mistral** | API key | Mistral Large, Mistral Medium, Codestral |

### Setup

1. Open **Settings** (⚙ icon in the popup header)
2. Select the **Active provider** at the top
3. Click the provider card and enable the toggle
4. Choose the desired **model** from the dropdown
5. Enter an **API key** — or use **OAuth** (Gemini / OpenAI)
6. Click **Test** to verify the connection
7. Save settings

### OAuth flow (Gemini and OpenAI)

1. Enter the **Client ID** from your Google Cloud / OpenAI application
2. Click **Connect to Google** / **Connect to OpenAI**
3. Complete authentication in the popup window that opens
4. The token is stored automatically with an expiry timestamp

### Analysis mode

| Mode | Description |
|---|---|
| **AI-first** | AI analyzes the text, regex used as fallback (recommended) |
| **Regex only** | No API calls, fast and free |

Without a valid key/token the extension automatically falls back to regex analysis.

---

## Backend API

### `GET /health`

```json
{
  "status": "ok",
  "version": "1.0.0",
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
x-ai-provider:  claude | openai | gemini | mistral | none
x-ai-model:     claude-sonnet-4-6 | gpt-4o | gemini-2.0-flash | mistral-large-latest
x-ai-key:       API key (if authType=apikey)
x-ai-oauth:     OAuth access token (if authType=oauth)
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
  "aiProvider": "claude",
  "aiModel": "claude-sonnet-4-6",
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

### Regex patterns

The regex analyzer covers:

- **msiexec** — all flag combinations (`/i`, `/quiet`, `/qn`, `/norestart`, logging)
- **GUID/ProductCode** — `{XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}` from all contexts
- **EXE frameworks** — Inno Setup, NSIS, InstallShield, WiX, Advanced Installer
- **Registry paths** — `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\...`
- **File paths** — `%ProgramFiles%`, `C:\Program Files\...`
- **Version numbers** — from filename and documentation text

### Confidence scoring

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

### Backend dev mode

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
| Red dot in popup | Start the backend: `cd backend && npm start` |
| "No installers found" | The page may use JavaScript-rendered download links. The backend crawler will still analyze the URL. |
| Low confidence | The vendor page lacks documentation. Use AI mode for better results. |
| AI analysis fails | Check that the API key is correct in settings. The extension automatically falls back to regex. |
| OAuth token expired | Re-authenticate in Settings — click the connect button again. |
| CORS error | Check that the backend is running on the correct port (default: 3001) |

**Backend log:**
```
GET /health 200 - 2.3 ms
[analyze] ZoomInstallerFull.msi (msi) from https://zoom.us/download — claude/claude-sonnet-4-6
[analyze] crawled 4 pages, 18432 chars
```

**Intune Management Extension log (on client):**
```
C:\ProgramData\Microsoft\IntuneManagementExtension\Logs\IntuneManagementExtension.log
```

---

## Contributing

Pull requests are welcome. Feel free to open an issue for bugs or feature requests.

---

## License

MIT
