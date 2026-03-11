'use strict';

const axios = require('axios');

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

/**
 * Analyze using Claude (Anthropic) API.
 */
async function analyzeWithClaude({ text, filename, type, apiKey }) {
  const userPrompt = buildUserPrompt(text, filename, type);

  const response = await axios.post(
    'https://api.anthropic.com/v1/messages',
    {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    },
    {
      headers: {
        'x-api-key':          apiKey,
        'anthropic-version':  '2023-06-01',
        'content-type':       'application/json',
      },
      timeout: 30_000,
    }
  );

  const raw = response.data.content?.[0]?.text || '';
  return parseJsonResponse(raw);
}

/**
 * Analyze using OpenAI API.
 */
async function analyzeWithOpenAI({ text, filename, type, apiKey }) {
  const userPrompt = buildUserPrompt(text, filename, type);

  const response = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 1024,
    },
    {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    }
  );

  const raw = response.data.choices?.[0]?.message?.content || '';
  return parseJsonResponse(raw);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildUserPrompt(text, filename, type) {
  const truncated = text.slice(0, 8000); // stay within token budget
  return [
    `Filnavn: ${filename}`,
    `Installer-type: ${type?.toUpperCase() || 'UKJENT'}`,
    ``,
    `Dokumentasjonstekst:`,
    `---`,
    truncated,
    `---`,
  ].join('\n');
}

function parseJsonResponse(raw) {
  // Strip markdown code fences if present
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
  } catch (err) {
    throw new Error(`AI returned invalid JSON: ${raw.slice(0, 200)}`);
  }
}

module.exports = { analyzeWithClaude, analyzeWithOpenAI };
