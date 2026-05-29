const {
  app,
  BrowserWindow,
  Tray,
  nativeImage,
  ipcMain,
  Menu,
  // nativeTheme,
} = require('electron');
const path = require('path');
const { execSync, exec } = require('child_process');

let tray = null;
let popoverWindow = null;
let pollInterval = null;

// ─── AppleScript helpers ───────────────────────────────────────────────────

function runAS(script) {
  try {
    return execSync(`osascript -e '${script.replace(/'/g, "\\'")}'`, {
      encoding: 'utf8',
      timeout: 3000,
    }).trim();
  } catch {
    return null;
  }
}

function runASAsync(script) {
  return new Promise((resolve) => {
    exec(
      `osascript -e '${script.replace(/'/g, "\\'")}'`,
      { timeout: 5000 },
      (err, stdout) => {
        resolve(err ? null : stdout.trim());
      },
    );
  });
}

function isMusicRunning() {
  try {
    const r = execSync(`pgrep -x Music`, { encoding: 'utf8' }).trim();
    return r.length > 0;
  } catch {
    return false;
  }
}

// ─── Music data fetchers ───────────────────────────────────────────────────

async function getNowPlaying() {
  if (!isMusicRunning()) return null;

  const script = `
    tell application "Music"
      if player state is stopped then return "STOPPED"
      set t to current track
      set artworkData to ""
      try
        set artworkData to data of artwork 1 of t
      end try
      return (get name of t) & "|||" & (get artist of t) & "|||" & (get album of t) & "|||" & (get player position) & "|||" & (get duration of t) & "|||" & (get player state as string) & "|||" & (get sound volume)
    end tell
  `;

  const raw = await runASAsync(script);
  if (!raw || raw === 'STOPPED') return null;

  const [name, artist, album, position, duration, state, volume] =
    raw.split('|||');
  return {
    name: name?.trim(),
    artist: artist?.trim(),
    album: album?.trim(),
    position: parseFloat(position) || 0,
    duration: parseFloat(duration) || 0,
    state: state?.trim(), // playing, paused
    volume: parseInt(volume) || 50,
  };
}

async function getQueue() {
  if (!isMusicRunning()) return [];

  // Get current playlist tracks as a proxy for queue
  const script = `
    tell application "Music"
      set output to ""
      set thePlaylist to current playlist
      set theTracks to tracks of thePlaylist
      set currentName to name of current track
      repeat with t in theTracks
        set output to output & (name of t) & "|||" & (artist of t) & "|||" & (duration of t) & "|||" & (database ID of t as string) & "~~~"
      end repeat
      return output
    end tell
  `;

  const raw = await runASAsync(script);
  if (!raw) return [];

  return raw
    .split('~~~')
    .filter(Boolean)
    .map((line, i) => {
      const [name, artist, duration, id] = line.split('|||');
      return {
        id: id?.trim() || String(i),
        name: name?.trim(),
        artist: artist?.trim(),
        duration: parseFloat(duration) || 0,
      };
    });
}

// ─── Playback controls ─────────────────────────────────────────────────────

ipcMain.handle('play-pause', async () => {
  await runASAsync('tell application "Music" to playpause');
  return getNowPlaying();
});

ipcMain.handle('next', async () => {
  await runASAsync('tell application "Music" to next track');
  return getNowPlaying();
});

ipcMain.handle('prev', async () => {
  await runASAsync('tell application "Music" to previous track');
  return getNowPlaying();
});

ipcMain.handle('set-volume', async (_, vol) => {
  await runASAsync(`tell application "Music" to set sound volume to ${vol}`);
});

ipcMain.handle('seek', async (_, pos) => {
  await runASAsync(`tell application "Music" to set player position to ${pos}`);
});

ipcMain.handle('get-now-playing', async () => {
  return getNowPlaying();
});

ipcMain.handle('get-queue', async () => {
  return getQueue();
});

ipcMain.handle('play-track-by-id', async (_, dbId) => {
  const script = `
    tell application "Music"
      set theTrack to first track of current playlist whose database ID is ${dbId}
      play theTrack
    end tell
  `;
  await runASAsync(script);
  return getNowPlaying();
});

ipcMain.handle('remove-from-queue', async (_, dbId) => {
  // Can't truly remove from queue via AppleScript without playlist mutation
  // Best we can do: delete from current playlist (careful)
  // We'll just return updated queue for now
  return getQueue();
});

ipcMain.handle('shuffle', async () => {
  const current = await runASAsync(
    'tell application "Music" to get shuffle enabled',
  );
  const newVal = current === 'true' ? 'false' : 'true';
  await runASAsync(
    `tell application "Music" to set shuffle enabled to ${newVal}`,
  );
  return newVal === 'true';
});

ipcMain.handle('repeat', async () => {
  const current = await runASAsync(
    'tell application "Music" to get song repeat',
  );
  // cycles: off -> one -> all
  const cycle = { off: 'one', one: 'all', all: 'off' };
  const next = cycle[current] || 'off';
  await runASAsync(`tell application "Music" to set song repeat to ${next}`);
  return next;
});

ipcMain.handle('launch-music', async () => {
  await runASAsync('tell application "Music" to activate');
});

// ─── Window ────────────────────────────────────────────────────────────────

let suppressBlur = false;

function createPopover() {
  popoverWindow = new BrowserWindow({
    width: 380,
    height: 580,
    show: false,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    transparent: true,
    vibrancy: 'under-window',
    visualEffectState: 'active',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  popoverWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  // Guard against the race where blur fires immediately after show
  // (e.g. when opening via Dock click while another app has focus)
  popoverWindow.on('blur', () => {
    if (suppressBlur) return;
    if (popoverWindow?.isVisible()) popoverWindow.hide();
  });
}

function getPopoverPosition() {
  const trayBounds = tray?.getBounds();
  const windowBounds = popoverWindow.getBounds();

  // If tray bounds are valid (non-zero), position below the tray icon
  if (trayBounds && trayBounds.x > 0) {
    return {
      x: Math.round(
        trayBounds.x + trayBounds.width / 2 - windowBounds.width / 2,
      ),
      y: Math.round(trayBounds.y + trayBounds.height + 4),
    };
  }

  // Fallback: top-right corner of the primary display
  const { screen } = require('electron');
  const { width } = screen.getPrimaryDisplay().workAreaSize;
  return { x: width - windowBounds.width - 16, y: 40 };
}

function togglePopover() {
  if (!popoverWindow) return;

  if (popoverWindow.isVisible()) {
    popoverWindow.hide();
    return;
  }

  const { x, y } = getPopoverPosition();
  popoverWindow.setPosition(x, y, false);

  // Suppress blur for 300ms so the window doesn't immediately hide
  // when opened via Dock click (focus settles after a short delay)
  suppressBlur = true;
  popoverWindow.show();
  popoverWindow.focus();
  setTimeout(() => {
    suppressBlur = false;
  }, 300);
}

// ─── Tray ──────────────────────────────────────────────────────────────────

function createTray() {
  const iconPath = path.join(__dirname, '../assets/iconTemplate@2x.png');
  const icon = nativeImage.createFromPath(iconPath);
  // MUST call setTemplateImage so macOS adapts the black PNG for both
  // dark mode (renders white) and light mode (renders black). Without this,
  // the icon is invisible on dark menu bars.
  icon.setTemplateImage(true);

  tray = new Tray(icon);
  tray.setTitle('$'); // text fallback — always visible
  tray.setIgnoreDoubleClickEvents(true);
  tray.setToolTip('MusicBar — click to open');
  tray.on('click', togglePopover);

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open MusicBar', click: togglePopover },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);
  tray.on('right-click', () => tray.popUpContextMenu(contextMenu));
}

// ─── Polling ───────────────────────────────────────────────────────────────

function startPolling() {
  pollInterval = setInterval(async () => {
    if (!popoverWindow?.isVisible()) return;
    const data = await getNowPlaying();
    popoverWindow.webContents.send('now-playing-update', data);
  }, 1000);
}

// ─── App lifecycle ─────────────────────────────────────────────────────────

app.whenReady().then(() => {
  createTray();
  createPopover();
  startPolling();

  // Auto-show the popover on first launch
  popoverWindow.webContents.once('did-finish-load', () => {
    togglePopover();
  });
});

// Dock icon click / app re-activation → toggle popover
app.on('activate', () => {
  togglePopover();
});

app.on('window-all-closed', (e) => {
  e.preventDefault(); // keep running in tray
});

app.on('before-quit', () => {
  clearInterval(pollInterval);
});
