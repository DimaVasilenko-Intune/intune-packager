'use strict';

// ── State machine ─────────────────────────────────────────────────────────────
const STATES = { IDLE: 'idle', SCANNING: 'scanning', RESULTS: 'results', DETAIL: 'detail', ERROR: 'error' };

let currentState   = STATES.IDLE;
let scanResults    = [];
let detailItem     = null;
let abortRequested = false;
let backendUrl     = 'http://localhost:3001';
let aiProvider     = 'none';
let aiKey          = '';
let analyzeMode    = 'ai-first';

// ── DOM helpers ───────────────────────────────────────────────────────────────
const VALID_TYPES = ['msi', 'msix', 'exe', 'appx', 'unknown'];
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

  // Wire events
  $('settings-btn').onclick = () => chrome.runtime.openOptionsPage();
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
  // Load non-sensitive settings from sync, API key from local
  const syncData  = await chrome.storage.sync.get(['backendUrl', 'aiProvider', 'analyzeMode']);
  const localData = await chrome.storage.local.get(['aiKey']);
  backendUrl  = syncData.backendUrl  || 'http://localhost:3001';
  aiProvider  = syncData.aiProvider  || 'none';
  aiKey       = localData.aiKey      || '';
  analyzeMode = syncData.analyzeMode || 'ai-first';
}

// ── Backend health check ──────────────────────────────────────────────────────
async function checkBackend() {
  setStatus('checking', 'Sjekker...');
  try {
    const res  = await fetchWithTimeout(`${backendUrl}/health`, {
      headers: { 'x-ai-provider': aiProvider },
    }, 4000);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.status === 'ok') {
      const label = aiProvider !== 'none' ? `AI (${aiProvider})` : 'Tilkoblet';
      setStatus('connected', label);
    } else {
      setStatus('disconnected', 'Feil');
    }
  } catch {
    setStatus('disconnected', 'Frakoblet');
  }
}

function setStatus(type, text) {
  const dot  = $('status-dot');
  const label = $('status-text');
  dot.className  = `status-dot ${type}`;
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
    // Step 1: scan the active tab via content script
    activateStep(1, 'Leter etter installere...');
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    let detected = [];
    try {
      detected = await chrome.tabs.sendMessage(tab.id, { action: 'DETECT_INSTALLERS' });
    } catch {
      // Content script may not be injected yet — try to inject
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/detector.js'] });
      detected = await chrome.tabs.sendMessage(tab.id, { action: 'DETECT_INSTALLERS' });
    }

    if (abortRequested) return;

    completeStep(1, `${detected.length} fil(er) funnet`);

    if (!detected.length) {
      // Still analyze the page URL even with no download links detected
      detected = [{ url: tab.url, filename: extractFilenameFromUrl(tab.url), type: 'unknown' }];
    }

    // Step 2: crawl + analyze each installer
    activateStep(2, `Crawling ${new URL(tab.url).hostname}...`);
    completeStep(2, 'Crawling fullført');

    activateStep(3, `Analyserer ${detected.length} installer(e)...`);

    const results = [];
    for (const item of detected.slice(0, 5)) { // max 5 installers per scan
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
      filename: extractFilenameFromUrl(tab.url) || 'Ukjent installer',
      type: 'unknown',
      install: '',
      uninstall: '',
      detection: '',
      confidence: 0,
      aiUsed: false,
      error: 'Ingen installasjonsdetaljer funnet',
    }];

    // Cache in session storage
    try { await chrome.storage.session.set({ intuneResults: scanResults }); } catch {}

    renderResults(scanResults);
    setState(STATES.RESULTS);

  } catch (err) {
    console.error('[popup] scan error:', err);
    showError(err.message || 'Scan mislyktes. Sjekk at backend kjører.');
  }
}

// ── Analyze a single installer ────────────────────────────────────────────────
async function analyzeInstaller(item, pageUrl) {
  const body = {
    url:     item.url,
    filename: item.filename,
    type:     item.type,
    pageUrl,
  };

  const headers = {
    'Content-Type':   'application/json',
    'x-ai-provider':  aiProvider,
    'x-analyze-mode': analyzeMode,
  };
  if (aiKey) headers['x-ai-key'] = aiKey;

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
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    const p1 = document.createElement('p');
    p1.textContent = 'Ingen installere funnet';
    const p2 = document.createElement('p');
    p2.textContent = 'Prøv en nedlastingsside.';
    empty.appendChild(p1);
    empty.appendChild(p2);
    list.appendChild(empty);
    return;
  }

  items.forEach((item, idx) => {
    const card = document.createElement('div');
    card.className = 'installer-card';

    const typeBadge = document.createElement('div');
    const typeVal = VALID_TYPES.includes((item.type || '').toLowerCase()) ? item.type.toLowerCase() : 'exe';
    typeBadge.className = `card-type-badge ${typeVal}`;
    typeBadge.textContent = typeVal.toUpperCase();

    const body = document.createElement('div');
    body.className = 'card-body';
    const fnDiv = document.createElement('div');
    fnDiv.className = 'card-filename';
    fnDiv.textContent = item.filename || 'Ukjent';
    const metaDiv = document.createElement('div');
    metaDiv.className = 'card-meta';
    metaDiv.textContent = [item.version ? `v${item.version}` : '', item.size || '', 'Funnet på siden'].filter(Boolean).join(' · ');
    body.appendChild(fnDiv);
    body.appendChild(metaDiv);

    const conf = document.createElement('div');
    conf.className = `card-confidence ${confidenceClass(item.confidence)}`;
    conf.textContent = confidenceLabel(item.confidence);

    card.appendChild(typeBadge);
    card.appendChild(body);
    card.appendChild(conf);
    card.onclick = () => showDetail(idx);
    list.appendChild(card);
  });
}

// ── Detail view ───────────────────────────────────────────────────────────────
function showDetail(idx) {
  detailItem = scanResults[idx];
  const d = detailItem;

  // Badges
  const badges = $('detail-badges');
  badges.textContent = '';
  const typeVal2 = VALID_TYPES.includes((d.type||'').toLowerCase()) ? d.type.toLowerCase() : 'exe';
  const typeBadge = document.createElement('span');
  typeBadge.className = `badge badge-${typeVal2}`;
  typeBadge.textContent = typeVal2.toUpperCase();
  const confBadge = document.createElement('span');
  confBadge.className = `badge badge-${confidenceClass(d.confidence)}`;
  confBadge.textContent = confidenceLabel(d.confidence);
  badges.appendChild(typeBadge);
  badges.appendChild(confBadge);

  $('detail-filename').textContent = d.filename || 'Ukjent installer';
  $('detail-meta').textContent = [
    d.version ? `v${d.version}` : null,
    d.size    ? d.size          : null,
    d.guid    ? `GUID: ${d.guid}` : null,
  ].filter(Boolean).join(' · ');

  // Confidence bar
  const pct = d.confidence || 0;
  $('confidence-pct').textContent  = `${pct}%`;
  $('confidence-fill').style.width = `${pct}%`;
  $('confidence-fill').style.background = pct >= 70 ? '#22c55e' : pct >= 40 ? '#f59e0b' : '#ef4444';

  // AI badge
  const aiBadge = $('ai-badge');
  if (d.aiUsed) { aiBadge.classList.remove('hidden'); }
  else          { aiBadge.classList.add('hidden');    }

  // Commands
  $('install-cmd').textContent   = d.install    || '(ikke tilgjengelig)';
  $('uninstall-cmd').textContent = d.uninstall  || '(ikke tilgjengelig)';
  $('detection-rule').textContent = d.detection || '(ikke tilgjengelig)';

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
  // Mark previous as done
  if (n > 1) doneStep(n - 1);
  const el = $(`step-${n}`);
  el.classList.add('active');
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
    const pathname = new URL(url).pathname;
    return pathname.split('/').pop() || 'installer';
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
