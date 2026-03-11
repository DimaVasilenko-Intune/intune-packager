'use strict';

const { URL } = require('url');
const dns = require('dns');
const { promisify } = require('util');

const dnsLookup = promisify(dns.lookup);

const BLOCKED_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '[::1]',
  '169.254.169.254',       // AWS/GCP metadata
  'metadata.google.internal',
  '100.100.100.200',       // Alibaba metadata
]);

/**
 * Check if an IP address falls within private/reserved ranges.
 */
function isPrivateIP(ip) {
  // IPv4 private/reserved ranges
  const parts = ip.split('.').map(Number);
  if (parts.length === 4) {
    if (parts[0] === 10) return true;                                           // 10.0.0.0/8
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;     // 172.16.0.0/12
    if (parts[0] === 192 && parts[1] === 168) return true;                      // 192.168.0.0/16
    if (parts[0] === 127) return true;                                          // 127.0.0.0/8
    if (parts[0] === 169 && parts[1] === 254) return true;                      // 169.254.0.0/16
    if (parts[0] === 0) return true;                                            // 0.0.0.0/8
    if (parts[0] >= 224) return true;                                           // multicast/reserved
  }
  // IPv6 loopback / link-local
  if (ip === '::1' || ip.startsWith('fe80:') || ip.startsWith('fc00:') || ip.startsWith('fd')) {
    return true;
  }
  return false;
}

/**
 * Validate a URL is safe to fetch (no SSRF).
 * @param {string} urlStr
 * @throws {Error} if the URL is blocked
 */
async function validateUrl(urlStr) {
  let parsed;
  try {
    parsed = new URL(urlStr);
  } catch {
    throw new Error('Invalid URL');
  }

  // Only allow http/https
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Blocked protocol: ${parsed.protocol}`);
  }

  // Block known internal hosts
  const hostname = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(hostname)) {
    throw new Error(`Blocked host: ${hostname}`);
  }

  // DNS resolve to check for private IPs
  try {
    const { address } = await dnsLookup(hostname);
    if (isPrivateIP(address)) {
      throw new Error(`Blocked: ${hostname} resolves to private IP ${address}`);
    }
  } catch (err) {
    if (err.message.startsWith('Blocked')) throw err;
    // DNS failures — let axios handle it
  }
}

module.exports = { validateUrl, isPrivateIP };
