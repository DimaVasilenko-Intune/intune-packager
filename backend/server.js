'use strict';

const express    = require('express');
const cors       = require('cors');
const morgan     = require('morgan');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');
const compression = require('compression');

const healthRoute     = require('./src/routes/health');
const analyzeRoute    = require('./src/routes/analyze');
const generateRoute   = require('./src/routes/generate-package');
const errorHandler    = require('./src/middleware/error-handler');

const app  = express();
const PORT = process.env.PORT || 3001;
const isProd = process.env.NODE_ENV === 'production';

// ── Security middleware ────────────────────────────────────────────────────
app.use(helmet());
app.use(compression());

// CORS — restrict in production
const ALLOWED_ORIGINS = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
  : null; // null = allow all in dev
app.use(cors(ALLOWED_ORIGINS ? { origin: ALLOWED_ORIGINS } : {}));

// Rate limiting
app.use('/api/', rateLimit({
  windowMs: 60_000,
  max: isProd ? 30 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
}));

app.use(express.json({ limit: '2mb' }));
app.use(morgan(isProd ? 'combined' : 'dev'));

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
const server = app.listen(PORT, () => {
  console.log(`\n  Intune Packager backend (${isProd ? 'production' : 'development'})`);
  console.log(`  → http://localhost:${PORT}/health\n`);
});

// ── Graceful shutdown ────────────────────────────────────────────────────────
function shutdown(signal) {
  console.log(`\n  ${signal} received — shutting down gracefully…`);
  server.close(() => {
    console.log('  Server closed.');
    process.exit(0);
  });
  // Force exit after 10 s if connections don't close
  setTimeout(() => { process.exit(1); }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
