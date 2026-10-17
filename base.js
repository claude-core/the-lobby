'use strict';
// base.js — shared foundation carried over from Last Cans: seeded RNG, the
// daily rule (midnight America/New_York) that picks the same evening for
// everyone each day, a persistent store, share flow, and synthesized audio.

// ---------------------------------------------------------------------------
// Seeded RNG
// ---------------------------------------------------------------------------
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
class Rng {
  constructor(seed) { this.f = mulberry32(seed >>> 0); }
  next() { return this.f(); }
  range(a, b) { return a + this.f() * (b - a); }
  int(a, b) { return a + Math.floor(this.f() * (b - a + 1)); }
  chance(p) { return this.f() < p; }
  pick(arr) { return arr[Math.floor(this.f() * arr.length)]; }
  shuffle(arr) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(this.f() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }
}
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;

// ---------------------------------------------------------------------------
// The daily rule. Day # = days since LAUNCH_DATE + 1, rolling at midnight NY.
// ?day=N plays any day as debug (never saved).
// ---------------------------------------------------------------------------
const Daily = {
  LAUNCH_DATE: '2026-10-15',
  fmt: new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
  parts(date) {
    const p = {}; for (const part of this.fmt.formatToParts(date || new Date())) p[part.type] = part.value;
    return { y: +p.year, m: +p.month, d: +p.day, h: (+p.hour) % 24, mi: +p.minute, s: +p.second };
  },
  dayNumber(now) {
    const p = this.parts(now);
    const [ly, lm, ld] = this.LAUNCH_DATE.split('-').map(Number);
    return Math.round((Date.UTC(p.y, p.m - 1, p.d) - Date.UTC(ly, lm - 1, ld)) / 86400000) + 1;
  },
  msUntilNext(now) {
    now = now || new Date();
    const p = this.parts(now);
    return (86400 - (p.h * 3600 + p.mi * 60 + p.s)) * 1000 - now.getMilliseconds();
  },
  countdownText() {
    const s = Math.max(0, Math.floor(this.msUntilNext() / 1000));
    return Math.floor(s / 3600) + ':' + String(Math.floor(s / 60) % 60).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  },
  debug: new URLSearchParams(location.search).get('day'),
  // ?night=<scenario id> plays one scenario as debug (never saved)
  night: new URLSearchParams(location.search).get('night'),
  // day of the week (0 = Sunday) for a day number, counted from LAUNCH_DATE
  weekdayOf(dayNum) { const [ly, lm, ld] = this.LAUNCH_DATE.split('-').map(Number); return new Date(Date.UTC(ly, lm - 1, ld + dayNum - 1)).getUTCDay(); },
  todayNumber() { return this.debug ? Math.max(1, parseInt(this.debug, 10) || 1) : this.dayNumber(); },
  seedFor(dayNum, salt) { return (Math.imul(dayNum, 2654435761) + Math.imul((salt || 0) + 1, 40503) + 7919) >>> 0; },
};

// ---------------------------------------------------------------------------
// Persistent store: lifetime stats plus whatever else the game keeps.
// Every run counts; there is no once-a-day lock.
// ---------------------------------------------------------------------------
class DailyStore {
  constructor(key, defaultStats) {
    this.key = key; this.defaultStats = defaultStats;
    try { this.data = JSON.parse(localStorage.getItem(key)) || {}; } catch (_) { this.data = {}; }
    delete this.data.results; delete this.data.inProgress;     // leftovers from the once-a-day version
    this.data.stats = Object.assign({}, defaultStats, this.data.stats || {});
  }
  save() { try { localStorage.setItem(this.key, JSON.stringify(this.data)); } catch (_) {} }
  get stats() { return this.data.stats; }
}

// ---------------------------------------------------------------------------
// Share: native sheet when available, clipboard otherwise.
// ---------------------------------------------------------------------------
async function shareText(text, onToast) {
  if (navigator.share) {
    try { await navigator.share({ text }); return 'shared'; } catch (e) { if (e && e.name === 'AbortError') return 'cancelled'; }
  }
  try { await navigator.clipboard.writeText(text); if (onToast) onToast('Copied to clipboard'); return 'copied'; }
  catch (_) {
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (__) {}
    ta.remove();
    if (onToast) onToast(ok ? 'Copied to clipboard' : 'Could not copy');
    return ok ? 'copied' : 'failed';
  }
}
function gameUrl() { return location.origin + location.pathname; }

// ---------------------------------------------------------------------------
// Audio: synthesized with Web Audio, unlocked on first touch, mute persisted.
// ---------------------------------------------------------------------------
const Sfx = {
  ctx: null, master: null, muted: false, muteKey: 'muted', muteEl: null,
  setup(muteKey, muteEl) {
    this.muteKey = muteKey; this.muteEl = muteEl;
    this.muted = localStorage.getItem(muteKey) === '1';
    this.renderMute();
    if (muteEl) muteEl.addEventListener('click', e => { e.preventDefault(); this.init(); this.setMuted(!this.muted); });
    const unlock = () => { this.init(); this.resume(); };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('touchend', unlock, { passive: true });
  },
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    this.master.connect(this.ctx.destination);
  },
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  renderMute() { if (this.muteEl) this.muteEl.textContent = this.muted ? '🔇' : '🔊'; },
  setMuted(m) {
    this.muted = m; localStorage.setItem(this.muteKey, m ? '1' : '0');
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
    this.renderMute();
  },
  tone(freq, dur, type, vol, slideTo, delay) {
    if (!this.ctx) return;
    const c = this.ctx, o = c.createOscillator(), g = c.createGain(), t0 = c.currentTime + (delay || 0);
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol || 0.3, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(this.master); o.start(t0); o.stop(t0 + dur + 0.02);
  },
  noise(dur, vol, freq, q, delay) {
    if (!this.ctx) return;
    const c = this.ctx, n = Math.floor(c.sampleRate * dur), t0 = c.currentTime + (delay || 0);
    const buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq || 1000; f.Q.value = q || 1;
    const g = c.createGain(); g.gain.setValueAtTime(vol || 0.2, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(this.master); src.start(t0);
  },
};
