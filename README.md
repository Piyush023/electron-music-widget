# MusicBar 🎵

A local macOS menu bar app to control Music.app from your tray.

## Features
- **Now Playing** — track name, artist, album, live progress bar
- **Playback controls** — play/pause, prev, next, seek
- **Volume control** — slider with live feedback
- **Shuffle & Repeat** — toggle modes
- **Queue view** — see full current playlist, click to jump to track
- **Menu bar icon** — always accessible, click to toggle popover
- **Auto-hides** — click outside to dismiss

## Setup

```bash
npm install
npm start
```

## Requirements
- macOS (uses AppleScript to talk to Music.app)
- Node.js 18+
- Music.app installed (comes with macOS)

## Permissions
On first run, macOS will ask for permission to control Music.app via Automation.
Click **OK** — this is required for all features.

## Project Structure
```
musicbar/
├── src/
│   ├── main.js       # Electron main process, tray, IPC, AppleScript
│   └── preload.js    # Secure IPC bridge (contextBridge)
├── renderer/
│   ├── index.html    # UI shell
│   ├── styles.css    # Dark glassmorphic styles
│   └── app.js        # All UI logic and state
└── package.json
```

## Limitations
- Queue **reordering** (drag to rearrange) is not possible via public AppleScript API
- Works only with **Music.app** (not Spotify — that needs a separate Spotify AppleScript bridge)
- Queue shown is the **current playlist**, not a true playback queue object

## Adding Spotify Support (optional)
Replace the AppleScript calls in `main.js` with Spotify equivalents:
```applescript
tell application "Spotify"
  set current track to ...
  set sound volume to 80
end tell
```
# electron-music-widget
