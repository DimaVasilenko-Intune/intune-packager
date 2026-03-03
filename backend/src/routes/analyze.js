'use strict';

const { Router } = require('express');
const crawler  = require('../services/crawler');
const analyzer = require('../services/analyzer');

const router = Router();

/**
 * POST /api/analyze
 * Body: { url, filename, type, pageUrl }
 * Headers (optional): x-ai-provider, x-ai-key, x-analyze-mode
 * Returns: AnalysisResult
 */
router.post('/', async (req, res, next) => {
  try {
    const { url, filename, type, pageUrl } = req.body;

    if (!url && !pageUrl) {
      return res.status(400).json({ error: 'url or pageUrl is required' });
    }

    const aiProvider   = req.headers['x-ai-provider'] || 'none';
    const aiKey        = req.headers['x-ai-key']      || '';
    const analyzeMode  = req.headers['x-analyze-mode']|| 'ai-first';

    console.log(`[analyze] ${filename || 'unknown'} (${type}) from ${pageUrl || url}`);

    // 1. Crawl the vendor page
    const startUrl = pageUrl || url;
    const { text, pagesCrawled } = await crawler.crawl(startUrl);

    console.log(`[analyze] crawled ${pagesCrawled} pages, ${text.length} chars`);

    // 2. Run analyzer
    const result = await analyzer.analyze({
      text,
      filename: filename || '',
      type:     type     || 'unknown',
      url:      url      || pageUrl,
      aiProvider,
      aiKey,
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
