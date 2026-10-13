const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function getDesktopPath() {
  try {
    const stdout = execSync('powershell -NoProfile -Command "[System.Environment]::GetFolderPath(\'Desktop\')"', { encoding: 'utf8' }).trim();
    if (stdout && fs.existsSync(stdout)) return stdout;
  } catch (e) {
    // fallback
  }

  const userProfile = process.env.USERPROFILE || 'C:\\Users\\ADMIN';
  const oneDriveDesktop = path.join(userProfile, 'OneDrive', 'Desktop');
  if (fs.existsSync(oneDriveDesktop)) return oneDriveDesktop;

  const normalDesktop = path.join(userProfile, 'Desktop');
  if (fs.existsSync(normalDesktop)) return normalDesktop;

  return oneDriveDesktop;
}

function getDownloadsPath() {
  const userProfile = process.env.USERPROFILE || 'C:\\Users\\ADMIN';
  const downloads = path.join(userProfile, 'Downloads');
  if (fs.existsSync(downloads)) return downloads;
  return getDesktopPath();
}

function createDesktopShortcut() {
  const desktop = getDesktopPath();
  const downloads = getDownloadsPath();
  const projectRoot = path.resolve(__dirname, '..');
  const electronExe = path.join(projectRoot, 'node_modules', 'electron', 'dist', 'electron.exe');
  const iconPath = path.join(projectRoot, 'assets', 'icon.ico');
  const targetLnk = path.join(desktop, 'Vara - 3D Companion.lnk');
  const downloadLnk = path.join(downloads, 'Vara - 3D Companion.lnk');

  const psScript = `
$wsh = New-Object -ComObject WScript.Shell

# Create on Desktop
$shortcut = $wsh.CreateShortcut('${targetLnk.replace(/'/g, "''")}')
$shortcut.TargetPath = '${electronExe.replace(/'/g, "''")}'
$shortcut.Arguments = '.'
$shortcut.WorkingDirectory = '${projectRoot.replace(/'/g, "''")}'
$shortcut.IconLocation = '${iconPath.replace(/'/g, "''")}, 0'
$shortcut.Description = 'Vara - 3D Companion & Reminder'
$shortcut.Hotkey = 'CTRL+ALT+V'
$shortcut.Save()

# Also save copy in Downloads folder
Copy-Item -Path '${targetLnk.replace(/'/g, "''")}' -Destination '${downloadLnk.replace(/'/g, "''")}' -Force
Write-Output 'OK'
`;

  try {
    const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
    execSync(`powershell -NoProfile -EncodedCommand ${encoded}`, { encoding: 'utf8' });

    let base64Data = null;
    if (fs.existsSync(targetLnk)) {
      base64Data = fs.readFileSync(targetLnk).toString('base64');
    }

    return { 
      success: true, 
      path: targetLnk, 
      downloadPath: downloadLnk, 
      filename: 'Vara - 3D Companion.lnk',
      base64: base64Data 
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

if (require.main === module) {
  const res = createDesktopShortcut();
  if (res.success) {
    console.log('Successfully created Desktop shortcut at:', res.path);
    console.log('Also placed in Downloads at:', res.downloadPath);
  } else {
    console.error('Failed to create Desktop shortcut:', res.error);
    process.exit(1);
  }
}

module.exports = { createDesktopShortcut, getDesktopPath, getDownloadsPath };
