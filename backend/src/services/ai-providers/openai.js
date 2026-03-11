'use strict';

const axios = require('axios');

async function analyze({ model, apiKey, oauthToken, text, filename, type, systemPrompt, buildUserPrompt, parseJsonResponse }) {
  const token = oauthToken || apiKey;

  const response = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: buildUserPrompt(text, filename, type) },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 1024,
    },
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type':  'application/json',
      },
      timeout: 30_000,
    }
  );

  const raw = response.data.choices?.[0]?.message?.content || '';
  return parseJsonResponse(raw);
}

module.exports = { analyze };
