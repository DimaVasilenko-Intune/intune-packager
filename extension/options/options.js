'use strict';

document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await updateAbout();
  wireEvents();
});

// ── Load settings from chrome.storage.sync ────────────────────────────────────
async function loadSettings() {
  const data = await chrome.storage.sync.get([
    'backendUrl', 'aiProvider', 'aiKey', 'analyzeMode',
  ]);

  document.getElementById('backend-url').value = data.backendUrl || 'http://localhost:3001';

  const provider = data.aiProvider || 'none';
  document.querySelector(`input[name="ai-provider"][value="${provider}"]`).checked = true;

  if (data.aiKey) document.getElementById('api-key').value = data.aiKey;

  const mode = data.analyzeMode || 'ai-first';
  document.querySelector(`input[name="analyze-mode"][value="${mode}"]`).checked = true;

  toggleApiKeyField(provider);
  updateAboutAI(provider);
}

// ── Save settings ─────────────────────────────────────────────────────────────
async function saveSettings() {
  const backendUrl  = document.getElementById('backend-url').value.trim().replace(/\/$/, '');
  const aiProvider  = document.querySelector('input[name="ai-provider"]:checked')?.value || 'none';
  const aiKey       = document.getElementById('api-key').value.trim();
  const analyzeMode = document.querySelector('input[name="analyze-mode"]:checked')?.value || 'ai-first';

  await chrome.storage.sync.set({ backendUrl, aiProvider, aiKey, analyzeMode });

  const status = document.getElementById('save-status');
  status.classList.remove('hidden');
  setTimeout(() => status.classList.add('hidden'), 2000);

  updateAboutAI(aiProvider);
}

// ── Test backend connection ───────────────────────────────────────────────────
async function testBackend() {
  const url    = document.getElementById('backend-url').value.trim().replace(/\/$/, '');
  const msgEl  = document.getElementById('backend-status');
  const btn    = document.getElementById('test-backend');

  btn.disabled = true;
  btn.textContent = 'Tester...';
  msgEl.className = 'status-msg hidden';

  try {
    const res  = await fetchTimeout(`${url}/health`, {}, 5000);
    const data = await res.json();
    if (data.status === 'ok') {
      showMsg(msgEl, 'success', `✓ Tilkoblet — backend v${data.version || '?'}, AI: ${data.aiProvider || 'none'}`);
    } else {
      showMsg(msgEl, 'error', `Backend svarte med feil status`);
    }
  } catch (err) {
    showMsg(msgEl, 'error', `Tilkobling feilet: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Test';
  }
}

// ── Update About section ──────────────────────────────────────────────────────
async function updateAbout() {
  const data = await chrome.storage.sync.get(['backendUrl']);
  document.getElementById('about-backend').textContent = data.backendUrl || 'http://localhost:3001';
}

function updateAboutAI(provider) {
  const labels = { none: 'Ingen (kun regex)', claude: 'Claude (Haiku)', openai: 'OpenAI (GPT-4o mini)' };
  document.getElementById('about-ai').textContent = labels[provider] || provider;
}

// ── UI helpers ────────────────────────────────────────────────────────────────
function toggleApiKeyField(provider) {
  const field = document.getElementById('api-key-field');
  field.style.display = provider !== 'none' ? 'flex' : 'none';
}

function wireEvents() {
  document.getElementById('save-btn').onclick    = saveSettings;
  document.getElementById('test-backend').onclick = testBackend;

  document.getElementById('toggle-key').onclick = () => {
    const inp = document.getElementById('api-key');
    const btn = document.getElementById('toggle-key');
    inp.type = inp.type === 'password' ? 'text' : 'password';
    btn.textContent = inp.type === 'password' ? '👁' : '🙈';
  };

  document.querySelectorAll('input[name="ai-provider"]').forEach(radio => {
    radio.addEventListener('change', () => {
      toggleApiKeyField(radio.value);
      updateAboutAI(radio.value);
    });
  });
}

function showMsg(el, type, text) {
  el.className    = `status-msg ${type}`;
  el.textContent  = text;
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
