'use strict';

const { Router } = require('express');
const { z }     = require('zod');
const packager  = require('../services/packager');

const router = Router();

const packageSchema = z.object({
  filename:   z.string().min(1).max(255),
  type:       z.enum(['msi', 'exe', 'msix', 'appx', 'unknown']).optional(),
  version:    z.string().max(50).optional(),
  install:    z.string().max(2000).optional(),
  uninstall:  z.string().max(2000).optional(),
  detection:  z.string().max(4000).optional(),
  sourceUrl:  z.string().max(2048).optional(),
  aiUsed:     z.boolean().optional(),
  confidence: z.number().min(0).max(100).optional(),
  guid:       z.string().max(80).nullable().optional(),
}).passthrough();

/**
 * POST /api/generate-package
 * Body: AnalysisResult (from /api/analyze)
 * Returns: ZIP binary stream (application/zip)
 */
router.post('/', async (req, res, next) => {
  try {
    const parsed = packageSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0].message });
    }
    const analysisResult = parsed.data;

    console.log(`[package] Generating ZIP for ${analysisResult.filename}`);

    const zipStream = await packager.generatePackage(analysisResult);

    const safeName = (analysisResult.filename || 'installer')
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9_-]/g, '_');

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}_intune.zip"`);

    zipStream.on('error', err => next(err));
    zipStream.pipe(res);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
