'use strict';

const axios = require('axios');
const { validateUrl } = require('./url-validator');

const DEFAULT_TIMEOUT  = 10_000;   // 10 s
const MAX_RETRIES      = 2;
const RETRY_DELAY_MS   = 800;
const RATE_LIMIT_MS    = 400;      // min ms between requests

/**
 * Create a per-crawl rate limiter to avoid cross-request contention.
 */
function createRateLimiter() {
  let lastRequestTime = 0;
  return async function waitForSlot() {
    const now    = Date.now();
    const waited = now - lastRequestTime;
    if (waited < RATE_LIMIT_MS) {
      await sleep(RATE_LIMIT_MS - waited);
    }
    lastRequestTime = Date.now();
  };
}

/**
 * Rate-limited, retry-capable HTTP fetcher with SSRF protection.
 * Returns { url, html, finalUrl } or null on failure.
 */
async function fetch(url, retries = 0, rateLimiter = null) {
  // SSRF protection: validate URL before fetching
  await validateUrl(url);

  // Rate limiting (per-crawl instance)
  if (rateLimiter) await rateLimiter();

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
      return fetch(url, retries + 1, rateLimiter);
    }
    console.warn(`[fetcher] Failed: ${url} — ${err.message}`);
    return null;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { fetch, createRateLimiter };
