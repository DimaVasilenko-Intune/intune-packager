'use strict';

const axios = require('axios');

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

async function analyze({ model, apiKey, oauthToken, text, filename, type, systemPrompt, buildUserPrompt, parseJsonResponse }) {
  const userContent = buildUserPrompt(text, filename, type);

  // Build request body — Gemini uses a different structure
  const body = {
    contents: [
      { role: 'user', parts: [{ text: `${systemPrompt}\n\n${userContent}` }] },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      maxOutputTokens: 1024,
    },
  };

  let url;
  const headers = { 'Content-Type': 'application/json' };

  if (oauthToken) {
    // OAuth flow — no API key in URL
    url = `${GEMINI_BASE}/models/${model}:generateContent`;
    headers['Authorization'] = `Bearer ${oauthToken}`;
  } else {
    // API key flow
    url = `${GEMINI_BASE}/models/${model}:generateContent?key=${apiKey}`;
  }

  const response = await axios.post(url, body, { headers, timeout: 30_000 });

  const raw = response.data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return parseJsonResponse(raw);
}

module.exports = { analyze };
