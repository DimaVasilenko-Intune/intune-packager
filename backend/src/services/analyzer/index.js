'use strict';

const regexAnalyzer = require('./regex-analyzer');
const providers     = require('../ai-providers');

/**
 * Main analyzer orchestrator.
 *
 * @param {object} opts
 * @param {string} opts.text
 * @param {string} opts.filename
 * @param {string} opts.type
 * @param {string} opts.url
 * @param {string} opts.aiProvider   - 'none' | 'claude' | 'openai' | 'gemini' | 'mistral'
 * @param {string} opts.aiModel      - model identifier (e.g. 'claude-sonnet-4-6')
 * @param {string} opts.aiKey        - API key (if authType=apikey)
 * @param {string} opts.oauthToken   - OAuth access token (if authType=oauth)
 * @param {string} opts.mode         - 'ai-first' | 'regex-only'
 */
async function analyze({ text, filename, type, url, aiProvider, aiModel, aiKey, oauthToken, mode }) {
  const useAI = mode !== 'regex-only' && aiProvider && aiProvider !== 'none' && (aiKey || oauthToken);

  // Always run regex (fast, no cost)
  const regexResult = regexAnalyzer.analyze({ text, filename, type, url });

  if (!useAI) {
    return regexResult;
  }

  // Try AI — fall back to regex on error
  try {
    const aiResult = await providers.analyze({
      provider:    aiProvider,
      model:       aiModel,
      apiKey:      aiKey,
      oauthToken,
      text,
      filename,
      type,
    });

    return {
      ...regexResult,
      install:    aiResult.install    || regexResult.install,
      uninstall:  aiResult.uninstall  || regexResult.uninstall,
      detection:  aiResult.detection  || regexResult.detection,
      confidence: Math.max(aiResult.confidence, regexResult.confidence),
      aiUsed:     true,
      aiProvider,
      aiModel,
      aiNotes:    aiResult.notes || '',
    };
  } catch (err) {
    console.warn(`[analyzer] AI feilet (${aiProvider}/${aiModel}), faller tilbake til regex: ${err.message}`);
    return regexResult;
  }
}

module.exports = { analyze };
