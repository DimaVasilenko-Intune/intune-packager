'use strict';

const archiver = require('archiver');
const fs       = require('fs');
const path     = require('path');
const { PassThrough } = require('stream');

const TEMPLATES_DIR = path.join(__dirname, 'templates');

// Cache templates at startup to avoid synchronous reads per request
const templateCache = {};
for (const name of ['Install.ps1', 'Uninstall.ps1', 'Detection.ps1']) {
  templateCache[name] = fs.readFileSync(path.join(TEMPLATES_DIR, name), 'utf8');
}

/**
 * Generate a ZIP package for Intune deployment.
 * Returns a readable stream of the ZIP file.
 *
 * @param {AnalysisResult} result
 * @returns {stream.Readable}
 */
async function generatePackage(result) {
  const {
    filename    = 'installer',
    type        = 'exe',
    version     = '1.0',
    install     = '',
    uninstall   = '',
    detection   = '',
    sourceUrl   = '',
    aiUsed      = false,
    confidence  = 0,
    guid        = null,
  } = result;

  const appName   = extractAppName(filename);
  const safeName  = toSafeName(appName);
  const dateStr   = new Date().toISOString().split('T')[0];

  // Template substitution map — sanitize all values before embedding in PS1
  const vars = {
    APP_NAME:        sanitizePS(appName),
    VERSION:         sanitizePS(version || '1.0'),
    INSTALLER_FILE:  sanitizePS(filename),
    SAFE_NAME:       safeName,
    SOURCE_URL:      sanitizePS(sourceUrl || 'unknown'),
    GENERATED_DATE:  new Date().toISOString(),
    INSTALL_CMD:     sanitizePS(install),
    INSTALL_PROCESS: sanitizePS(buildInstallProcess(install, filename, type)),
    INSTALL_ARGS:    sanitizePS(buildInstallArgs(install, filename, type)),
    UNINSTALL_SCRIPT:sanitizePS(buildUninstallScript(uninstall, guid, type)),
    DETECTION_SCRIPT:sanitizePS(detection || buildFallbackDetection(appName)),
  };

  // Read templates (from cache)
  const installTpl   = applyTemplate(templateCache['Install.ps1'],   vars);
  const uninstallTpl = applyTemplate(templateCache['Uninstall.ps1'], vars);
  const detectionTpl = applyTemplate(templateCache['Detection.ps1'], vars);

  // metadata.json
  const metadata = JSON.stringify({
    appName,
    filename,
    type,
    version: version || null,
    guid:    guid    || null,
    sourceUrl,
    confidence,
    aiUsed,
    generatedAt: new Date().toISOString(),
    intuneSettings: {
      installBehavior:        type === 'msix' ? 'user' : 'system',
      deviceRestartBehavior:  'suppress',
      returnCodes: [
        { returnCode: 0,    type: 'success' },
        { returnCode: 3010, type: 'softReboot' },
        { returnCode: 1641, type: 'hardReboot' },
      ],
    },
  }, null, 2);

  // README.txt
  const readme = buildReadme(appName, filename, type, install, uninstall, detection, sourceUrl, dateStr);

  // Build ZIP stream — promise-based error handling
  return new Promise((resolve, reject) => {
    const output  = new PassThrough();
    const archive = archiver('zip', { zlib: { level: 6 } });

    archive.on('error', err => {
      output.destroy(err);
      reject(err);
    });

    output.on('error', err => reject(err));

    archive.pipe(output);

    archive.append(installTpl,   { name: 'Install.ps1' });
    archive.append(uninstallTpl, { name: 'Uninstall.ps1' });
    archive.append(detectionTpl, { name: 'Detection.ps1' });
    archive.append(metadata,     { name: 'metadata.json' });
    archive.append(readme,       { name: 'README.txt' });

    archive.finalize().then(() => resolve(output)).catch(reject);
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function applyTemplate(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

function extractAppName(filename = '') {
  return filename
    .replace(/\.[^.]+$/, '')          // remove extension
    .replace(/[-_v]?\d[\d.]*\d/g, '') // remove version numbers
    .replace(/[-_x](64|86|32)/g, '')  // remove arch
    .replace(/[-_.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'Application';
}

function toSafeName(name = '') {
  return name.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').slice(0, 40);
}

/**
 * Sanitize a string before embedding in PowerShell templates.
 * Removes/neutralizes characters that could enable injection.
 */
function sanitizePS(str = '') {
  return str
    .replace(/[`$"]/g, '')            // remove PS special chars
    .replace(/[;|&<>]/g, '')           // remove shell operators
    .replace(/\r?\n/g, ' ')           // flatten newlines
    .slice(0, 500);                    // enforce max length
}

function buildInstallProcess(installCmd, filename, type) {
  if (type === 'msi' || installCmd.toLowerCase().includes('msiexec')) {
    return 'msiexec.exe';
  }
  return `".\\${filename}"`;
}

function buildInstallArgs(installCmd, filename, type) {
  if (type === 'msi' || installCmd.toLowerCase().includes('msiexec')) {
    const argsMatch = installCmd.match(/msiexec(?:\.exe)?\s+(.+)/i);
    // Remove double quotes — the PS1 template already wraps in single quotes
    return argsMatch ? argsMatch[1].replace(/"/g, '') : `/i ${filename} /quiet /norestart`;
  }
  // Strip executable from front
  const argsMatch = installCmd.match(/^"?[^"]+\.exe"?\s+(.+)/i);
  return argsMatch ? argsMatch[1].replace(/"/g, '') : '/quiet /norestart';
}

function buildUninstallScript(uninstall, guid, type) {
  if (!uninstall) {
    if (guid) return `$proc = Start-Process msiexec.exe -ArgumentList '/x "${guid}" /quiet /norestart' -Wait -PassThru`;
    return `# NOTE: No uninstall command was detected. Add the correct uninstall command below.\n    Write-Log "Uninstall command not available — please update this script manually"`;
  }

  if (uninstall.toLowerCase().includes('msiexec')) {
    return [
      `$proc = Start-Process -FilePath msiexec.exe -ArgumentList '${uninstall.replace(/msiexec(?:\.exe)?\s+/i, '').replace(/"/g, "'")}' -Wait -PassThru -NoNewWindow`,
      `Write-Log "Exit code: $($proc.ExitCode)"`,
      `if ($proc.ExitCode -notin @(0, 3010, 1641)) { throw "Uninstall failed: $($proc.ExitCode)" }`,
    ].join('\n    ');
  }

  if (uninstall.includes('Remove-AppxPackage')) {
    return uninstall;
  }

  return [
    `$proc = Start-Process -FilePath cmd.exe -ArgumentList '/c ${uninstall.replace(/"/g, "'")}' -Wait -PassThru -NoNewWindow`,
    `Write-Log "Exit code: $($proc.ExitCode)"`,
    `if ($proc.ExitCode -ne 0) { throw "Uninstall failed: $($proc.ExitCode)" }`,
  ].join('\n    ');
}

function buildFallbackDetection(appName) {
  return [
    `$regBases = @(`,
    `    "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall",`,
    `    "HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall"`,
    `)`,
    `$found = $false`,
    `foreach ($base in $regBases) {`,
    `    Get-ChildItem $base -ErrorAction SilentlyContinue | ForEach-Object {`,
    `        $n = (Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue).DisplayName`,
    `        if ($n -like "*${appName}*") { $found = $true }`,
    `    }`,
    `}`,
    `if ($found) { exit 0 } else { exit 1 }`,
  ].join('\n');
}

function buildReadme(appName, filename, type, install, uninstall, detection, sourceUrl, date) {
  return [
    `Intune Package — ${appName}`,
    `${'='.repeat(50)}`,
    `Generated: ${date}`,
    `Source:    ${sourceUrl || 'unknown'}`,
    ``,
    `FILES`,
    `-----`,
    `Install.ps1   — Silent install script`,
    `Uninstall.ps1 — Silent uninstall script`,
    `Detection.ps1 — Intune detection rule`,
    `metadata.json — App metadata`,
    `README.txt    — This file`,
    ``,
    `INTUNE SETUP`,
    `------------`,
    `App type:         Windows app (Win32)`,
    `Install command:  powershell.exe -ExecutionPolicy Bypass -File Install.ps1`,
    `Uninstall command: powershell.exe -ExecutionPolicy Bypass -File Uninstall.ps1`,
    `Detection rule:   Use custom script: Detection.ps1`,
    ``,
    `INSTALL COMMAND (raw)`,
    `---------------------`,
    install || '(see Install.ps1)',
    ``,
    `UNINSTALL COMMAND (raw)`,
    `-----------------------`,
    uninstall || '(see Uninstall.ps1)',
    ``,
    `DETECTION RULE (raw)`,
    `--------------------`,
    detection || '(see Detection.ps1)',
    ``,
    `VERIFICATION CHECKLIST`,
    `----------------------`,
    `[ ] Test install on a clean VM`,
    `[ ] Verify detection rule returns exit 0 after install`,
    `[ ] Verify detection rule returns exit 1 before install`,
    `[ ] Test uninstall + verify detection returns exit 1`,
    `[ ] Check event log for any errors`,
    `[ ] Validate with Intune Management Extension log:`,
    `    C:\\ProgramData\\Microsoft\\IntuneManagementExtension\\Logs\\IntuneManagementExtension.log`,
    ``,
    `Generated by Intune Packager v1.0.0`,
  ].join('\n');
}

module.exports = { generatePackage };
