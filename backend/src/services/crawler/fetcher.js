'use strict';

const axios = require('axios');

const DEFAULT_TIMEOUT  = 10_000;   // 10 s
const MAX_RETRIES      = 2;
const RETRY_DELAY_MS   = 800;
const RATE_LIMIT_MS    = 400;      // min ms between requests

let lastRequestTime = 0;

/**
 * Rate-limited, retry-capable HTTP fetcher.
 * Returns { url, html, finalUrl } or null on failure.
 */
async function fetch(url, retries = 0) {
  // Rate limiting
  const now    = Date.now();
  const waited = now - lastRequestTime;
  if (waited < RATE_LIMIT_MS) {
    await sleep(RATE_LIMIT_MS - waited);
  }
  lastRequestTime = Date.now();

  try {
    const response = await axios.get(url, {
      timeout: DEFAULT_TIMEOUT,
      maxRedirects: 5,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; IntunePkgBot/1.0)',
        'Accept': 'text/html,application/xhtml+xml,*/*',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      responseType: 'text',
      validateStatus: s => s < 400,
    });

    return {
      url,
      html:     response.data,
      finalUrl: response.request?.res?.responseUrl || url,
    };
  } catch (err) {
    if (retries < MAX_RETRIES) {
      console.warn(`[fetcher] Retry ${retries + 1} for ${url}: ${err.message}`);
      await sleep(RETRY_DELAY_MS * (retries + 1));
      return fetch(url, retries + 1);
    }
    console.warn(`[fetcher] Failed: ${url} — ${err.message}`);
    return null;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { fetch };
