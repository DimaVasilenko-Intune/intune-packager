'use strict';

const cheerio = require('cheerio');
const { URL }  = require('url');
const fetcher  = require('./fetcher');

const MAX_PAGES     = 10;
const MAX_TEXT_CHARS = 40_000;

// Paths / keywords that indicate installer documentation
const DOC_KEYWORDS = [
  'install', 'download', 'deploy', 'setup', 'release', 'silent',
  'uninstall', 'admin', 'enterprise', 'msi', 'group-policy', 'gpo',
  'command', 'switch', 'parameter', 'argument',
];

// Sections worth extracting from the HTML
const RELEVANT_SELECTORS = [
  'pre', 'code', 'blockquote',
  '[class*="install"]', '[class*="command"]', '[class*="deploy"]',
  '[class*="download"]', '[id*="install"]', '[id*="command"]',
  'table', '.note', '.info', '.tip', '.warning',
];

/**
 * BFS-crawl starting from startUrl.
 * Returns { text, pagesCrawled }
 */
async function crawl(startUrl) {
  const baseOrigin  = getOrigin(startUrl);
  const visited     = new Set();
  const queue       = [startUrl];
  const textParts   = [];
  let   totalChars  = 0;
  let   pagesCrawled = 0;
  const rateLimiter = fetcher.createRateLimiter();

  while (queue.length > 0 && pagesCrawled < MAX_PAGES) {
    const url = queue.shift();
    if (visited.has(url)) continue;
    visited.add(url);

    const result = await fetcher.fetch(url, 0, rateLimiter);
    if (!result) continue;

    pagesCrawled++;
    const { html, finalUrl } = result;

    // Track final URL in visited too
    if (finalUrl !== url) visited.add(finalUrl);

    const $ = cheerio.load(html);

    // Remove noise
    $('nav, footer, header, script, style, noscript, .cookie-banner, #cookie-notice').remove();

    // Extract relevant text
    const pageText = extractRelevantText($, url);
    if (pageText.trim()) {
      const chunk = `\n\n--- PAGE: ${url} ---\n${pageText}`;
      textParts.push(chunk);
      totalChars += chunk.length;
    }

    // Trim early if we have enough text
    if (totalChars > MAX_TEXT_CHARS) break;

    // Find more relevant links to crawl
    const links = extractDocLinks($, finalUrl, baseOrigin);
    for (const link of links) {
      if (!visited.has(link)) queue.push(link);
    }
  }

  return {
    text: textParts.join('').slice(0, MAX_TEXT_CHARS),
    pagesCrawled,
  };
}

function extractRelevantText($, pageUrl) {
  const parts = [];

  // Always grab title
  const title = $('title').text().trim();
  if (title) parts.push(`Title: ${title}`);

  // Priority: relevant selectors
  RELEVANT_SELECTORS.forEach(sel => {
    $(sel).each((_, el) => {
      const text = $(el).text().replace(/\s+/g, ' ').trim();
      if (text.length > 10 && text.length < 2000) {
        parts.push(text);
      }
    });
  });

  // Fallback: all <p> and <li> near keywords
  $('p, li, dd, dt').each((_, el) => {
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    if (text.length > 20 && containsInstallerKeyword(text)) {
      parts.push(text);
    }
  });

  return [...new Set(parts)].join('\n');
}

function extractDocLinks($, baseUrl, baseOrigin) {
  const links = [];
  try {
    const base = new URL(baseUrl);
    $('a[href]').each((_, el) => {
      try {
        const href = $(el).attr('href');
        if (!href) return;
        const abs = new URL(href, base).href.split('#')[0];
        if (!abs.startsWith('http')) return;
        const absOrigin = getOrigin(abs);
        if (absOrigin !== baseOrigin) return;

        const text = ($(el).text() + ' ' + href).toLowerCase();
        if (DOC_KEYWORDS.some(k => text.includes(k))) {
          links.push(abs);
        }
      } catch { /* ignore invalid URLs */ }
    });
  } catch { /* ignore */ }
  return links;
}

function containsInstallerKeyword(text) {
  const lower = text.toLowerCase();
  return DOC_KEYWORDS.some(k => lower.includes(k));
}

function getOrigin(url) {
  try { return new URL(url).origin; }
  catch { return ''; }
}

module.exports = { crawl };
