const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('music', {
  // Playback
  playPause: () => ipcRenderer.invoke('play-pause'),
  next: () => ipcRenderer.invoke('next'),
  prev: () => ipcRenderer.invoke('prev'),
  seek: (pos) => ipcRenderer.invoke('seek', pos),

  // Volume
  setVolume: (vol) => ipcRenderer.invoke('set-volume', vol),

  // Data
  getNowPlaying: () => ipcRenderer.invoke('get-now-playing'),
  getQueue: () => ipcRenderer.invoke('get-queue'),

  // Queue actions
  playTrackById: (id) => ipcRenderer.invoke('play-track-by-id', id),
  removeFromQueue: (id) => ipcRenderer.invoke('remove-from-queue', id),

  // Modes
  shuffle: () => ipcRenderer.invoke('shuffle'),
  repeat: () => ipcRenderer.invoke('repeat'),

  // Utils
  launchMusic: () => ipcRenderer.invoke('launch-music'),

  // Events
  onNowPlayingUpdate: (cb) => {
    ipcRenderer.on('now-playing-update', (_, data) => cb(data));
  },
});
