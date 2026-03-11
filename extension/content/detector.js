'use strict';

if (window._intuneDetectorLoaded) { /* already injected */ }
else {
window._intuneDetectorLoaded = true;

/**
 * Content script — Detector
 * Scans the current page DOM for installer download links.
 * Responds to DETECT_INSTALLERS messages from the popup.
 */

const INSTALLER_EXTS = ['.msi', '.exe', '.msix', '.appx', '.pkg', '.dmg'];
const SKIP_PATTERNS  = [
  /\.(js|css|png|jpg|gif|svg|ico|woff|ttf|pdf|zip|tar|gz|7z)$/i,
  /^(javascript:|mailto:|#)/,
];

// Listen for messages from popup
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'DETECT_INSTALLERS') {
    try {
      const installers = detectInstallers();
      sendResponse(installers);
    } catch (err) {
      sendResponse([]);
    }
    return true; // async
  }
});

/**
 * Scan the page DOM for installer links.
 * Returns array of { url, filename, type, size, context }
 */
function detectInstallers() {
  const found = new Map(); // url → item (dedup by URL)

  // 1. Scan all <a href> links
  document.querySelectorAll('a[href]').forEach(el => {
    const href = el.getAttribute('href');
    if (!href || SKIP_PATTERNS.some(re => re.test(href))) return;

    const ext = getInstallerExt(href);
    if (!ext) return;

    const absUrl  = toAbsolute(href);
    const filename = extractFilename(absUrl);
    if (!filename || found.has(absUrl)) return;

    found.set(absUrl, {
      url:      absUrl,
      filename,
      type:     extToType(ext),
      size:     extractNearbySize(el),
      context:  el.closest('section, article, div, main')?.innerText?.slice(0, 200) || '',
    });
  });

  // 2. Scan download buttons / [data-url] attributes
  document.querySelectorAll('[data-url],[data-href],[data-download]').forEach(el => {
    const href = el.getAttribute('data-url') || el.getAttribute('data-href') || el.getAttribute('data-download');
    if (!href) return;
    const ext = getInstallerExt(href);
    if (!ext) return;
    const absUrl  = toAbsolute(href);
    const filename = extractFilename(absUrl);
    if (!filename || found.has(absUrl)) return;
    found.set(absUrl, {
      url: absUrl, filename, type: extToType(ext), size: null, context: '',
    });
  });

  // 3. Scan page text for installer filenames mentioned in code blocks
  document.querySelectorAll('code, pre, .filename, .file-name').forEach(el => {
    const text = el.textContent || '';
    const matches = text.match(/[\w.-]+(\.msi|\.exe|\.msix)\b/gi);
    if (!matches) return;
    matches.forEach(fn => {
      const key = `text:${fn}`;
      if (!found.has(key)) {
        found.set(key, {
          url:      window.location.href,
          filename: fn,
          type:     extToType(getInstallerExt(fn)),
          size:     null,
          context:  text.slice(0, 200),
        });
      }
    });
  });

  // Sort: prefer .msi, then .exe, then others
  const all = [...found.values()];
  all.sort((a, b) => typeOrder(a.type) - typeOrder(b.type));

  return all.slice(0, 10); // max 10 results
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getInstallerExt(url) {
  const lower = url.toLowerCase().split('?')[0];
  return INSTALLER_EXTS.find(ext => lower.endsWith(ext)) || null;
}

function toAbsolute(href) {
  try { return new URL(href, window.location.href).href; }
  catch { return href; }
}

function extractFilename(url) {
  try {
    return new URL(url).pathname.split('/').pop() || '';
  } catch {
    return url.split('/').pop()?.split('?')[0] || '';
  }
}

function extToType(ext) {
  if (!ext) return 'unknown';
  const e = ext.toLowerCase();
  if (e === '.msi')  return 'msi';
  if (e === '.msix' || e === '.appx') return 'msix';
  return 'exe';
}

function typeOrder(type) {
  const order = { msi: 0, msix: 1, exe: 2, unknown: 3 };
  return order[type] ?? 99;
}

function extractNearbySize(el) {
  // Look in the link text and surrounding siblings for file sizes
  const text = [
    el.textContent,
    el.parentElement?.textContent,
    el.closest('tr,li,div')?.textContent,
  ].filter(Boolean).join(' ');

  const m = text.match(/(\d+(?:\.\d+)?)\s*(MB|KB|GB)/i);
  return m ? `${m[1]} ${m[2].toUpperCase()}` : null;
}

} // end duplicate-injection guard
