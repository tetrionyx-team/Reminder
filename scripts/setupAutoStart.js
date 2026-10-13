const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function getStartupFolder() {
  try {
    const stdout = execSync('powershell -NoProfile -Command "[System.Environment]::GetFolderPath(\'Startup\')"', { encoding: 'utf8' }).trim();
    if (stdout && fs.existsSync(stdout)) return stdout;
  } catch (e) {}

  const userProfile = process.env.USERPROFILE || 'C:\\Users\\ADMIN';
  const fallback = path.join(userProfile, 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
  return fallback;
}

function setAutoStart(enable = true) {
  const startupFolder = getStartupFolder();
  const shortcutPath = path.join(startupFolder, 'Vara - 3D Companion.lnk');

  if (!enable) {
    if (fs.existsSync(shortcutPath)) {
      try { fs.unlinkSync(shortcutPath); } catch {}
    }
    return { success: true, enabled: false };
  }

  const projectRoot = path.resolve(__dirname, '..');
  const electronExe = path.join(projectRoot, 'node_modules', 'electron', 'dist', 'electron.exe');
  const iconPath = path.join(projectRoot, 'assets', 'icon.ico');

  const psScript = `
$wsh = New-Object -ComObject WScript.Shell
$shortcut = $wsh.CreateShortcut('${shortcutPath.replace(/'/g, "''")}')
$shortcut.TargetPath = '${electronExe.replace(/'/g, "''")}'
$shortcut.Arguments = '. --autostart'
$shortcut.WorkingDirectory = '${projectRoot.replace(/'/g, "''")}'
$shortcut.IconLocation = '${iconPath.replace(/'/g, "''")}, 0'
$shortcut.Description = 'Vara - 3D Companion Auto Start on Windows'
$shortcut.Save()
Write-Output 'OK'
`;

  try {
    const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
    execSync(`powershell -NoProfile -EncodedCommand ${encoded}`, { encoding: 'utf8' });
    return { success: true, enabled: true, path: shortcutPath };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function isAutoStartEnabled() {
  const startupFolder = getStartupFolder();
  const shortcutPath = path.join(startupFolder, 'Vara - 3D Companion.lnk');
  return fs.existsSync(shortcutPath);
}

if (require.main === module) {
  const res = setAutoStart(true);
  console.log('Auto-start setup result:', res);
}

module.exports = { setAutoStart, isAutoStartEnabled };
