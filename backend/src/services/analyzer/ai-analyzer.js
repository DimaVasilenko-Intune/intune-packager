'use strict';

// Thin shim — delegates to the provider registry.
const providers = require('../ai-providers');

async function analyzeWithClaude({ text, filename, type, apiKey, model }) {
  return providers.analyze({ provider: 'claude', model: model || 'claude-haiku-4-5-20251001', apiKey, text, filename, type });
}

async function analyzeWithOpenAI({ text, filename, type, apiKey, model }) {
  return providers.analyze({ provider: 'openai', model: model || 'gpt-4o-mini', apiKey, text, filename, type });
}

module.exports = { analyzeWithClaude, analyzeWithOpenAI };
