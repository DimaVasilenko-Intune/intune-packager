'use strict';

/**
 * Background service worker.
 * Handles cross-tab state and relays messages from popup → content script.
 */

// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'PING') {
    sendResponse({ status: 'ok' });
    return true;
  }

  // Popup requests injection of detector into a specific tab
  if (msg.action === 'INJECT_DETECTOR') {
    const tabId = msg.tabId;
    chrome.scripting.executeScript(
      { target: { tabId }, files: ['content/detector.js'] },
      () => sendResponse({ injected: !chrome.runtime.lastError })
    );
    return true; // keep channel open for async response
  }

  // Store scan results per tab (used to persist across popup close/open)
  if (msg.action === 'STORE_RESULTS') {
    chrome.storage.session
      .set({ [`results_${sender.tab?.id}`]: msg.results })
      .then(() => sendResponse({ ok: true }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  // Clear results for a tab
  if (msg.action === 'CLEAR_RESULTS') {
    chrome.storage.session
      .remove([`results_${msg.tabId}`])
      .then(() => sendResponse({ ok: true }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }
});

// Clean up stored results when a tab is closed
chrome.tabs.onRemoved.addListener(tabId => {
  chrome.storage.session.remove([`results_${tabId}`]).catch(() => {});
});

// Set badge when extension loads
chrome.runtime.onInstalled.addListener(() => {
  console.log('[Intune Packager] Extension installed/updated');
});
