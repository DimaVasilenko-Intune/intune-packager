'use strict';

// ── Default provider config ───────────────────────────────────────────────────
const PROVIDER_DEFAULTS = {
  claude:  { enabled: true,  authType: 'apikey', apiKey: '',        model: 'claude-sonnet-4-6' },
  openai:  { enabled: false, authType: 'apikey', apiKey: '',        oauthToken: '', oauthExpiry: 0, oauthClientId: '', model: 'gpt-4o' },
  gemini:  { enabled: false, authType: 'oauth',  apiKey: '',        oauthToken: '', oauthExpiry: 0, oauthClientId: '', model: 'gemini-2.0-flash' },
  mistral: { enabled: false, authType: 'apikey', apiKey: '',        model: 'mistral-large-latest' },
};

const OAUTH_SCOPES = {
  gemini: 'https://www.googleapis.com/auth/generative-language',
  openai: 'model.read model.request',
};

const OAUTH_URLS = {
  gemini: 'https://accounts.google.com/o/oauth2/auth',
  openai: 'https://auth.openai.com/authorize',
};

let providers = {};

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  wireEvents();
  await updateAbout();
});

// ── Load ──────────────────────────────────────────────────────────────────────
async function loadSettings() {
  const data = await chrome.storage.sync.get(['backendUrl', 'analyzeMode', 'activeProvider', 'providers']);

  document.getElementById('backend-url').value = data.backendUrl || 'http://localhost:3001';

  // Merge saved providers with defaults
  const saved = data.providers || {};
  providers = {};
  for (const [name, def] of Object.entries(PROVIDER_DEFAULTS)) {
    providers[name] = { ...def, ...(saved[name] || {}) };
  }

  // Active provider
  const activeProvider = data.activeProvider || 'claude';
  document.getElementById('active-provider').value = activeProvider;

  // Analyze mode
  const mode = data.analyzeMode || 'ai-first';
  const modeRadio = document.querySelector(`input[name="analyze-mode"][value="${mode}"]`);
  if (modeRadio) modeRadio.checked = true;

  // Populate each provider card
  for (const [name, cfg] of Object.entries(providers)) {
    populateCard(name, cfg);
  }

  updateCardHighlights(activeProvider);
}

function populateCard(name, cfg) {
  // Toggle
  const enableCb = document.querySelector(`.provider-enable[data-provider="${name}"]`);
  if (enableCb) {
    enableCb.checked = cfg.enabled;
    enableCb.closest('.provider-card').classList.toggle('enabled', cfg.enabled);
  }

  // Model
  const modelSel = document.querySelector(`.provider-model[data-provider="${name}"]`);
  if (modelSel && cfg.model) modelSel.value = cfg.model;

  // API key
  const keyInput = document.querySelector(`.provider-apikey[data-provider="${name}"]`);
  if (keyInput && cfg.apiKey) keyInput.value = cfg.apiKey;

  // Auth type radios (openai / gemini)
  const authRadio = document.querySelector(`input[name="${name}-auth"][value="${cfg.authType}"]`);
  if (authRadio) {
    authRadio.checked = true;
    updateAuthSections(name, cfg.authType);
  }

  // OAuth client ID
  const clientIdInput = document.getElementById(`${name}-client-id`);
  if (clientIdInput && cfg.oauthClientId) clientIdInput.value = cfg.oauthClientId;

  // OAuth status badge
  updateOAuthStatus(name, cfg);
}

// ── Save ──────────────────────────────────────────────────────────────────────
async function saveSettings() {
  const backendUrl     = document.getElementById('backend-url').value.trim().replace(/\/$/, '');
  const activeProvider = document.getElementById('active-provider').value;
  const analyzeMode    = document.querySelector('input[name="analyze-mode"]:checked')?.value || 'ai-first';

  // Collect per-provider config from UI
  for (const name of Object.keys(providers)) {
    const enableCb  = document.querySelector(`.provider-enable[data-provider="${name}"]`);
    const modelSel  = document.querySelector(`.provider-model[data-provider="${name}"]`);
    const keyInput  = document.querySelector(`.provider-apikey[data-provider="${name}"]`);
    const authRadio = document.querySelector(`input[name="${name}-auth"]:checked`);
    const clientEl  = document.getElementById(`${name}-client-id`);

    if (enableCb)  providers[name].enabled  = enableCb.checked;
    if (modelSel)  providers[name].model    = modelSel.value;
    if (keyInput)  providers[name].apiKey   = keyInput.value.trim();
    if (authRadio) providers[name].authType = authRadio.value;
    if (clientEl)  providers[name].oauthClientId = clientEl.value.trim();
    // oauthToken / oauthExpiry are already kept in providers[name] from OAuth flows
  }

  await chrome.storage.sync.set({ backendUrl, activeProvider, analyzeMode, providers });

  updateCardHighlights(activeProvider);
  updateAboutAI(activeProvider);

  const status = document.getElementById('save-status');
  status.classList.remove('hidden');
  setTimeout(() => status.classList.add('hidden'), 2000);
}

// ── Test backend ──────────────────────────────────────────────────────────────
async function testBackend() {
  const url   = document.getElementById('backend-url').value.trim().replace(/\/$/, '');
  const msgEl = document.getElementById('backend-status');
  const btn   = document.getElementById('test-backend');

  btn.disabled    = true;
  btn.textContent = 'Tester...';
  msgEl.className = 'status-msg hidden';

  try {
    const res  = await fetchTimeout(`${url}/health`, {}, 5000);
    const data = await res.json();
    if (data.status === 'ok') {
      showMsg(msgEl, 'success', `✓ Tilkoblet — v${data.version || '?'}`);
    } else {
      showMsg(msgEl, 'error', 'Backend svarte med feil status');
    }
  } catch (err) {
    showMsg(msgEl, 'error', `Tilkobling feilet: ${err.message}`);
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Test';
  }
}

// ── Test single provider ──────────────────────────────────────────────────────
async function testProvider(providerName) {
  const backendUrl = document.getElementById('backend-url').value.trim().replace(/\/$/, '');
  const card  = document.querySelector(`.provider-card[data-provider="${providerName}"]`);
  const msgEl = card.querySelector('.provider-status');
  const btn   = card.querySelector(`.test-provider[data-provider="${providerName}"]`);

  const keyInput  = card.querySelector(`.provider-apikey[data-provider="${providerName}"]`);
  const modelSel  = card.querySelector(`.provider-model[data-provider="${providerName}"]`);
  const authRadio = card.querySelector(`input[name="${providerName}-auth"]:checked`);

  const apiKey     = keyInput?.value.trim() || providers[providerName]?.apiKey || '';
  const model      = modelSel?.value        || providers[providerName]?.model  || '';
  const authType   = authRadio?.value       || providers[providerName]?.authType || 'apikey';
  const oauthToken = providers[providerName]?.oauthToken || '';

  if (authType === 'apikey' && !apiKey) {
    showProviderStatus(msgEl, 'error', 'Ingen API-nøkkel angitt');
    return;
  }
  if (authType === 'oauth' && !oauthToken) {
    showProviderStatus(msgEl, 'error', 'Ikke tilkoblet via OAuth');
    return;
  }

  btn.disabled    = true;
  btn.textContent = '...';
  msgEl.className = 'provider-status hidden';

  try {
    const headers = {
      'Content-Type':   'application/json',
      'x-ai-provider':  providerName,
      'x-ai-model':     model,
      'x-analyze-mode': 'ai-first',
    };
    if (authType === 'apikey') headers['x-ai-key']   = apiKey;
    else                       headers['x-ai-oauth'] = oauthToken;

    const res = await fetchTimeout(`${backendUrl}/api/analyze`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        url:      'https://www.7-zip.org/download.html',
        filename: 'test.msi',
        type:     'msi',
        pageUrl:  'https://www.7-zip.org/download.html',
      }),
    }, 30_000);

    if (res.ok) {
      const data = await res.json();
      const label = data.aiUsed ? `✓ Tilkoblet (${model})` : '✓ Regex-modus (AI ikke aktivert)';
      showProviderStatus(msgEl, 'success', label);
    } else {
      const err = await res.json().catch(() => ({}));
      showProviderStatus(msgEl, 'error', err.error || `HTTP ${res.status}`);
    }
  } catch (err) {
    showProviderStatus(msgEl, 'error', err.message);
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Test';
  }
}

// ── OAuth flow ────────────────────────────────────────────────────────────────
async function startOAuth(providerName) {
  const clientIdEl = document.getElementById(`${providerName}-client-id`);
  const clientId   = clientIdEl?.value.trim() || providers[providerName]?.oauthClientId || '';

  if (!clientId) {
    alert(`Fyll inn Client ID for ${providerName} først.`);
    return;
  }

  const redirectUrl = chrome.identity.getRedirectURL('oauth');
  const scope       = OAUTH_SCOPES[providerName]  || '';
  const baseUrl     = OAUTH_URLS[providerName];

  if (!baseUrl) {
    alert(`OAuth ikke støttet for ${providerName}`);
    return;
  }

  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  redirectUrl,
    response_type: 'token',
    scope,
  });

  const authUrl = `${baseUrl}?${params.toString()}`;

  const statusEl = document.getElementById(`${providerName}-oauth-status`);
  if (statusEl) { statusEl.textContent = 'Venter...'; statusEl.className = 'oauth-status'; }

  try {
    const responseUrl = await chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true });
    const hash        = new URL(responseUrl).hash.slice(1);
    const urlParams   = new URLSearchParams(hash);

    const token     = urlParams.get('access_token');
    const expiresIn = Number(urlParams.get('expires_in') || 3600);

    if (!token) throw new Error('Ingen access_token i respons');

    providers[providerName].oauthToken   = token;
    providers[providerName].oauthExpiry  = Date.now() + expiresIn * 1000;
    providers[providerName].oauthClientId = clientId;

    // Persist immediately
    await chrome.storage.sync.set({ providers });

    updateOAuthStatus(providerName, providers[providerName]);
  } catch (err) {
    console.error(`[OAuth ${providerName}]`, err);
    if (statusEl) {
      statusEl.textContent = `Feil: ${err.message}`;
      statusEl.className   = 'oauth-status error';
    }
  }
}

// ── OAuth status badge ────────────────────────────────────────────────────────
function updateOAuthStatus(providerName, cfg) {
  const el = document.getElementById(`${providerName}-oauth-status`);
  if (!el) return;

  if (!cfg.oauthToken) {
    el.textContent = '';
    el.className   = 'oauth-status';
    return;
  }

  const expired = cfg.oauthExpiry && Date.now() > cfg.oauthExpiry;
  if (expired) {
    el.textContent = '⚠ Token utløpt — koble til igjen';
    el.className   = 'oauth-status expired';
  } else {
    const exp = cfg.oauthExpiry
      ? ` (utløper ${new Date(cfg.oauthExpiry).toLocaleTimeString('no-NO')})`
      : '';
    el.textContent = `✓ Tilkoblet${exp}`;
    el.className   = 'oauth-status connected';
  }
}

// ── Auth section visibility ───────────────────────────────────────────────────
function updateAuthSections(providerName, authType) {
  const apikeySection = document.getElementById(`${providerName}-apikey-section`);
  const oauthSection  = document.getElementById(`${providerName}-oauth-section`);
  if (apikeySection) apikeySection.classList.toggle('hidden', authType !== 'apikey');
  if (oauthSection)  oauthSection.classList.toggle('hidden',  authType !== 'oauth');
}

// ── Card highlight (active provider) ─────────────────────────────────────────
function updateCardHighlights(activeProvider) {
  document.querySelectorAll('.provider-card').forEach(card => {
    card.classList.toggle('active-provider', card.dataset.provider === activeProvider);
  });
}

// ── About section ─────────────────────────────────────────────────────────────
async function updateAbout() {
  const data = await chrome.storage.sync.get(['backendUrl', 'activeProvider']);
  document.getElementById('about-backend').textContent = data.backendUrl || 'http://localhost:3001';
  updateAboutAI(data.activeProvider || 'claude');
}

function updateAboutAI(activeProvider) {
  const labels = {
    claude:  'Claude (Anthropic)',
    openai:  'OpenAI (GPT)',
    gemini:  'Google Gemini',
    mistral: 'Mistral AI',
  };
  document.getElementById('about-ai').textContent = labels[activeProvider] || activeProvider;
}

// ── Wire events ───────────────────────────────────────────────────────────────
function wireEvents() {
  document.getElementById('save-btn').onclick     = saveSettings;
  document.getElementById('test-backend').onclick = testBackend;

  // Active provider change → highlight card
  document.getElementById('active-provider').addEventListener('change', e => {
    updateCardHighlights(e.target.value);
    updateAboutAI(e.target.value);
  });

  // Per-provider toggles
  document.querySelectorAll('.provider-enable').forEach(cb => {
    cb.addEventListener('change', () => {
      cb.closest('.provider-card').classList.toggle('enabled', cb.checked);
    });
  });

  // Auth type radios
  ['openai', 'gemini'].forEach(name => {
    document.querySelectorAll(`input[name="${name}-auth"]`).forEach(radio => {
      radio.addEventListener('change', () => updateAuthSections(name, radio.value));
    });
  });

  // Eye-toggle for API keys
  document.querySelectorAll('.toggle-key').forEach(btn => {
    btn.addEventListener('click', () => {
      const row = btn.closest('.key-row');
      const inp = row.querySelector('input[type="password"], input[type="text"]');
      if (!inp) return;
      inp.type     = inp.type === 'password' ? 'text' : 'password';
      btn.textContent = inp.type === 'password' ? '👁' : '🙈';
    });
  });

  // Test provider buttons
  document.querySelectorAll('.test-provider').forEach(btn => {
    btn.addEventListener('click', () => testProvider(btn.dataset.provider));
  });

  // OAuth connect buttons
  document.querySelectorAll('.oauth-connect').forEach(btn => {
    btn.addEventListener('click', () => startOAuth(btn.dataset.provider));
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function showMsg(el, type, text) {
  el.className   = `status-msg ${type}`;
  el.textContent = text;
}

function showProviderStatus(el, type, text) {
  el.className   = `provider-status ${type}`;
  el.textContent = text;
}

async function fetchTimeout(url, opts, ms) {
  const ctrl = new AbortController();
  const id   = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(id);
  }
}
