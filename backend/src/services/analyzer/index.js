'use strict';

const regexAnalyzer = require('./regex-analyzer');
const aiAnalyzer    = require('./ai-analyzer');

/**
 * Main analyzer orchestrator.
 * Chooses AI or regex based on settings, merges results.
 *
 * @param {object} opts
 * @param {string} opts.text
 * @param {string} opts.filename
 * @param {string} opts.type
 * @param {string} opts.url
 * @param {string} opts.aiProvider   - 'none' | 'claude' | 'openai'
 * @param {string} opts.aiKey
 * @param {string} opts.mode         - 'ai-first' | 'regex-only'
 * @returns {Promise<AnalysisResult>}
 */
async function analyze({ text, filename, type, url, aiProvider, aiKey, mode }) {
  const useAI = mode !== 'regex-only' && aiProvider !== 'none' && aiKey;

  // Always run regex (fast, no cost)
  const regexResult = regexAnalyzer.analyze({ text, filename, type, url });

  if (!useAI) {
    return regexResult;
  }

  // Try AI — fall back to regex on error
  try {
    const aiResult = await runAI({ text, filename, type, aiProvider, apiKey: aiKey });

    // Merge: AI wins for commands, regex wins for metadata
    return {
      ...regexResult,
      install:    aiResult.install    || regexResult.install,
      uninstall:  aiResult.uninstall  || regexResult.uninstall,
      detection:  aiResult.detection  || regexResult.detection,
      confidence: Math.max(aiResult.confidence, regexResult.confidence),
      aiUsed:     true,
      aiNotes:    aiResult.notes || '',
    };
  } catch (err) {
    console.warn(`[analyzer] AI failed, falling back to regex: ${err.message}`);
    return regexResult;
  }
}

async function runAI({ text, filename, type, aiProvider, apiKey }) {
  if (aiProvider === 'claude') {
    return aiAnalyzer.analyzeWithClaude({ text, filename, type, apiKey });
  }
  if (aiProvider === 'openai') {
    return aiAnalyzer.analyzeWithOpenAI({ text, filename, type, apiKey });
  }
  throw new Error(`Unknown AI provider: ${aiProvider}`);
}

module.exports = { analyze };
