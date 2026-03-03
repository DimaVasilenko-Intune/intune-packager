'use strict';

const { Router } = require('express');
const packager = require('../services/packager');

const router = Router();

/**
 * POST /api/generate-package
 * Body: AnalysisResult (from /api/analyze)
 * Returns: ZIP binary stream (application/zip)
 */
router.post('/', async (req, res, next) => {
  try {
    const analysisResult = req.body;

    if (!analysisResult || !analysisResult.filename) {
      return res.status(400).json({ error: 'Valid analysis result required in body' });
    }

    console.log(`[package] Generating ZIP for ${analysisResult.filename}`);

    const zipStream = await packager.generatePackage(analysisResult);

    const safeName = (analysisResult.filename || 'installer')
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9_-]/g, '_');

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}_intune.zip"`);

    zipStream.pipe(res);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
