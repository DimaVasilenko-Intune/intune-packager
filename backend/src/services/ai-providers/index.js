'use strict';

const anthropic = require('./anthropic');
const openai    = require('./openai');
const gemini    = require('./gemini');
const mistral   = require('./mistral');

const SYSTEM_PROMPT = `Du er en Intune-pakking-ekspert. Analyser dokumentasjonsteksten og ekstraher:
1. Silent install-kommando (komplett, klar til bruk)
2. Silent uninstall-kommando (komplett, klar til bruk)
3. Detection rule som PowerShell-snippet (exit 0 = funnet, exit 1 = ikke funnet)

Retningslinjer:
- For MSI: bruk msiexec.exe /i "{{filename}}" /quiet /norestart
- For EXE: finn riktige silent switches fra teksten
- For detection: foretrekk GUID/ProductCode → registry-sti → fil-sti
- Returner ALLTID gyldig JSON, ingen markdown

Svar kun med dette JSON-skjemaet:
{
  "install": "...",
  "uninstall": "...",
  "detection": "...",
  "confidence": <int 0-100>,
  "notes": "kort forklaring på norsk"
}`;

const registry = { anthropic, openai, gemini, mistral };

// Provider name → adapter key mapping
const PROVIDER_MAP = {
  claude:  'anthropic',
  openai:  'openai',
  gemini:  'gemini',
  mistral: 'mistral',
};

/**
 * Analyze using the specified provider.
 *
 * @param {object} opts
 * @param {string} opts.provider     - 'claude' | 'openai' | 'gemini' | 'mistral'
 * @param {string} opts.model
 * @param {string} opts.apiKey
 * @param {string} opts.oauthToken
 * @param {string} opts.text
 * @param {string} opts.filename
 * @param {string} opts.type
 */
async function analyze({ provider, model, apiKey, oauthToken, text, filename, type }) {
  const adapterKey = PROVIDER_MAP[provider];
  if (!adapterKey) throw new Error(`Ukjent AI-leverandør: ${provider}`);

  const adapter = registry[adapterKey];

  return adapter.analyze({
    model,
    apiKey,
    oauthToken,
    text,
    filename,
    type,
    systemPrompt: SYSTEM_PROMPT,
    buildUserPrompt,
    parseJsonResponse,
  });
}

// ── Shared helpers passed to all adapters ────────────────────────────────────

function buildUserPrompt(text, filename, type) {
  const truncated = text.slice(0, 8000);
  return [
    `Filnavn: ${filename}`,
    `Installer-type: ${type?.toUpperCase() || 'UKJENT'}`,
    '',
    'Dokumentasjonstekst:',
    '---',
    truncated,
    '---',
  ].join('\n');
}

function parseJsonResponse(raw) {
  const cleaned = raw
    .replace(/```json\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    return {
      install:    String(parsed.install    || ''),
      uninstall:  String(parsed.uninstall  || ''),
      detection:  String(parsed.detection  || ''),
      confidence: Math.min(100, Math.max(0, Number(parsed.confidence) || 50)),
      notes:      String(parsed.notes      || ''),
    };
  } catch {
    throw new Error(`AI returnerte ugyldig JSON: ${raw.slice(0, 200)}`);
  }
}

module.exports = { analyze };
