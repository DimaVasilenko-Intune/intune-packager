'use strict';

const express = require('express');
const cors    = require('cors');
const morgan  = require('morgan');

const healthRoute     = require('./src/routes/health');
const analyzeRoute    = require('./src/routes/analyze');
const generateRoute   = require('./src/routes/generate-package');
const errorHandler    = require('./src/middleware/error-handler');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));

// ── Routes ──────────────────────────────────────────────────────────────────
app.use('/health',                healthRoute);
app.use('/api/analyze',           analyzeRoute);
app.use('/api/generate-package',  generateRoute);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: `Not found: ${req.method} ${req.path}` });
});

// Global error handler (must be last)
app.use(errorHandler);

// ── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n  Intune Packager backend`);
  console.log(`  → http://localhost:${PORT}/health\n`);
});
