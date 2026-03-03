'use strict';

// ── State machine ─────────────────────────────────────────────────────────────
const STATES = { IDLE: 'idle', SCANNING: 'scanning', RESULTS: 'results', DETAIL: 'detail', ERROR: 'error' };

let currentState   = STATES.IDLE;
let scanResults    = [];
let detailItem     = null;
let abortRequested = false;

// ── Settings (populated on load) ──────────────────────────────────────────────
let backendUrl     = 'http://localhost:3001';
let activeProvider = 'none';
let activeModel    = '';
let activeKey      = '';
let activeOAuth    = '';
let activeAuthType = 'apikey';
let analyzeMode    = 'ai-first';

// ── DOM helpers ───────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

function setState(state) {
  document.querySelectorAll('.state').forEach(el => el.classList.add('hidden'));
  $(`state-${state}`)?.classList.remove('hidden');
  currentState = state;
}

// ── Startup ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await checkBackend();
  restoreSessionState();

  $('settings-btn').onclick  = () => chrome.runtime.openOptionsPage();
  $('scan-btn-idle').onclick = startScan;
  $('cancel-btn').onclick    = () => { abortRequested = true; setState(STATES.IDLE); };
  $('rescan-btn').onclick    = startScan;
  $('back-btn').onclick      = () => setState(STATES.RESULTS);
  $('retry-btn').onclick     = startScan;
  $('download-btn').onclick  = downloadPackage;

  document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', onCopy);
  });
});

// ── Settings ──────────────────────────────────────────────────────────────────
async function loadSettings() {
  const data = await chrome.storage.sync.get(['backendUrl', 'analyzeMode', 'activeProvider', 'providers']);

  backendUrl   = data.backendUrl || 'http://localhost:3001';
  analyzeMode  = data.analyzeMode || 'ai-first';
  activeProvider = data.activeProvider || 'none';

  const providerCfg = data.providers?.[activeProvider];

  if (providerCfg) {
    activeModel    = providerCfg.model    || '';
    activeAuthType = providerCfg.authType || 'apikey';
    activeKey      = providerCfg.apiKey   || '';

    // Check OAuth token freshness
    if (activeAuthType === 'oauth') {
      const token  = providerCfg.oauthToken  || '';
      const expiry = providerCfg.oauthExpiry || 0;
      if (token && Date.now() < expiry) {
        activeOAuth = token;
      } else if (token) {
        // Token exists but expired — clear it, fall back to no auth
        console.warn('[popup] OAuth token utløpt for', activeProvider);
        activeOAuth = '';
      }
    }
  }

  // Update header provider badge
  updateHeaderBadge();
}

function updateHeaderBadge() {
  const textEl = $('status-text');
  if (!textEl) return;
  // Will be overwritten by checkBackend(), but set initial label
  if (activeProvider && activeProvider !== 'none') {
    // show provider + model in a nice label when connected
  }
}

// ── Backend health check ──────────────────────────────────────────────────────
async function checkBackend() {
  setStatus('checking', 'Sjekker...');
  try {
    const res  = await fetchWithTimeout(`${backendUrl}/health`, {}, 4000);
    const data = await res.json();
    if (data.status === 'ok') {
      const hasAuth = activeKey || activeOAuth;
      const label = (activeProvider !== 'none' && hasAuth)
        ? `${providerShortLabel(activeProvider)} · ${modelShortLabel(activeModel)}`
        : 'Tilkoblet';
      setStatus('connected', label);
    } else {
      setStatus('disconnected', 'Feil');
    }
  } catch {
    setStatus('disconnected', 'Frakoblet');
  }
}

function providerShortLabel(p) {
  return { claude: 'Claude', openai: 'OpenAI', gemini: 'Gemini', mistral: 'Mistral' }[p] || p;
}

function modelShortLabel(m = '') {
  // Shorten common model names
  return m
    .replace('claude-', '')
    .replace('-20251001', '')
    .replace('gemini-', '')
    .replace('-latest', '')
    .replace('gpt-', 'GPT-')
    .slice(0, 18);
}

function setStatus(type, text) {
  const dot   = $('status-dot');
  const label = $('status-text');
  dot.className     = `status-dot ${type}`;
  label.textContent = text;
}

// ── Session state ─────────────────────────────────────────────────────────────
async function restoreSessionState() {
  try {
    const data = await chrome.storage.session.get(['intuneResults']);
    if (data.intuneResults?.length) {
      scanResults = data.intuneResults;
      renderResults(scanResults);
      setState(STATES.RESULTS);
    }
  } catch { /* session storage not available */ }
}

// ── Scan ──────────────────────────────────────────────────────────────────────
async function startScan() {
  abortRequested = false;
  setState(STATES.SCANNING);
  resetSteps();

  try {
    activateStep(1, 'Leter etter installere...');
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    let detected = [];
    try {
      detected = await chrome.tabs.sendMessage(tab.id, { action: 'DETECT_INSTALLERS' });
    } catch {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/detector.js'] });
      detected = await chrome.tabs.sendMessage(tab.id, { action: 'DETECT_INSTALLERS' });
    }

    if (abortRequested) return;
    completeStep(1, `${detected.length} fil(er) funnet`);

    if (!detected.length) {
      detected = [{ url: tab.url, filename: extractFilenameFromUrl(tab.url), type: 'unknown' }];
    }

    activateStep(2, `Crawling ${new URL(tab.url).hostname}...`);
    completeStep(2, 'Crawling fullført');

    activateStep(3, `Analyserer ${detected.length} installer(e)...`);

    const results = [];
    for (const item of detected.slice(0, 5)) {
      if (abortRequested) return;
      try {
        const analysis = await analyzeInstaller(item, tab.url);
        if (analysis) results.push({ ...item, ...analysis });
      } catch (err) {
        console.warn('[popup] analyze failed for', item.filename, err.message);
      }
    }

    if (abortRequested) return;
    completeStep(3, `${results.length} analysert`);

    scanResults = results.length ? results : [{
      filename:   extractFilenameFromUrl(tab.url) || 'Ukjent installer',
      type:       'unknown',
      install:    '',
      uninstall:  '',
      detection:  '',
      confidence: 0,
      aiUsed:     false,
      error:      'Ingen installasjonsdetaljer funnet',
    }];

    try { await chrome.storage.session.set({ intuneResults: scanResults }); } catch {}

    renderResults(scanResults);
    setState(STATES.RESULTS);

  } catch (err) {
    console.error('[popup] scan error:', err);
    showError(err.message || 'Scan mislyktes. Sjekk at backend kjører.');
  }
}

// ── Analyze single installer ──────────────────────────────────────────────────
async function analyzeInstaller(item, pageUrl) {
  const body = {
    url:      item.url,
    filename: item.filename,
    type:     item.type,
    pageUrl,
  };

  const headers = {
    'Content-Type':   'application/json',
    'x-ai-provider':  activeProvider,
    'x-ai-model':     activeModel,
    'x-analyze-mode': analyzeMode,
  };

  if (activeAuthType === 'oauth' && activeOAuth) {
    headers['x-ai-oauth'] = activeOAuth;
  } else if (activeKey) {
    headers['x-ai-key'] = activeKey;
  }

  const res = await fetchWithTimeout(`${backendUrl}/api/analyze`, {
    method:  'POST',
    headers,
    body:    JSON.stringify(body),
  }, 60_000);

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  return res.json();
}

// ── Render results ────────────────────────────────────────────────────────────
function renderResults(items) {
  const list  = $('installer-list');
  const count = $('results-count');

  count.textContent = `${items.length} installer${items.length !== 1 ? 'e' : ''} funnet`;
  list.innerHTML    = '';

  if (!items.length) {
    list.innerHTML = `<div class="empty-state"><p>Ingen installere funnet</p><p>Prøv en nedlastingsside.</p></div>`;
    return;
  }

  items.forEach((item, idx) => {
    const card = document.createElement('div');
    card.className = 'installer-card';
    card.innerHTML = `
      <div class="card-type-badge ${(item.type || 'exe').toLowerCase()}">${(item.type || '?').toUpperCase()}</div>
      <div class="card-body">
        <div class="card-filename">${escHtml(item.filename || 'Ukjent')}</div>
        <div class="card-meta">${item.version ? `v${item.version} · ` : ''}${item.size ? item.size + ' · ' : ''}Funnet på siden</div>
      </div>
      <div class="card-confidence ${confidenceClass(item.confidence)}">${confidenceLabel(item.confidence)}</div>
    `;
    card.onclick = () => showDetail(idx);
    list.appendChild(card);
  });
}

// ── Detail view ───────────────────────────────────────────────────────────────
function showDetail(idx) {
  detailItem = scanResults[idx];
  const d = detailItem;

  const badges = $('detail-badges');
  badges.innerHTML = `
    <span class="badge badge-${(d.type||'exe').toLowerCase()}">${(d.type||'EXE').toUpperCase()}</span>
    <span class="badge badge-${confidenceClass(d.confidence)}">${confidenceLabel(d.confidence)}</span>
  `;

  $('detail-filename').textContent = d.filename || 'Ukjent installer';
  $('detail-meta').textContent = [
    d.version ? `v${d.version}` : null,
    d.size    ? d.size          : null,
    d.guid    ? `GUID: ${d.guid}` : null,
  ].filter(Boolean).join(' · ');

  const pct = d.confidence || 0;
  $('confidence-pct').textContent  = `${pct}%`;
  $('confidence-fill').style.width = `${pct}%`;
  $('confidence-fill').style.background = pct >= 70 ? '#22c55e' : pct >= 40 ? '#f59e0b' : '#ef4444';

  const aiBadge = $('ai-badge');
  if (d.aiUsed) {
    aiBadge.classList.remove('hidden');
    aiBadge.textContent = d.aiProvider
      ? `AI · ${providerShortLabel(d.aiProvider)}${d.aiModel ? ' / ' + modelShortLabel(d.aiModel) : ''}`
      : 'AI-assistert';
  } else {
    aiBadge.classList.add('hidden');
  }

  $('install-cmd').textContent    = d.install    || '(ikke tilgjengelig)';
  $('uninstall-cmd').textContent  = d.uninstall  || '(ikke tilgjengelig)';
  $('detection-rule').textContent = d.detection  || '(ikke tilgjengelig)';

  setState(STATES.DETAIL);
}

// ── Download ZIP ──────────────────────────────────────────────────────────────
async function downloadPackage() {
  if (!detailItem) return;

  const btn = $('download-btn');
  btn.disabled    = true;
  btn.textContent = '⏳ Genererer...';

  try {
    const res = await fetch(`${backendUrl}/api/generate-package`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(detailItem),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${sanitize(detailItem.filename)}_intune.zip`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    alert(`Nedlasting feilet: ${err.message}`);
  } finally {
    btn.disabled    = false;
    btn.textContent = '⬇ Last ned pakke (ZIP)';
  }
}

// ── Copy buttons ──────────────────────────────────────────────────────────────
function onCopy(e) {
  const btn    = e.currentTarget;
  const target = btn.dataset.target;
  const text   = $(target)?.textContent || '';
  navigator.clipboard.writeText(text).then(() => {
    btn.textContent = '✓';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = '⧉';
      btn.classList.remove('copied');
    }, 1500);
  });
}

// ── Progress steps ────────────────────────────────────────────────────────────
function resetSteps() {
  [1, 2, 3].forEach(n => {
    const el = $(`step-${n}`);
    el.classList.remove('active', 'done');
    $(`step-${n}-desc`).textContent = 'Venter';
  });
}

function activateStep(n, desc) {
  if (n > 1) doneStep(n - 1);
  $(`step-${n}`).classList.add('active');
  $(`step-${n}-desc`).textContent = desc;
}

function doneStep(n) {
  const el = $(`step-${n}`);
  el.classList.remove('active');
  el.classList.add('done');
}

function completeStep(n, desc) {
  doneStep(n);
  $(`step-${n}-desc`).textContent = `✓ ${desc}`;
}

// ── Error state ───────────────────────────────────────────────────────────────
function showError(msg) {
  $('error-message').textContent = msg;
  setState(STATES.ERROR);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function confidenceClass(pct = 0) {
  if (pct >= 70) return 'high';
  if (pct >= 40) return 'medium';
  return 'low';
}

function confidenceLabel(pct = 0) {
  if (pct >= 70) return '●HIGH';
  if (pct >= 40) return '◐MED';
  return '○LOW';
}

function extractFilenameFromUrl(url = '') {
  try {
    return new URL(url).pathname.split('/').pop() || 'installer';
  } catch {
    return 'installer';
  }
}

function sanitize(name = '') {
  return name.replace(/[^a-zA-Z0-9_.-]/g, '_').replace(/\.[^.]+$/, '');
}

function escHtml(str = '') {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function fetchWithTimeout(url, opts = {}, ms = 10_000) {
  const ctrl = new AbortController();
  const id   = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(id);
  }
}
