'use strict';

const anthropic = require('./anthropic');
const openai    = require('./openai');
const gemini    = require('./gemini');
const mistral   = require('./mistral');

const SYSTEM_PROMPT = `You are an Intune packaging expert. Analyze the documentation text and extract:
1. Silent install command (complete, ready to use)
2. Silent uninstall command (complete, ready to use)
3. Detection rule as PowerShell snippet (exit 0 = found, exit 1 = not found)

Guidelines:
- For MSI: use msiexec.exe /i "{{filename}}" /quiet /norestart
- For EXE: find the correct silent switches from the text
- For detection: prefer GUID/ProductCode → registry path → file path
- ALWAYS return valid JSON, no markdown

Respond only with this JSON schema:
{
  "install": "...",
  "uninstall": "...",
  "detection": "...",
  "confidence": <int 0-100>,
  "notes": "brief explanation"
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
  if (!adapterKey) throw new Error(`Unknown AI provider: ${provider}`);

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
    `Filename: ${filename}`,
    `Installer type: ${type?.toUpperCase() || 'UNKNOWN'}`,
    '',
    'Documentation text:',
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
    throw new Error(`AI returned invalid JSON: ${raw.slice(0, 200)}`);
  }
}

module.exports = { analyze };
