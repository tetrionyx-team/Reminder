'use strict';
const { app, BrowserWindow, Tray, Menu, ipcMain, screen, powerMonitor, nativeImage, dialog, globalShortcut } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { validate, ReminderEngine } = require('./engine');
const { createDesktopShortcut } = require('../scripts/createShortcut');
const { setAutoStart, isAutoStartEnabled } = require('../scripts/setupAutoStart');
let control, character, bubble, tray, engine, settings, active = false, phase = 'hidden', quitting = false, idleSample = 0, activeCharacter, videoBounds;
const root = path.join(__dirname, '..');
const fallbackIcon = nativeImage.createEmpty();
if (process.platform === 'win32') app.setAppUserModelId('local.pixelfriend.windows');
const prefs = () => path.join(app.getPath('userData'), 'settings.json');
const state = () => ({ settings, ...engine.snapshot(), active });
const options = { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, devTools: false };

function secure(win) { 
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' })); 
  win.webContents.on('will-navigate', event => event.preventDefault()); 
  win.webContents.on('devtools-opened', () => { win.webContents.closeDevTools(); });
  win.webContents.on('before-input-event', (event, input) => {
    if ((input.control && input.shift && ['I', 'J', 'C', 'i', 'j', 'c'].includes(input.key)) ||
        (input.control && ['u', 'U', 's', 'S'].includes(input.key)) ||
        input.key === 'F12') {
      event.preventDefault();
    }
  });
}
function update() { if (control && !control.isDestroyed()) control.webContents.send('state', state()); }
function trayMenu() {
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'View Vara (Ctrl+Shift+V)', click: openControl },
    { label: 'View 3D Companion (Ctrl+Shift+Space)', click: () => { if (active) finish(); present(); } },
    { type: 'separator' },
    { label: engine.paused ? 'Resume reminders' : 'Pause reminders', click: () => { engine.togglePause(); trayMenu(); update(); } },
    { label: 'Add Desktop Shortcut', click: () => {
        const res = createDesktopShortcut();
        if (res.success && control && !control.isDestroyed()) {
          dialog.showMessageBox(control, { type: 'info', title: 'Shortcut Created', message: 'Vara shortcut has been placed on your Desktop!\n\nYou can also press Ctrl+Alt+V or Ctrl+Shift+V anywhere to view.' });
        }
      }
    },
    { type: 'separator' },
    { label: 'Quit Vara', click: () => { quitting = true; try { globalShortcut.unregisterAll(); } catch {} app.exit(0); } }
  ]));
}
function openControl() {
  if (control && !control.isDestroyed()) {
    if (control.isMinimized()) control.restore();
    control.show();
    control.focus();
  }
}
function toggleControl() {
  if (control && !control.isDestroyed()) {
    if (control.isVisible() && control.isFocused()) {
      control.hide();
    } else {
      openControl();
    }
  }
}
function sendCharacter(role) { character.webContents.send('reminder', { role, character: activeCharacter, canvasWidth: character.getBounds().width, originX: videoBounds.originX, videoWidth: videoBounds.videoWidth }); }
let currentReminderIndex = 0;
let currentDisplayedReminder = null;
let activeTestReminder = null;

function present(targetReminder = null) {
  if (active) return;
  const work = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  const width = Math.min(540, work.width), height = Math.round(width * 304 / 540);
  
  const activeReminders = Array.isArray(settings.reminders) && settings.reminders.length > 0
    ? settings.reminders.filter(r => r.enabled !== false)
    : [];

  if (!activeTestReminder && activeReminders.length === 0) return;

  if (activeTestReminder) {
    currentDisplayedReminder = activeTestReminder;
  } else if (targetReminder) {
    currentDisplayedReminder = targetReminder;
  } else if (engine && engine.currentReminder) {
    currentDisplayedReminder = engine.currentReminder;
  } else if (activeReminders.length > 0) {
    currentDisplayedReminder = activeReminders[currentReminderIndex % activeReminders.length];
    currentReminderIndex = (currentReminderIndex + 1) % activeReminders.length;
  } else {
    currentDisplayedReminder = settings;
  }

  activeCharacter = currentDisplayedReminder.reminderCharacter || settings.reminderCharacter || 'character1';
  const originX = ['character3', 'character4'].includes(activeCharacter) ? work.width - width : 0;
  const bottomOffset = activeCharacter === 'character8' ? 0 : 83;
  videoBounds = { x: work.x, y: Math.max(work.y, work.y + work.height - height - bottomOffset), width: work.width, height, originX, videoWidth: width };
  character.setBounds({ x: videoBounds.x, y: videoBounds.y, width: videoBounds.width, height: videoBounds.height });
  const bubbleHeight = 144, bubbleGap = 48;
  bubble.setBounds({ x: Math.max(work.x, Math.min(work.x + work.width - 480, videoBounds.x + originX + width / 2 - 240)), y: Math.max(work.y, videoBounds.y - bubbleHeight - bubbleGap), width: Math.min(480, work.width), height: bubbleHeight });
  active = true; phase = 'entry';
  sendCharacter('entry');
  try { character.setAlwaysOnTop(true, 'screen-saver'); } catch {}
  character.showInactive();
  update();
}
function finish() {
  activeTestReminder = null;
  character.hide(); bubble.hide(); active = false; phase = 'hidden';
  engine.schedule(exitWasSnooze ? 600000 : engine.interval());
  update();
}
let exitWasSnooze = false;
function exit(snooze) { phase = 'exit'; exitWasSnooze = snooze; bubble.hide(); sendCharacter(snooze ? 'disappointed-out' : 'success-out'); }
function handleAction(sender, action, payload) {
  if (sender === control.webContents) {
    if (action === 'test') {
      if (payload && payload.character) {
        activeTestReminder = {
          reminderCharacter: payload.character,
          userName: payload.userName || settings.userName || 'Friend',
          cheerMessage: payload.cheerMessage || settings.cheerMessage || 'Nice! 💙'
        };
        activeCharacter = payload.character;
      } else {
        const activeReminders = Array.isArray(settings.reminders) && settings.reminders.length > 0
          ? settings.reminders.filter(r => r.enabled !== false)
          : [];
        if (activeReminders.length > 0) {
          activeTestReminder = activeReminders[0];
          activeCharacter = activeReminders[0].reminderCharacter;
        } else {
          activeTestReminder = {
            reminderCharacter: settings.reminderCharacter || 'character1',
            userName: 'Friend',
            cheerMessage: 'Nice! 💙'
          };
          activeCharacter = settings.reminderCharacter || 'character1';
        }
      }
      if (active) {
        const savedTest = activeTestReminder;
        finish();
        activeTestReminder = savedTest;
      }
      present();
    }
    if (action === 'pause') {
      const activeReminders = Array.isArray(settings.reminders) && settings.reminders.length > 0
        ? settings.reminders.filter(r => r.enabled !== false)
        : [];
      if (activeReminders.length > 0) {
        engine.togglePause();
        trayMenu();
        update();
      }
    }
    if (action === 'quit') {
      quitting = true;
      try { globalShortcut.unregisterAll(); } catch {}
      app.exit(0);
    }
    if (action === 'minimize') control.minimize();
    if (action === 'close') control.hide();
    return;
  }
  const cur = currentDisplayedReminder || settings;
  if (sender === character.webContents && action === 'entry-ready' && phase === 'entry') { phase = 'waiting'; bubble.webContents.send('reminder', { name: (cur.userName || 'Friend').trim() }); bubble.showInactive(); }
  if (sender === character.webContents && action === 'exit-done' && phase === 'exit') finish();
  if (sender === character.webContents && action === 'video-error' && active) { character.hide(); bubble.hide(); active = false; phase = 'hidden'; engine.schedule(600000); dialog.showErrorBox('Animation could not play', 'Please reinstall PixelFriend or run npm run convert-assets in the source project.'); }
  if (sender === bubble.webContents && phase === 'waiting' && ['drink', 'snooze'].includes(action)) {
    phase = 'response';
    if (action === 'snooze') exit(true);
    else { bubble.webContents.send('reminder', { response: (cur.cheerMessage || 'Nice! 💙').trim() }); setTimeout(() => { if (active) exit(false); }, 1200); }
  }
}
if (!app.requestSingleInstanceLock()) {
  console.log('Another instance of Vara is already running. Focusing the existing window...');
  app.quit();
} else {
app.on('second-instance', () => { if (control) openControl(); });
app.whenReady().then(async () => {
  try { settings = validate(JSON.parse(fs.readFileSync(prefs(), 'utf8').replace(/^\uFEFF/, ''))); } catch { settings = validate(); }
  try {
    fs.mkdirSync(path.dirname(prefs()), { recursive: true });
    fs.writeFileSync(prefs(), JSON.stringify(settings, null, 2));
  } catch {}
  engine = new ReminderEngine(settings, rem => present(rem));
  const appIconPath = ['assets/icon.ico', 'assets/icon.png'].map(p => path.join(root, p)).find(p => fs.existsSync(p));
  const isAutoStart = process.argv.includes('--autostart');
  control = new BrowserWindow({ width: 960, height: 720, minWidth: 860, minHeight: 640, title: 'Vara — Your 3D Companion', ...(appIconPath ? { icon: appIconPath } : {}), autoHideMenuBar: true, show: !isAutoStart, webPreferences: { ...options, webSecurity: false } });
  control.webContents.on('console-message', (e, level, msg, line, src) => console.log('CONTROL CONSOLE:', msg, 'at line', line, src));
  
  let hasShownTrayTip = false;
  control.on('close', event => {
    if (!quitting) {
      event.preventDefault();
      control.hide();
      if (!hasShownTrayTip && tray) {
        hasShownTrayTip = true;
        try {
          tray.displayBalloon({
            title: 'Vara Companion Active',
            content: 'Vara is running in the background. Your 3D reminders will pop up automatically!'
          });
        } catch {}
      }
    }
  });

  // Sync Windows auto-start on boot
  if (settings.autoStartOnBoot !== false) {
    try {
      setAutoStart(true);
      app.setLoginItemSettings({ openAtLogin: true, openAsHidden: true, path: process.execPath, args: ['.', '--autostart'] });
    } catch (e) {
      console.warn('AutoStart registration:', e);
    }
  }

  const overlay = { frame: false, transparent: true, alwaysOnTop: true, skipTaskbar: true, resizable: false, maximizable: false, hasShadow: false, show: false, webPreferences: options };
  character = new BrowserWindow({ ...overlay, width: 540, height: 304, focusable: false }); character.setIgnoreMouseEvents(true);
  bubble = new BrowserWindow({ ...overlay, width: 480, height: 144, focusable: false });
  character.webContents.on('console-message', (e, level, msg, line, src) => console.log('CHAR CONSOLE:', msg, 'at line', line, src));
  bubble.webContents.on('console-message', (e, level, msg, line, src) => console.log('BUBBLE CONSOLE:', msg, 'at line', line, src));
  for (const win of [control, character, bubble]) secure(win);
  ipcMain.handle('get-state', () => state());
  ipcMain.handle('get-autostart', () => isAutoStartEnabled());
  ipcMain.handle('set-autostart', (event, enable) => {
    const res = setAutoStart(enable);
    try {
      app.setLoginItemSettings({ openAtLogin: Boolean(enable), openAsHidden: true, path: process.execPath, args: ['.', '--autostart'] });
    } catch {}
    return res;
  });
  ipcMain.handle('load-asset', (event, relPath) => {
    const fullPath = path.resolve(root, relPath);
    if (!fullPath.startsWith(root) || !fs.existsSync(fullPath)) return null;
    const buf = fs.readFileSync(fullPath);
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  });
  ipcMain.handle('save-settings', (event, input) => {
    if (event.sender !== control.webContents) throw new Error('Unauthorized settings request');
    const nextSettings = validate(input);
    fs.mkdirSync(path.dirname(prefs()), { recursive: true });
    fs.writeFileSync(prefs() + '.tmp', JSON.stringify(nextSettings, null, 2)); fs.renameSync(prefs() + '.tmp', prefs());
    engine.update(nextSettings); settings = nextSettings; update(); return state();
  });
  ipcMain.on('action', (event, action, payload) => handleAction(event.sender, action, payload));
  ipcMain.handle('create-desktop-shortcut', () => createDesktopShortcut());

  // Register Global Hotkeys to easily view Vara and 3D companion from anywhere in Windows
  try {
    globalShortcut.register('CommandOrControl+Shift+V', toggleControl);
    globalShortcut.register('CommandOrControl+Alt+V', toggleControl);
    globalShortcut.register('CommandOrControl+Shift+Space', () => {
      if (active) finish();
      present();
    });
  } catch (err) {
    console.warn('Failed to register global shortcuts:', err);
  }

  await Promise.all([control.loadFile(path.join(__dirname, 'control.html')), character.loadFile(path.join(__dirname, 'character.html')), bubble.loadFile(path.join(__dirname, 'bubble.html'))]);
  try {
    const icon = appIconPath ? nativeImage.createFromPath(appIconPath) : fallbackIcon;
    tray = new Tray(icon);
    tray.setToolTip('Vara — Your 3D Companion');
    tray.on('double-click', openControl);
    trayMenu();
  } catch (err) {
    console.warn('Tray init error:', err);
  }

  // On startup: Select the reminder corresponding to current time and pop it up
  const initialSched = engine.getCurrentSchedule();
  if (initialSched && initialSched.reminder) {
    currentDisplayedReminder = initialSched.reminder;
    currentReminderIndex = initialSched.index;
    if (!engine.paused && !engine.suspended) {
      setTimeout(() => { if (!active) present(initialSched.reminder); }, 3000);
    }
  }
  setInterval(() => {
    if (++idleSample >= 30) { idleSample = 0; engine.setInactive(settings.pauseWhenInactive && powerMonitor.getSystemIdleTime() >= settings.inactivityThresholdMinutes * 60); }
    engine.tick(); update();
  }, 1000);
  powerMonitor.on('suspend', () => engine.setInactive(true));
  powerMonitor.on('resume', () => { engine.setInactive(settings.pauseWhenInactive && powerMonitor.getSystemIdleTime() >= settings.inactivityThresholdMinutes * 60); });
  if (process.argv.includes('--smoke-test')) {
    for (const win of [control, character, bubble]) { console.log('SMOKE', path.basename(win.webContents.getURL()), await win.webContents.executeJavaScript('({ready:document.readyState,bridge:typeof window.pixelFriend})')); }
    engine.trigger(); setTimeout(() => app.quit(), 12000);
  }
});
}
app.on('before-quit', () => {
  quitting = true;
  try { globalShortcut.unregisterAll(); } catch {}
});
app.on('will-quit', () => {
  try { globalShortcut.unregisterAll(); } catch {}
});
app.on('window-all-closed', () => {});





