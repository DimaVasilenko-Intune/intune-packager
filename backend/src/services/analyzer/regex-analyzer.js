'use strict';

// ── Installer switch databases ──────────────────────────────────────────────
const EXE_FRAMEWORKS = {
  innoSetup:    { pattern: /inno setup|inno installer/i, silent: '/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /SP-', unsilent: '/SILENT' },
  nsis:         { pattern: /nullsoft|nsis/i,             silent: '/S',                                           unsilent: '/S' },
  installShield:{ pattern: /installshield/i,             silent: '/s /v"/qn /norestart"',                        unsilent: '/s' },
  wix:          { pattern: /wix bootstrapper|wix bundle/i, silent: '/quiet /norestart',                          unsilent: '/passive' },
  advancedInstaller: { pattern: /advanced installer/i,   silent: '/exenoui /qn',                                 unsilent: '/exepassiveui' },
};

// ── Regex patterns ──────────────────────────────────────────────────────────
const GUID_RE   = /\{[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}\}/g;
const VER_RE    = /\b(\d+\.\d+(?:\.\d+)*(?:\.\d+)?)\b/;
const SIZE_RE   = /(\d+(?:\.\d+)?)\s*(MB|GB|KB)\b/i;

// Silent install patterns — ordered by specificity
const INSTALL_PATTERNS = [
  // Explicit msiexec with filename
  /msiexec(?:\.exe)?\s+\/[iI]\s+["']?([^\s"']+\.msi)["']?\s+([^\n\r]{5,200})/i,
  // msiexec with just flags (no filename)
  /msiexec(?:\.exe)?\s+(\/[qiIaxs][^\n\r]{0,150})/i,
  // EXE with silent switches
  /["']?[^\s"']+\.exe["']?\s+(\/(?:VERYSILENT|silent|S|quiet)[^\n\r]{0,150})/i,
  // "silent install" instruction
  /silent\s+install[^\n\r]{0,150}/i,
  // Command-line example blocks
  /(?:command|cmd|run|execute)[:\s]+["']?([^\n\r"']{10,200}(?:\.msi|\.exe)[^\n\r"']{0,80})["']?/i,
];

const UNINSTALL_PATTERNS = [
  /msiexec(?:\.exe)?\s+\/[xX]\s+["']?(\{[A-Fa-f0-9-]{36}\}|[^\s"']+\.msi)["']?\s*([^\n\r]{0,150})/i,
  /uninstall(?:er)?[:\s]+["']?([^\n\r"']{10,200})["']?/i,
  /(?:\/uninstall|--uninstall|-uninstall)\s+([^\n\r]{0,100})/i,
  /wmic product[^\n\r]{0,100}call uninstall[^\n\r]{0,100}/i,
];

const REGISTRY_PATTERNS = [
  /HKEY_LOCAL_MACHINE\\SOFTWARE(?:\\WOW6432Node)?\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\(\{[A-Fa-f0-9-]{36}\}|[^\\\n\r]{1,80})/i,
  /HKLM[:\\\/]+SOFTWARE(?:[:\\\/]+WOW6432Node)?[:\\\/]+[^\n\r\s]{5,150}/i,
];

const FILE_DETECTION_PATTERNS = [
  /(?:installs?\s+to|installed\s+(?:at|in|to)|default\s+path)[:\s]+["']?([A-Za-z]:\\[^\n\r"']{5,150})["']?/i,
  /["']?((?:%ProgramFiles%|C:\\Program Files)[\\\/][^\n\r"']{3,100})["']?/i,
];

// ── Main function ───────────────────────────────────────────────────────────

/**
 * @param {object} opts
 * @param {string} opts.text   - crawled page text
 * @param {string} opts.filename
 * @param {string} opts.type   - 'msi' | 'exe' | 'msix'
 * @param {string} opts.url
 * @returns {AnalysisResult}
 */
function analyze({ text, filename, type, url }) {
  const t = type?.toLowerCase() || detectTypeFromFilename(filename);

  const guid    = extractGuid(text, filename);
  const version = extractVersion(text, filename);
  const size    = extractSize(text);
  const framework = t === 'exe' ? detectFramework(text) : null;

  const install   = buildInstallCommand(text, filename, t, guid, framework);
  const uninstall = buildUninstallCommand(text, filename, t, guid, framework);
  const detection = buildDetectionRule(text, filename, t, guid, url);

  const confidence = scoreConfidence({ install, uninstall, detection, guid, framework, t });

  return {
    filename,
    type: t,
    version,
    size,
    install,
    uninstall,
    detection,
    confidence,
    guid: guid || null,
    framework: framework?.name || null,
    aiUsed: false,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function detectTypeFromFilename(name = '') {
  const lower = name.toLowerCase();
  if (lower.endsWith('.msi'))  return 'msi';
  if (lower.endsWith('.msix') || lower.endsWith('.appx')) return 'msix';
  return 'exe';
}

function extractGuid(text, filename = '') {
  // Search in filename first
  const fnGuids = [...filename.matchAll(GUID_RE)];
  if (fnGuids.length) return fnGuids[0][0];

  // Search in text — prefer GUIDs near "ProductCode" or "GUID"
  const productCodeMatch = text.match(/(?:ProductCode|GUID|product\s+code)[^\n\r]{0,50}(\{[A-Fa-f0-9-]{36}\})/i);
  if (productCodeMatch) return productCodeMatch[1];

  const allGuids = [...text.matchAll(GUID_RE)];
  return allGuids.length ? allGuids[0][0] : null;
}

function extractVersion(text, filename = '') {
  // Version from filename
  const fnVer = filename.match(VER_RE);
  if (fnVer) return fnVer[1];
  // Version near "version" keyword in text
  const textVer = text.match(/version[:\s]+(\d+\.\d+(?:\.\d+)*)/i);
  return textVer ? textVer[1] : null;
}

function extractSize(text) {
  const m = text.match(SIZE_RE);
  return m ? `${m[1]} ${m[2].toUpperCase()}` : null;
}

function detectFramework(text) {
  for (const [name, fw] of Object.entries(EXE_FRAMEWORKS)) {
    if (fw.pattern.test(text)) return { name, ...fw };
  }
  return null;
}

function buildInstallCommand(text, filename, type, guid, framework) {
  if (type === 'msi') {
    return `msiexec.exe /i "${filename}" /quiet /norestart /l*v "%TEMP%\\${sanitizeName(filename)}_install.log"`;
  }

  if (type === 'msix') {
    return `Add-AppxPackage -Path ".\\${filename}"`;
  }

  // EXE — try to extract from text
  for (const pat of INSTALL_PATTERNS) {
    const m = text.match(pat);
    if (m) {
      const extracted = m[0].replace(/\s+/g, ' ').trim();
      if (extracted.length > 10) return extracted;
    }
  }

  // Fall back to framework default
  if (framework) {
    return `".\\${filename}" ${framework.silent}`;
  }

  // Generic fallback
  return `".\\${filename}" /quiet /norestart`;
}

function buildUninstallCommand(text, filename, type, guid, framework) {
  if (guid) {
    return `msiexec.exe /x "${guid}" /quiet /norestart`;
  }

  if (type === 'msi') {
    return `msiexec.exe /x "${filename}" /quiet /norestart`;
  }

  if (type === 'msix') {
    const appName = filename.replace(/\.[^.]+$/, '');
    return `Get-AppxPackage -Name "*${appName}*" | Remove-AppxPackage`;
  }

  // Try uninstall pattern from text
  for (const pat of UNINSTALL_PATTERNS) {
    const m = text.match(pat);
    if (m) return m[0].replace(/\s+/g, ' ').trim();
  }

  // Framework default
  if (framework) {
    return `".\\${filename}" ${framework.unsilent} /uninstall`;
  }

  // Registry-based uninstall string
  const uninstallStr = text.match(/UninstallString["\s]+=["'\s]+([^\n\r"]{10,200})/i);
  if (uninstallStr) return uninstallStr[1].trim();

  return `msiexec.exe /x "${filename}" /quiet /norestart`;
}

function buildDetectionRule(text, filename, type, guid, url) {
  if (guid) {
    return [
      `$regPath = "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${guid}"`,
      `$reg32   = "HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${guid}"`,
      `if ((Test-Path $regPath) -or (Test-Path $reg32)) { exit 0 } else { exit 1 }`,
    ].join('\n');
  }

  // Registry path from text
  for (const pat of REGISTRY_PATTERNS) {
    const m = text.match(pat);
    if (m) {
      const regKey = m[0].trim();
      return [
        `$regPath = "${regKey}"`,
        `if (Test-Path $regPath) { exit 0 } else { exit 1 }`,
      ].join('\n');
    }
  }

  // File-based detection
  for (const pat of FILE_DETECTION_PATTERNS) {
    const m = text.match(pat);
    if (m) {
      const filePath = (m[1] || m[0]).trim();
      return [
        `$appPath = "${filePath}"`,
        `if (Test-Path $appPath) { exit 0 } else { exit 1 }`,
      ].join('\n');
    }
  }

  // MSIX
  if (type === 'msix') {
    const appName = filename.replace(/\.[^.]+$/, '');
    return [
      `$pkg = Get-AppxPackage -Name "*${appName}*" -ErrorAction SilentlyContinue`,
      `if ($pkg) { exit 0 } else { exit 1 }`,
    ].join('\n');
  }

  // Generic fallback — registry by display name
  const appName = filename.replace(/[-_v]?\d[\d.]*[\d]?.*$/, '').replace(/[^a-zA-Z0-9 ]/g, ' ').trim();
  return [
    `$regBases = @(`,
    `  "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall",`,
    `  "HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall"`,
    `)`,
    `$found = $false`,
    `foreach ($base in $regBases) {`,
    `  Get-ChildItem $base -ErrorAction SilentlyContinue | ForEach-Object {`,
    `    $name = (Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue).DisplayName`,
    `    if ($name -like "*${appName}*") { $found = $true }`,
    `  }`,
    `}`,
    `if ($found) { exit 0 } else { exit 1 }`,
  ].join('\n');
}

function scoreConfidence({ install, uninstall, detection, guid, framework, t }) {
  let score = 20; // base

  if (guid)      score += 30;
  if (framework) score += 10;

  if (t === 'msi' || t === 'msix') score += 15;

  // Check install quality
  if (install?.includes('/quiet'))     score += 8;
  if (install?.includes('/norestart')) score += 5;
  if (install?.includes('msiexec'))    score += 7;

  // Check uninstall quality
  if (uninstall?.includes('/x') && uninstall?.includes('{')) score += 10;

  // Check detection quality
  if (detection?.includes('Test-Path')) score += 5;
  if (detection?.includes('Uninstall')) score += 5;

  return Math.min(100, Math.round(score));
}

function sanitizeName(name = '') {
  return name.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 40);
}

module.exports = { analyze };
