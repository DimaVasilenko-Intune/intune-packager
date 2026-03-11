'use strict';

const { Router } = require('express');
const router = Router();

// Read the AI provider config from process env or stored value.
// The extension passes X-AI-Provider + X-AI-Key headers when checking health.
router.get('/', (req, res) => {
  const aiProvider = req.headers['x-ai-provider'] || 'none';

  res.json({
    status:     'ok',
    version:    '1.0.0',
    aiProvider: aiProvider === 'none' ? 'none' : aiProvider,
    timestamp:  new Date().toISOString(),
  });
});

module.exports = router;
