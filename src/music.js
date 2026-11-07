import { TRACKS } from './data.js';

const MODES = ['Karışık', 'manifest', 'CRUSH'];
const PLAYING = 1;
const PAUSED = 2;
const ENDED = 0;

function shuffled(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function createMusic({ onTrack, onPlaying, onBlocked, onFailed }) {
  const queues = { manifest: shuffled(TRACKS.manifest), crush: shuffled(TRACKS.crush) };
  let player = null;
  let modeIndex = 0;
  let turn = 0;
  let current = null;
  let playing = false;
  let pausedByUser = false;
  let failures = 0;
  let ready;
  const whenReady = new Promise((resolve) => (ready = resolve));

  function nextTrack() {
    const mode = MODES[modeIndex];
    let band;
    if (mode === 'manifest') band = 'manifest';
    else if (mode === 'CRUSH') band = 'crush';
    else band = turn++ % 2 === 1 ? 'crush' : 'manifest';
    const queue = queues[band];
    const track = queue.shift();
    queue.push(track);
    return track;
  }

  function playNext() {
    if (!player) return;
    current = nextTrack();
    pausedByUser = false;
    onTrack(current[1]);
    player.loadVideoById(current[0]);
  }

  function retryOnTouch() {
    if (player && !playing && !pausedByUser) player.playVideo();
  }

  window.onYouTubeIframeAPIReady = () => {
    current = nextTrack();
    onTrack(current[1]);
    player = new window.YT.Player('ytPlayer', {
      width: '100%',
      height: '100%',
      videoId: current[0],
      playerVars: { playsinline: 1, rel: 0, origin: location.origin },
      events: {
        onReady: () => ready(true),
        onStateChange({ data }) {
          playing = data === PLAYING;
          onPlaying(playing);
          if (playing) {
            failures = 0;
            pausedByUser = false;
          }
          if (data === PAUSED) pausedByUser = true;
          if (data === ENDED) playNext();
        },
        onError() {
          failures += 1;
          if (failures < 6) playNext();
          else onFailed();
        },
      },
    });
  };

  const script = document.createElement('script');
  script.src = 'https://www.youtube.com/iframe_api';
  script.async = true;
  script.onerror = () => ready(false);
  document.head.append(script);
  const timeout = setTimeout(() => ready(false), 12000);

  return {
    async start() {
      const ok = await whenReady;
      clearTimeout(timeout);
      if (!ok) {
        onFailed();
        return;
      }
      player.playVideo();
      document.addEventListener('pointerdown', retryOnTouch);
      setTimeout(() => {
        if (!playing && !pausedByUser) onBlocked();
      }, 3000);
    },
    skip: playNext,
    cycleMode() {
      modeIndex = (modeIndex + 1) % MODES.length;
      playNext();
      return MODES[modeIndex];
    },
  };
}
