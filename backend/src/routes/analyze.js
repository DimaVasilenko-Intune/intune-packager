'use strict';

const { Router } = require('express');
const crawler  = require('../services/crawler');
const analyzer = require('../services/analyzer');

const router = Router();

/**
 * POST /api/analyze
 * Body: { url, filename, type, pageUrl }
 * Headers:
 *   x-ai-provider    - 'claude' | 'openai' | 'gemini' | 'mistral' | 'none'
 *   x-ai-model       - model identifier
 *   x-ai-key         - API key (authType=apikey)
 *   x-ai-oauth       - OAuth access token (authType=oauth)
 *   x-analyze-mode   - 'ai-first' | 'regex-only'
 */
router.post('/', async (req, res, next) => {
  try {
    const { url, filename, type, pageUrl } = req.body;

    if (!url && !pageUrl) {
      return res.status(400).json({ error: 'url or pageUrl is required' });
    }

    const aiProvider  = req.headers['x-ai-provider']  || 'none';
    const aiModel     = req.headers['x-ai-model']     || '';
    const aiKey       = req.headers['x-ai-key']       || '';
    const oauthToken  = req.headers['x-ai-oauth']     || '';
    const analyzeMode = req.headers['x-analyze-mode'] || 'ai-first';

    const providerLabel = aiProvider !== 'none'
      ? `${aiProvider}/${aiModel || 'default'}`
      : 'regex-only';
    console.log(`[analyze] ${filename || 'unknown'} (${type}) from ${pageUrl || url} — ${providerLabel}`);

    // 1. Crawl the vendor page
    const startUrl = pageUrl || url;
    const { text, pagesCrawled } = await crawler.crawl(startUrl);

    console.log(`[analyze] crawled ${pagesCrawled} pages, ${text.length} chars`);

    // 2. Run analyzer
    const result = await analyzer.analyze({
      text,
      filename:   filename || '',
      type:       type     || 'unknown',
      url:        url      || pageUrl,
      aiProvider,
      aiModel,
      aiKey,
      oauthToken,
      mode: analyzeMode,
    });

    result.pagesCrawled = pagesCrawled;
    result.sourceUrl    = url || pageUrl;

    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
