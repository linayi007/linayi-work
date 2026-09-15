/* =========================================================
   LINA YI — An Immersive Sonic Performance
   Web Audio engine + immersive stage visuals + show logic
   ---------------------------------------------------------
   To use real audio files later: set `src: "audio/xxx.mp3"`
   on a track in WORKS — the player auto-switches from the
   built-in synth demo to file playback.
   ========================================================= */

'use strict';

/* ---------------- Track data ----------------
   light: [r,g,b] stage palette per track (lighting cue)
   mode: particle/light behavior — mist | pulse | fall | beat */
const WORKS = [
  {
    title: 'Desert Lake',
    cat: 'ambient',
    dur: 186,
    desc: 'Field textures over a slow-evolving pad — a study in spatial sound.',
    mood: 'ambient',
    light: [166, 184, 240],
    mode: 'mist',
    src: null,
  },
  {
    title: 'Neon Bloom',
    cat: 'electronic',
    dur: 204,
    desc: 'Generative arps and pulsing bass — an AIGC music experiment.',
    mood: 'electronic',
    light: [255, 107, 156],
    mode: 'pulse',
    src: null,
  },
  {
    title: 'Quiet Keys',
    cat: 'piano',
    dur: 158,
    desc: 'Solo piano miniature — felt piano, tape hiss, room tone.',
    mood: 'piano',
    light: [243, 226, 196],
    mode: 'fall',
    src: null,
  },
  {
    title: 'Half Light',
    cat: 'soundtrack',
    dur: 232,
    desc: 'Film score demo: string-like pads against a heartbeat pulse.',
    mood: 'soundtrack',
    light: [224, 138, 150],
    mode: 'beat',
    src: null,
  },
  {
    title: 'Static Garden',
    cat: 'electronic',
    dur: 176,
    desc: 'Granular loops and syncopated rhythm — sound deconstruction in motion.',
    mood: 'electronic',
    light: [255, 140, 180],
    mode: 'pulse',
    src: null,
  },
  {
    title: 'First Snow',
    cat: 'piano',
    dur: 143,
    desc: 'Sparse piano with long decays. Silence as an instrument.',
    mood: 'piano',
    light: [214, 228, 250],
    mode: 'fall',
    src: null,
  },
];

const DEFAULT_LIGHT = [244, 181, 189];

/* ---------------- Audio engine ---------------- */
class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.analyser = null;
    this.volume = 0.8;
    this.muted = false;

    this.fileEl = null;

    this.synthNodes = [];
    this.synthTimer = null;
    this.startedAt = 0;
    this.pauseOffset = 0;
    this.currentDur = 0;
    this.isPlaying = false;
    this.usingFile = false;
  }

  ensureCtx() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.master.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
      this.master.gain.value = this.volume;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = this.muted ? 0 : v;
    if (this.fileEl) this.fileEl.volume = v;
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
    if (this.fileEl) this.fileEl.muted = this.muted;
    return this.muted;
  }

  play(track, offset = 0) {
    this.ensureCtx();
    this.stopInternal();
    this.currentDur = track.dur;

    if (track.src) {
      this.usingFile = true;
      this.fileEl = new Audio(track.src);
      this.fileEl.crossOrigin = 'anonymous';
      const src = this.ctx.createMediaElementSource(this.fileEl);
      src.connect(this.master);
      this.fileEl.volume = this.volume;
      this.fileEl.muted = this.muted;
      this.fileEl.currentTime = offset;
      this.fileEl.play();
      this.fileEl.onloadedmetadata = () => {
        if (isFinite(this.fileEl.duration)) this.currentDur = this.fileEl.duration;
      };
      this.synthNodes = [src];
    } else {
      this.usingFile = false;
      this.startSynth(track.mood, track.dur, offset);
    }

    this.startedAt = this.ctx.currentTime - offset;
    this.pauseOffset = offset;
    this.isPlaying = true;
  }

  pause() {
    if (!this.isPlaying) return;
    this.pauseOffset = this.getTime();
    this.stopInternal();
    this.isPlaying = false;
  }

  resume(track) {
    this.play(track, this.pauseOffset);
  }

  stopInternal() {
    if (this.fileEl) {
      this.fileEl.pause();
      this.fileEl = null;
    }
    this.synthNodes.forEach(n => { try { n.stop ? n.stop() : n.disconnect(); } catch (e) {} });
    this.synthNodes = [];
    if (this.synthTimer) { clearInterval(this.synthTimer); this.synthTimer = null; }
  }

  getTime() {
    if (!this.isPlaying) return this.pauseOffset;
    if (this.usingFile && this.fileEl) return this.fileEl.currentTime;
    if (!this.ctx) return 0;
    return Math.min(this.ctx.currentTime - this.startedAt, this.currentDur);
  }

  seek(t, track) {
    const clamped = Math.max(0, Math.min(t, this.currentDur - 0.1));
    if (this.isPlaying) this.play(track, clamped);
    else this.pauseOffset = clamped;
  }

  /* ============ Generative synth demos ============ */
  startSynth(mood, dur, offset) {
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(this.master);
    out.gain.linearRampToValueAtTime(0.9, ctx.currentTime + 1.2);
    this.synthNodes.push(out);

    const startFrom = ctx.currentTime;
    const total = dur - offset;

    const builders = {
      ambient:     () => this.buildAmbient(out, startFrom, total),
      electronic:  () => this.buildElectronic(out, startFrom, total),
      piano:       () => this.buildPiano(out, startFrom, total),
      soundtrack:  () => this.buildSoundtrack(out, startFrom, total),
    };
    (builders[mood] || builders.ambient)();

    const endTimer = setTimeout(() => {
      if (this.onEnded) this.onEnded();
    }, total * 1000);
    this.synthNodes.push({ stop: () => clearTimeout(endTimer), disconnect() {} });
  }

  tone(dest, freq, t0, t1, type = 'sine', peak = 0.2) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + Math.min(0.4, (t1 - t0) * 0.3));
    g.gain.linearRampToValueAtTime(0.0001, t1);
    osc.connect(g).connect(dest);
    osc.start(t0);
    osc.stop(t1 + 0.05);
    this.synthNodes.push(osc, g);
  }

  buildAmbient(out, t0, total) {
    const root = 110;
    [1, 1.5, 2, 2.997].forEach((ratio, i) => {
      const seg = 8;
      for (let t = 0; t < total; t += seg) {
        this.tone(out, root * ratio * (i % 2 ? 1.122 : 1), t0 + t, t0 + t + seg + 2, 'sine', 0.09);
      }
    });
    for (let t = 4; t < total; t += 8) {
      this.tone(out, 880, t0 + t, t0 + t + 3.5, 'sine', 0.06);
      this.tone(out, 1320, t0 + t, t0 + t + 2.5, 'sine', 0.025);
    }
  }

  buildElectronic(out, t0, total) {
    const beat = 0.5;
    const bassSeq = [55, 55, 82.4, 65.4, 55, 55, 98, 73.4];
    const arpSeq = [440, 554.4, 659.3, 880, 659.3, 554.4];
    for (let t = 0; t < total; t += beat) {
      const i = Math.round(t / beat);
      if (i % 2 === 0) this.tone(out, bassSeq[(i / 2) % bassSeq.length], t0 + t, t0 + t + 0.42, 'sawtooth', 0.11);
      if (i % 4 === 0) this.tone(out, 60, t0 + t, t0 + t + 0.12, 'sine', 0.32);
      this.tone(out, arpSeq[i % arpSeq.length] * 2, t0 + t, t0 + t + 0.16, 'square', 0.03);
    }
  }

  buildPiano(out, t0, total) {
    const chords = [
      [261.6, 329.6, 392.0],
      [220.0, 261.6, 329.6],
      [174.6, 220.0, 261.6],
      [196.0, 246.9, 293.7],
    ];
    const bar = 3.2;
    for (let t = 0, i = 0; t < total; t += bar, i++) {
      const chord = chords[i % chords.length];
      chord.forEach((f, j) => {
        this.tone(out, f, t0 + t + j * 0.06, t0 + t + bar * 0.95, 'triangle', 0.12);
        this.tone(out, f * 2, t0 + t + j * 0.06, t0 + t + bar * 0.6, 'sine', 0.04);
      });
      const mel = chord[2] * 2;
      this.tone(out, mel, t0 + t + bar * 0.5, t0 + t + bar, 'sine', 0.07);
    }
  }

  buildSoundtrack(out, t0, total) {
    const root = 73.4;
    for (let t = 0; t < total; t += 8) {
      [1, 1.189, 1.498].forEach(r => {
        this.tone(out, root * r * 2, t0 + t, t0 + t + 9, 'sawtooth', 0.035);
        this.tone(out, root * r * 4, t0 + t, t0 + t + 9, 'sine', 0.05);
      });
    }
    for (let t = 0; t < total; t += 1) {
      this.tone(out, 50, t0 + t, t0 + t + 0.1, 'sine', 0.28);
      this.tone(out, 50, t0 + t + 0.22, t0 + t + 0.3, 'sine', 0.18);
    }
  }

  /* average frequency energy 0..1 for stage visuals */
  getEnergy() {
    if (!this.analyser || !this.isPlaying) return 0;
    const arr = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(arr);
    let sum = 0;
    const n = Math.floor(arr.length * 0.7);
    for (let i = 0; i < n; i++) sum += arr[i];
    return sum / (n * 255);
  }

  getAnalyserData(arr) {
    if (!this.analyser) return null;
    this.analyser.getByteFrequencyData(arr);
    return arr;
  }
}

/* ---------------- App state ---------------- */
const engine = new AudioEngine();
let currentIndex = -1;
let visibleIndices = WORKS.map((_, i) => i);

/* ---------------- DOM refs ---------------- */
const $ = id => document.getElementById(id);
const trackList = $('trackList');
const player = $('player');
const playBtn = $('playBtn');
const prevBtn = $('prevBtn');
const nextBtn = $('nextBtn');
const muteBtn = $('muteBtn');
const volumeSlider = $('volumeSlider');
const playerTitle = $('playerTitle');
const playerCat = $('playerCat');
const progressWrap = $('progressWrap');
const progressFill = $('progressFill');
const timeLabel = $('timeLabel');
const vizCanvas = $('vizCanvas');
const stageCanvas = $('stage');
const nav = $('nav');
const heroPlayBtn = $('heroPlayBtn');
const performerVideo = $('performerVideo');
const encoreBtn = $('encoreBtn');
const encoreOverlay = $('encoreOverlay');
const encoreBackdrop = $('encoreBackdrop');
const encoreClose = $('encoreClose');
const performerFigure = document.querySelector('.performer');
const HERO_IDLE = '▶&nbsp; Begin the Performance';

/* ---------------- Helpers ---------------- */
const fmt = s => {
  s = Math.max(0, Math.floor(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/* ---------------- Render programme ---------------- */
function renderTracks() {
  trackList.innerHTML = '';
  WORKS.forEach((w, i) => {
    const li = document.createElement('li');
    li.className = 'track';
    li.dataset.index = i;
    li.dataset.cat = w.cat;
    li.innerHTML = `
      <span class="track__no">${String(i + 1).padStart(2, '0')}</span>
      <button class="track__play" aria-label="Play ${w.title}">▶</button>
      <div class="track__info">
        <div class="track__title">${w.title}</div>
        <div class="track__desc">${w.desc}</div>
      </div>
      <div class="track__eq"><i></i><i></i><i></i><i></i></div>
      <div class="track__meta">
        <span class="track__cat">${w.cat}</span><br/>
        <span>${fmt(w.dur)}</span>
      </div>`;
    li.addEventListener('click', () => onTrackClick(i));
    trackList.appendChild(li);
  });
}

function refreshTrackStates() {
  document.querySelectorAll('.track').forEach(el => {
    const i = Number(el.dataset.index);
    const active = i === currentIndex && engine.isPlaying;
    el.classList.toggle('is-playing', active);
    el.querySelector('.track__play').textContent = active ? '⏸' : '▶';
  });
  heroPlayBtn.innerHTML = engine.isPlaying
    ? '⏸&nbsp; Pause the Performance'
    : HERO_IDLE;
  // she sings while the music plays; the spotlight follows the music
  if (performerVideo) {
    if (engine.isPlaying) {
      const p = performerVideo.play();
      if (p) p.catch(() => {});
    } else {
      performerVideo.pause();
    }
  }
  if (performerFigure) {
    performerFigure.classList.toggle('is-live', engine.isPlaying);
  }
  // lighting cue — switch the stage palette to the current track
  if (engine.isPlaying && currentIndex >= 0) {
    targetLight = WORKS[currentIndex].light || DEFAULT_LIGHT;
    stageMode = WORKS[currentIndex].mode || 'drift';
  } else {
    targetLight = DEFAULT_LIGHT;
    stageMode = 'drift';
  }
}

/* ---------------- Playback control ---------------- */
function playTrack(i, offset = 0) {
  currentIndex = i;
  const track = WORKS[i];
  engine.play(track, offset);
  engine.onEnded = () => nextTrack();
  playerTitle.textContent = track.title;
  playerCat.textContent = track.cat;
  playBtn.textContent = '⏸';
  player.classList.add('is-visible');
  player.setAttribute('aria-hidden', 'false');
  refreshTrackStates();
}

function togglePlay() {
  if (currentIndex < 0) { playTrack(0); return; }
  if (engine.isPlaying) {
    engine.pause();
    playBtn.textContent = '▶';
  } else {
    engine.resume(WORKS[currentIndex]);
    engine.onEnded = () => nextTrack();
    playBtn.textContent = '⏸';
  }
  refreshTrackStates();
}

function onTrackClick(i) {
  if (i === currentIndex) togglePlay();
  else playTrack(i);
}

function stepThroughVisible(dir) {
  if (!visibleIndices.length) return;
  const pos = visibleIndices.indexOf(currentIndex);
  const nextPos = pos < 0
    ? 0
    : (pos + dir + visibleIndices.length) % visibleIndices.length;
  playTrack(visibleIndices[nextPos]);
}

const nextTrack = () => stepThroughVisible(1);
const prevTrack = () => stepThroughVisible(-1);

/* ---------------- Filters ---------------- */
$('filters').addEventListener('click', e => {
  const btn = e.target.closest('.chip');
  if (!btn) return;
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('is-active'));
  btn.classList.add('is-active');
  const f = btn.dataset.filter;

  visibleIndices = [];
  document.querySelectorAll('.track').forEach(el => {
    const match = f === 'all' || el.dataset.cat === f;
    el.classList.toggle('is-hidden', !match);
    if (match) visibleIndices.push(Number(el.dataset.index));
  });
});

/* ---------------- Player events ---------------- */
playBtn.addEventListener('click', togglePlay);
nextBtn.addEventListener('click', nextTrack);
prevBtn.addEventListener('click', prevTrack);

muteBtn.addEventListener('click', () => {
  muteBtn.textContent = engine.toggleMute() ? '🔇' : '🔊';
});

volumeSlider.addEventListener('input', e => {
  engine.setVolume(e.target.value / 100);
  if (engine.muted && e.target.value > 0) {
    engine.muted = false;
    engine.setVolume(e.target.value / 100);
    muteBtn.textContent = '🔊';
  }
});

progressWrap.addEventListener('click', e => {
  if (currentIndex < 0) return;
  const rect = progressWrap.getBoundingClientRect();
  const ratio = (e.clientX - rect.left) / rect.width;
  engine.seek(ratio * engine.currentDur, WORKS[currentIndex]);
});

heroPlayBtn.addEventListener('click', () => {
  if (currentIndex < 0) {
    playTrack(0);
    // jump to her photo — the performance begins
    document.getElementById('about').scrollIntoView({ behavior: 'smooth' });
  } else {
    togglePlay();
  }
});

/* ---------------- Encore reveal ---------------- */
function openEncore() {
  encoreOverlay.classList.add('is-on');
  encoreOverlay.setAttribute('aria-hidden', 'false');
  if (currentIndex < 0) playTrack(0); // the band starts as she returns
}

function closeEncore() {
  encoreOverlay.classList.remove('is-on');
  encoreOverlay.setAttribute('aria-hidden', 'true');
}

if (encoreBtn) {
  encoreBtn.addEventListener('click', openEncore);
  encoreClose.addEventListener('click', closeEncore);
  encoreBackdrop.addEventListener('click', closeEncore);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && encoreOverlay.classList.contains('is-on')) closeEncore();
  });
}

document.addEventListener('keydown', e => {
  const gate = $('gate');
  if (gate && gate.dataset.open === 'false') return;
  if (e.code === 'Space' && !/INPUT|TEXTAREA/.test(e.target.tagName)) {
    e.preventDefault();
    togglePlay();
  }
});

/* ---------------- Progress loop ---------------- */
setInterval(() => {
  if (currentIndex < 0) return;
  const t = engine.getTime();
  const d = engine.currentDur || 1;
  progressFill.style.width = `${Math.min(100, (t / d) * 100)}%`;
  timeLabel.textContent = `${fmt(t)} / ${fmt(d)}`;
}, 150);

/* ---------------- Player visualizer ---------------- */
const vizCtx = vizCanvas.getContext('2d');
const vizData = new Uint8Array(128);

function drawViz() {
  requestAnimationFrame(drawViz);
  const w = vizCanvas.width = vizCanvas.offsetWidth * devicePixelRatio;
  const h = vizCanvas.height = vizCanvas.offsetHeight * devicePixelRatio;
  vizCtx.clearRect(0, 0, w, h);
  if (!engine.isPlaying) return;

  engine.getAnalyserData(vizData);
  const bars = 48;
  const bw = w / bars;
  vizCtx.fillStyle = 'rgba(244, 181, 189, 0.75)';
  for (let i = 0; i < bars; i++) {
    const v = vizData[Math.floor((i / bars) * vizData.length * 0.7)] / 255;
    const bh = Math.max(2, v * h);
    vizCtx.fillRect(i * bw + bw * 0.2, h - bh, bw * 0.6, bh);
  }
}
drawViz();

/* ---------------- Immersive stage (audio-reactive) ---------------- */
const stageCtx = stageCanvas.getContext('2d');
const particles = Array.from({ length: 90 }, () => ({
  x: Math.random(), y: Math.random(),
  r: Math.random() * 2 + 0.4,
  vx: (Math.random() - 0.5) * 0.0006,
  vy: (Math.random() - 0.5) * 0.0006,
  a: Math.random() * 0.5 + 0.15,
}));
let smoothEnergy = 0;

/* lighting cue state */
let targetLight = DEFAULT_LIGHT;
let curLight = [...DEFAULT_LIGHT];
let stageMode = 'drift';

/* note ripples (from the playable piano) */
const ripples = [];
function addRipple(nx, ny) {
  ripples.push({ x: nx, y: ny, r: 0, a: 0.75 });
}

function drawStage(time) {
  requestAnimationFrame(drawStage);
  const dpr = Math.min(devicePixelRatio, 2);
  const w = stageCanvas.width = innerWidth * dpr;
  const h = stageCanvas.height = innerHeight * dpr;
  stageCtx.clearRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h * 0.5;
  const t = time * 0.001;

  // smooth lighting cue transitions
  for (let i = 0; i < 3; i++) curLight[i] += (targetLight[i] - curLight[i]) * 0.035;
  const col = a => `rgba(${curLight[0] | 0},${curLight[1] | 0},${curLight[2] | 0},${a})`;

  // smoothed audio energy (idle breathing when silent)
  const target = engine.isPlaying
    ? engine.getEnergy()
    : 0.12 + Math.sin(t * 0.8) * 0.05;
  smoothEnergy += (target - smoothEnergy) * 0.08;
  const energy = smoothEnergy;

  // radial glow
  const glow = stageCtx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.6);
  glow.addColorStop(0, col(0.06 + energy * 0.22));
  glow.addColorStop(1, col(0));
  stageCtx.fillStyle = glow;
  stageCtx.fillRect(0, 0, w, h);

  // heartbeat factor for soundtrack mode
  const beatPulse = stageMode === 'beat'
    ? 1 + 0.12 * Math.pow(Math.max(0, Math.sin(t * 6.4)), 6)
    : 1;

  // concentric sound rings
  const rings = 5;
  const baseR = Math.min(w, h) * 0.14;
  for (let i = 0; i < rings; i++) {
    const phase = t * (0.25 + i * 0.07);
    const r = (baseR + i * Math.min(w, h) * 0.09 + energy * Math.min(w, h) * 0.16 * Math.sin(phase + i)) * beatPulse;
    const alpha = Math.max(0, 0.16 - i * 0.025) * (0.5 + energy * 2);
    stageCtx.beginPath();
    stageCtx.arc(cx, cy, Math.max(10, r), 0, Math.PI * 2);
    stageCtx.strokeStyle = col(Math.min(alpha, 0.5));
    stageCtx.lineWidth = (1 + energy * 4) * dpr * 0.6;
    stageCtx.stroke();
  }

  // particle behavior per lighting cue
  const speedBase = stageMode === 'mist' ? 0.45 : 1;
  const speedGain = stageMode === 'pulse' ? 10 : 6;
  particles.forEach(p => {
    const vx = p.vx * speedBase * (1 + energy * speedGain);
    const vy = stageMode === 'fall'
      ? 0.0005 + p.vy * 0.3
      : p.vy * speedBase * (1 + energy * speedGain);
    p.x = (p.x + vx + 1) % 1;
    p.y = (p.y + vy + 1) % 1;
    const pr = p.r * (1 + energy * 2.4) * dpr;
    stageCtx.beginPath();
    stageCtx.arc(p.x * w, p.y * h, pr, 0, Math.PI * 2);
    stageCtx.fillStyle = col(Math.min(p.a * (0.4 + energy * 2.2), 0.9));
    stageCtx.fill();
  });

  // expanding note ripples
  for (let i = ripples.length - 1; i >= 0; i--) {
    const rp = ripples[i];
    rp.r += 3.2 * dpr;
    rp.a *= 0.945;
    if (rp.a < 0.02) { ripples.splice(i, 1); continue; }
    stageCtx.beginPath();
    stageCtx.arc(rp.x * w, rp.y * h, rp.r, 0, Math.PI * 2);
    stageCtx.strokeStyle = col(rp.a);
    stageCtx.lineWidth = 1.4 * dpr;
    stageCtx.stroke();
  }
}
requestAnimationFrame(drawStage);

/* ---------------- Kinetic typography ---------------- */
document.querySelectorAll('.kinetic').forEach(el => {
  const text = el.textContent;
  el.textContent = '';
  [...text].forEach((ch, i) => {
    const span = document.createElement('span');
    span.className = 'char';
    span.style.setProperty('--d', `${i * 0.045}s`);
    span.textContent = ch === ' ' ? ' ' : ch;
    el.appendChild(span);
  });
});

/* ---------------- Act dots ---------------- */
const actsNav = $('acts');
const scenes = document.querySelectorAll('.scene[data-act]');
scenes.forEach(scene => {
  const dot = document.createElement('button');
  dot.className = 'acts__dot';
  dot.dataset.act = scene.dataset.act;
  dot.setAttribute('aria-label', scene.dataset.act);
  dot.addEventListener('click', () => {
    scene.scrollIntoView({ behavior: 'smooth' });
  });
  actsNav.appendChild(dot);
});

const actIO = new IntersectionObserver(entries => {
  entries.forEach(en => {
    if (!en.isIntersecting) return;
    const act = en.target.dataset.act;
    document.querySelectorAll('.acts__dot').forEach(d => {
      d.classList.toggle('is-active', d.dataset.act === act);
    });
  });
}, { threshold: 0.4 });
scenes.forEach(s => actIO.observe(s));

/* ---------------- Nav + reveal on scroll ---------------- */
window.addEventListener('scroll', () => {
  nav.classList.toggle('is-scrolled', window.scrollY > 40);
}, { passive: true });

const io = new IntersectionObserver(entries => {
  entries.forEach(en => {
    if (en.isIntersecting) {
      en.target.classList.add('is-in');
      io.unobserve(en.target);
    }
  });
}, { threshold: 0.15 });
document.querySelectorAll('.reveal, .kinetic').forEach(el => io.observe(el));

/* ---------------- Playable piano ---------------- */
const PIANO_NOTES = [
  { f: 261.63, key: 'a', black: false },
  { f: 277.18, key: 'w', black: true, afterWhite: 0 },
  { f: 293.66, key: 's', black: false },
  { f: 311.13, key: 'e', black: true, afterWhite: 1 },
  { f: 329.63, key: 'd', black: false },
  { f: 349.23, key: 'f', black: false },
  { f: 369.99, key: 't', black: true, afterWhite: 3 },
  { f: 392.00, key: 'g', black: false },
  { f: 415.30, key: 'y', black: true, afterWhite: 4 },
  { f: 440.00, key: 'h', black: false },
  { f: 466.16, key: 'u', black: true, afterWhite: 5 },
  { f: 493.88, key: 'j', black: false },
  { f: 523.25, key: 'k', black: false },
];

function playNote(freq) {
  engine.ensureCtx();
  const t0 = engine.ctx.currentTime;
  engine.tone(engine.master, freq, t0, t0 + 1.4, 'triangle', 0.22);
  engine.tone(engine.master, freq * 2, t0, t0 + 0.8, 'sine', 0.06);
  addRipple(0.3 + Math.random() * 0.4, 0.3 + Math.random() * 0.3);
}

(function buildPiano() {
  const wrap = $('pianoKeys');
  if (!wrap) return;
  const whiteCount = PIANO_NOTES.filter(n => !n.black).length;

  PIANO_NOTES.forEach(note => {
    const b = document.createElement('button');
    b.className = 'pkey' + (note.black ? ' pkey--black' : '');
    b.dataset.freq = note.f;
    b.dataset.key = note.key;
    b.setAttribute('aria-label', `Piano key ${note.key.toUpperCase()}`);
    if (note.black) {
      b.style.left = `calc(${((note.afterWhite + 1) / whiteCount) * 100}% - 3.5%)`;
    }
    const press = e => {
      e.preventDefault();
      playNote(note.f);
      b.classList.add('is-down');
      setTimeout(() => b.classList.remove('is-down'), 160);
    };
    b.addEventListener('pointerdown', press);
    wrap.appendChild(b);
  });

  document.addEventListener('keydown', e => {
    if (e.repeat || /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    const note = PIANO_NOTES.find(n => n.key === e.key.toLowerCase());
    if (!note) return;
    playNote(note.f);
    const el = wrap.querySelector(`[data-key="${note.key}"]`);
    if (el) {
      el.classList.add('is-down');
      setTimeout(() => el.classList.remove('is-down'), 160);
    }
  });
})();

/* ---------------- Mouse spotlight ---------------- */
(function initSpotlight() {
  const spot = $('spotlight');
  if (!spot || !matchMedia('(hover: hover)').matches) return;
  document.addEventListener('mousemove', e => {
    spot.style.setProperty('--mx', `${e.clientX}px`);
    spot.style.setProperty('--my', `${e.clientY}px`);
  }, { passive: true });
})();

/* ---------------- Ticket gate ---------------- */
(function initGate() {
  const gate = $('gate');
  const enter = $('gateEnter');
  if (!gate || !enter) return;

  // block spacebar play until the gate is torn
  gate.dataset.open = 'false';

  enter.addEventListener('click', () => {
    gate.querySelector('.gate__ticket').classList.add('is-torn');
    // a small welcoming motif — the click unlocks the audio context
    engine.ensureCtx();
    const t0 = engine.ctx.currentTime;
    engine.tone(engine.master, 261.63, t0, t0 + 1.2, 'triangle', 0.16);
    engine.tone(engine.master, 329.63, t0 + 0.16, t0 + 1.4, 'triangle', 0.14);
    engine.tone(engine.master, 392.0, t0 + 0.32, t0 + 1.8, 'triangle', 0.14);
    setTimeout(() => {
      gate.classList.add('is-open');
      gate.dataset.open = 'true';
    }, 450);
  });
})();

/* ---------------- Init ---------------- */
renderTracks();
