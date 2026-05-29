// ─── State ─────────────────────────────────────────────────────────────────
const state = {
  playing: false,
  position: 0,
  duration: 0,
  volume: 50,
  shuffleOn: false,
  repeatMode: 'off', // off | one | all
  currentTrackName: null,
  queue: [],
  seekDragging: false,
  volDragging: false,
};

// ─── DOM refs ──────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

const els = {
  tabs: document.querySelectorAll('.tab'),
  panels: document.querySelectorAll('.panel'),

  // now playing
  notPlaying: $('not-playing'),
  playerView: $('player-view'),
  artwork: $('artwork'),
  trackName: $('track-name'),
  trackArtist: $('track-artist'),
  trackAlbum: $('track-album'),
  currentTime: $('current-time'),
  totalTime: $('total-time'),
  progressBar: $('progress-bar'),
  progressFill: $('progress-fill'),
  progressThumb: $('progress-thumb'),

  // controls
  playBtn: $('play-btn'),
  playIcon: $('play-icon'),
  pauseIcon: $('pause-icon'),
  prevBtn: $('prev-btn'),
  nextBtn: $('next-btn'),
  shuffleBtn: $('shuffle-btn'),
  repeatBtn: $('repeat-btn'),

  // volume
  volumeSlider: $('volume-slider'),
  volLabel: $('vol-label'),

  // queue
  queueList: $('queue-list'),
  refreshQueue: $('refresh-queue'),

  // launch
  launchBtn: $('launch-btn'),
};

// ─── Helpers ───────────────────────────────────────────────────────────────
function formatTime(secs) {
  if (!secs || isNaN(secs)) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function setProgress(pct) {
  const p = Math.max(0, Math.min(100, pct));
  els.progressFill.style.width = `${p}%`;
  els.progressThumb.style.left = `${p}%`;
}

function setVolumeUI(vol) {
  els.volumeSlider.value = vol;
  els.volLabel.textContent = vol;
  els.volumeSlider.style.setProperty('--vol-pct', `${vol}%`);
}

// ─── Update UI from now-playing data ──────────────────────────────────────
function applyNowPlaying(data) {
  if (!data) {
    els.notPlaying.style.display = 'flex';
    els.playerView.style.display = 'none';
    return;
  }

  els.notPlaying.style.display = 'none';
  els.playerView.style.display = 'flex';

  // Track info
  if (data.name !== state.currentTrackName) {
    state.currentTrackName = data.name;
    els.trackName.textContent = data.name || '—';
    els.trackArtist.textContent = data.artist || '—';
    els.trackAlbum.textContent = data.album || '—';

    // Reset artwork placeholder on track change
    const img = els.artwork.querySelector('img');
    if (img) img.remove();
  }

  // State
  state.playing = data.state === 'playing';
  state.duration = data.duration;

  // Play/pause icon
  els.playIcon.style.display = state.playing ? 'none' : 'block';
  els.pauseIcon.style.display = state.playing ? 'block' : 'none';

  // Progress (only if not dragging)
  if (!state.seekDragging) {
    state.position = data.position;
    const pct = data.duration > 0 ? (data.position / data.duration) * 100 : 0;
    setProgress(pct);
    els.currentTime.textContent = formatTime(data.position);
    els.totalTime.textContent = formatTime(data.duration);
  }

  // Volume (only if not dragging)
  if (!state.volDragging) {
    state.volume = data.volume;
    setVolumeUI(data.volume);
  }
}

// ─── Tabs ──────────────────────────────────────────────────────────────────
els.tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    els.tabs.forEach((t) => t.classList.remove('active'));
    els.panels.forEach((p) => p.classList.remove('active'));
    tab.classList.add('active');
    $(`${tab.dataset.tab}`).classList.add('active');

    if (tab.dataset.tab === 'queue') {
      loadQueue();
    }
  });
});

// ─── Controls ──────────────────────────────────────────────────────────────
els.playBtn.addEventListener('click', async () => {
  const data = await window.music.playPause();
  applyNowPlaying(data);
});

els.prevBtn.addEventListener('click', async () => {
  const data = await window.music.prev();
  applyNowPlaying(data);
});

els.nextBtn.addEventListener('click', async () => {
  const data = await window.music.next();
  applyNowPlaying(data);
});

els.shuffleBtn.addEventListener('click', async () => {
  const on = await window.music.shuffle();
  state.shuffleOn = on;
  els.shuffleBtn.classList.toggle('active', on);
});

els.repeatBtn.addEventListener('click', async () => {
  const mode = await window.music.repeat();
  state.repeatMode = mode;
  updateRepeatUI(mode);
});

function updateRepeatUI(mode) {
  els.repeatBtn.classList.toggle('active', mode !== 'off');
  els.repeatBtn.title = `Repeat: ${mode}`;
}

// ─── Seek ──────────────────────────────────────────────────────────────────
let seekTimeout = null;

els.progressBar.addEventListener('mousedown', (e) => {
  state.seekDragging = true;
  updateSeekFromEvent(e);
});

document.addEventListener('mousemove', (e) => {
  if (!state.seekDragging) return;
  updateSeekFromEvent(e);
});

document.addEventListener('mouseup', async (e) => {
  if (!state.seekDragging) return;
  state.seekDragging = false;
  clearTimeout(seekTimeout);
  const rect = els.progressBar.getBoundingClientRect();
  const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  const newPos = pct * state.duration;
  await window.music.seek(newPos);
});

function updateSeekFromEvent(e) {
  const rect = els.progressBar.getBoundingClientRect();
  const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  const newPos = pct * state.duration;
  setProgress(pct * 100);
  els.currentTime.textContent = formatTime(newPos);
}

// ─── Volume ────────────────────────────────────────────────────────────────
els.volumeSlider.addEventListener('mousedown', () => { state.volDragging = true; });
document.addEventListener('mouseup', () => { state.volDragging = false; });

let volTimeout = null;
els.volumeSlider.addEventListener('input', () => {
  const vol = parseInt(els.volumeSlider.value);
  setVolumeUI(vol);
  clearTimeout(volTimeout);
  volTimeout = setTimeout(() => {
    window.music.setVolume(vol);
  }, 60);
});

// ─── Launch Music ──────────────────────────────────────────────────────────
els.launchBtn?.addEventListener('click', () => {
  window.music.launchMusic();
});

// ─── Queue ─────────────────────────────────────────────────────────────────
async function loadQueue() {
  els.queueList.innerHTML = '<div class="queue-loading">Loading…</div>';

  // Spin refresh icon
  els.refreshQueue.classList.add('spinning');
  setTimeout(() => els.refreshQueue.classList.remove('spinning'), 400);

  const [queue, nowPlaying] = await Promise.all([
    window.music.getQueue(),
    window.music.getNowPlaying(),
  ]);

  state.queue = queue;
  renderQueue(queue, nowPlaying?.name);
}

function renderQueue(queue, currentName) {
  if (!queue || queue.length === 0) {
    els.queueList.innerHTML = '<div class="queue-loading">Queue is empty or Music is not running.</div>';
    return;
  }

  // Find current track index
  const currentIdx = queue.findIndex((t) => t.name === currentName);

  els.queueList.innerHTML = '';
  queue.forEach((track, i) => {
    const isCurrent = i === currentIdx;
    const item = document.createElement('div');
    item.className = `queue-item${isCurrent ? ' current' : ''}`;
    item.dataset.id = track.id;
    item.dataset.index = i;

    item.innerHTML = `
      <div class="queue-item-num">
        ${isCurrent
          ? `<div class="playing-dots"><span></span><span></span><span></span></div>`
          : `${i + 1}`
        }
      </div>
      <div class="queue-item-info">
        <div class="queue-item-name">${escapeHtml(track.name || '—')}</div>
        <div class="queue-item-artist">${escapeHtml(track.artist || '—')}</div>
      </div>
      <div class="queue-item-dur">${formatTime(track.duration)}</div>
      <div class="queue-item-actions">
        <button class="queue-action-btn play-track-btn" title="Play now">▶</button>
      </div>
    `;

    // Double-click or play button → play track
    const playBtn = item.querySelector('.play-track-btn');
    playBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const data = await window.music.playTrackById(parseInt(track.id));
      applyNowPlaying(data);
      // Re-render queue with new current
      renderQueue(state.queue, data?.name);
      // Switch to now playing tab
      switchTab('now-playing');
    });

    item.addEventListener('dblclick', async () => {
      const data = await window.music.playTrackById(parseInt(track.id));
      applyNowPlaying(data);
      renderQueue(state.queue, data?.name);
      switchTab('now-playing');
    });

    els.queueList.appendChild(item);
  });

  // Scroll current track into view
  const currentEl = els.queueList.querySelector('.current');
  if (currentEl) {
    currentEl.scrollIntoView({ block: 'nearest' });
  }
}

function switchTab(tabId) {
  els.tabs.forEach((t) => {
    t.classList.toggle('active', t.dataset.tab === tabId);
  });
  els.panels.forEach((p) => {
    p.classList.toggle('active', p.id === tabId);
  });
}

els.refreshQueue.addEventListener('click', loadQueue);

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Live updates from main process ───────────────────────────────────────
window.music.onNowPlayingUpdate((data) => {
  applyNowPlaying(data);
});

// ─── Init ──────────────────────────────────────────────────────────────────
async function init() {
  const data = await window.music.getNowPlaying();
  applyNowPlaying(data);
}

init();
