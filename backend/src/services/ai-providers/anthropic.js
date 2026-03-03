'use strict';

const axios = require('axios');

async function analyze({ model, apiKey, text, filename, type, systemPrompt, buildUserPrompt, parseJsonResponse }) {
  const response = await axios.post(
    'https://api.anthropic.com/v1/messages',
    {
      model,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: buildUserPrompt(text, filename, type) }],
    },
    {
      headers: {
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      timeout: 30_000,
    }
  );

  const raw = response.data.content?.[0]?.text || '';
  return parseJsonResponse(raw);
}

module.exports = { analyze };
