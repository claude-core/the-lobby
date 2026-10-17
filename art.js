'use strict';
// art.js — everything drawn on canvas: the friends (moods, idle animations,
// problem props, beam-in and glitch-out), portraits, the lobby stage (night
// sky, rising moon, skyline whose windows go dark through the evening, the
// stage floor and the five platforms), the title and result lineups, and the
// share card. Pure drawing: game.js decides what to draw. No jokes here.
const Art = (() => {
  const FONT = '"Bungee", "Arial Black", Impact, sans-serif';
  const skinOf = look => SKIN[look.skin] || look.skin;
  const ease = k => 1 - Math.pow(1 - clamp(k, 0, 1), 3);

  function rr(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath(); c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h); c.lineTo(x + r, y + h);
    c.quadraticCurveTo(x, y + h, x, y + h - r); c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
  }
  function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function mix(a, b, k) { const A = hexRgb(a), B = hexRgb(b); return `rgb(${A.map((v, i) => Math.round(lerp(v, B[i], k))).join(',')})`; }

  // ------------------------------------------------------------------ head
  // o: { t, tilt, closed, spiral, screaming, talking, smile, angerK, afk }
  function head(c, look, s, o) {
    const t = o.t || 0, ty = (o.tilt || 0) * s;
    c.fillStyle = skinOf(look); rr(c, -26 * s, -160 * s + ty * 0.3, 52 * s, 58 * s, 18 * s); c.fill();
    c.fillStyle = look.hairColor;
    if (look.hair === 'medium') { rr(c, -29 * s, -166 * s, 58 * s, 28 * s, 16 * s); c.fill(); rr(c, -29 * s, -150 * s, 9 * s, 34 * s, 4 * s); c.fill(); rr(c, 20 * s, -150 * s, 9 * s, 34 * s, 4 * s); c.fill(); }
    else { rr(c, -27 * s, -165 * s, 54 * s, 20 * s, 14 * s); c.fill(); }
    if (look.cap) { c.fillStyle = look.cap; rr(c, -29 * s, -172 * s, 58 * s, 20 * s, 10 * s); c.fill(); rr(c, -44 * s, -158 * s, 22 * s, 6 * s, 3 * s); c.fill(); }
    // eyes
    const ey = -132 * s + ty;
    c.fillStyle = '#1b1b1b'; c.strokeStyle = '#1b1b1b';
    for (const side of [-1, 1]) {
      const ex = side * 10 * s;
      if (o.spiral) {
        c.lineWidth = 1.4 * s; c.beginPath();
        for (let a = 0; a < 12; a += 0.4) { const r = a * 0.5 * s, ang = a + t * 6 * side; const px = ex + Math.cos(ang) * r, py = ey + Math.sin(ang) * r; a === 0 ? c.moveTo(px, py) : c.lineTo(px, py); }
        c.stroke();
      } else if (o.closed || o.afk) c.fillRect(ex - 4 * s, ey, 8 * s, 2 * s);
      else { c.beginPath(); c.ellipse(ex, ey + (o.tilt ? 1.5 * s : 0), 3.5 * s, o.screaming ? 5 * s : 4 * s, 0, 0, 7); c.fill(); }
    }
    if (look.freckles) { c.fillStyle = 'rgba(160,80,40,0.6)'; for (let i = 0; i < 6; i++) c.fillRect((-14 + (i % 3) * 10 + (i > 2 ? 4 : 0)) * s, (-122 + (i > 2 ? 4 : 0)) * s + ty * 0.5, 2 * s, 2 * s); }
    // mouth
    c.fillStyle = '#7a2a2a'; c.strokeStyle = '#7a2a2a';
    const my = ty * 0.5;
    if (o.screaming) { c.beginPath(); c.ellipse(0, -112 * s, 9 * s, (7 + Math.sin(t * 30) * 2) * s, 0, 0, 7); c.fill(); }
    else if (o.talking) { c.beginPath(); c.ellipse(0, -113 * s + my, 6 * s, (2 + Math.abs(Math.sin(t * 18)) * 4) * s, 0, 0, 7); c.fill(); }
    else if (o.frown) { c.lineWidth = 2.5 * s; c.beginPath(); c.arc(0, -108 * s, 7 * s, Math.PI + 0.5, -0.5); c.stroke(); }
    else if (o.smile) { c.lineWidth = 2.5 * s; c.beginPath(); c.arc(0, -118 * s + my, 8 * s, 0.3, Math.PI - 0.3); c.stroke(); }
    else c.fillRect(-6 * s, -114 * s + my, 12 * s, 2.5 * s);
    // anger: red face and steam
    const ak = o.angerK || 0;
    if (ak > 0.6) { c.fillStyle = `rgba(255,50,30,${Math.min(0.55, (ak - 0.6) * 1.3)})`; rr(c, -26 * s, -160 * s, 52 * s, 58 * s, 18 * s); c.fill(); }
    if (ak > 0.45) {
      const n = 2 + Math.round((ak - 0.45) * 8);
      for (let i = 0; i < n; i++) {
        const k = (t * 0.9 + i / n) % 1, side = i % 2 ? 1 : -1;
        c.fillStyle = `rgba(255,255,255,${(1 - k) * Math.min(0.7, (ak - 0.35) * 1.4)})`;
        c.beginPath(); c.arc(side * (22 + k * 12) * s, (-160 - k * 42) * s, (4 + k * 7) * s, 0, 7); c.fill();
      }
    }
    if (o.afk) { c.fillStyle = 'rgba(255,255,255,0.9)'; c.font = `900 ${14 * s}px -apple-system, Helvetica, Arial`; c.textAlign = 'left'; c.textBaseline = 'alphabetic'; c.fillText('z', 26 * s, -150 * s + Math.sin(t * 2) * 3 * s); c.fillText('Z', 34 * s, -164 * s + Math.sin(t * 2 + 1) * 3 * s); }
  }

  // ---------------------------------------------------------------- avatar
  // p: { t, phase, ready, screaming, talking, afk, match, annoyed, waiting, closed,
  //      spiral, bottle, megaphone, angerK, download (0..1), icon, alpha,
  //      spawn (0..1 beam-in), glitch (0..1 glitch-out), kick (0..1 kicked out) }
  function avatar(c, look, x, y, s, p) {
    const t = p.t || 0, ph = p.phase || 0, skin = skinOf(look);
    let alpha = p.alpha === undefined ? 1 : p.alpha;
    c.save(); c.translate(x, y);
    if (p.spawn !== undefined && p.spawn < 1) beam(c, s, p.spawn);
    if (p.kick !== undefined) { const k = p.kick, dir = ph > 3 ? 1 : -1; c.translate(k * 90 * s * dir, -k * k * 260 * s); c.rotate(k * 5 * dir); alpha *= 1 - k; }
    if (p.glitch !== undefined) { alpha *= 1 - p.glitch; c.translate((Math.random() - 0.5) * 30 * s * p.glitch, 0); }
    c.globalAlpha = alpha * 0.35; c.fillStyle = '#000'; c.beginPath(); c.ellipse(0, 2 * s, 30 * s, 7 * s, 0, 0, 7); c.fill();
    c.globalAlpha = alpha * (p.afk ? 0.4 : 1);
    if (p.spawn !== undefined && p.spawn < 1) { const k = ease(p.spawn); c.scale(0.5 + 0.5 * k, Math.max(0.05, k)); }
    const bob = Math.sin(t * 2.2 + ph) * 2.5 * s + (p.match ? -Math.abs(Math.sin(t * 6 + ph)) * 14 * s : 0) + (p.afk ? Math.sin(t * 1.5 + ph) * 4 * s - 8 * s : 0);
    const sway = p.screaming ? Math.sin(t * 30) * 0.04 : Math.sin(t * 1.3 + ph) * 0.03 + (p.bottle ? Math.sin(t * 2 + ph) * 0.07 : 0);
    c.save(); c.translate(0, bob); c.rotate(sway); c.lineJoin = 'round';
    // legs: the left foot taps while waiting
    const tap = p.waiting ? Math.max(0, Math.sin(t * 9 + ph)) * 5 * s : 0;
    c.fillStyle = look.pants; rr(c, -20 * s, -46 * s - tap, 17 * s, 48 * s, 7 * s); c.fill(); rr(c, 3 * s, -46 * s, 17 * s, 48 * s, 7 * s); c.fill();
    c.fillStyle = '#222'; rr(c, -22 * s, -6 * s - tap, 21 * s, 10 * s, 4 * s); c.fill(); rr(c, 1 * s, -6 * s, 21 * s, 10 * s, 4 * s); c.fill();
    // body
    c.fillStyle = look.shirt; rr(c, -28 * s, -104 * s, 56 * s, 64 * s, 14 * s); c.fill();
    c.fillStyle = 'rgba(0,0,0,0.12)'; rr(c, -28 * s, -60 * s, 56 * s, 20 * s, 10 * s); c.fill();
    // arms, by pose
    const mode = p.screaming ? 'up' : p.match ? 'up' : p.afk ? 'down' : p.megaphone ? 'megaphone' : p.waiting ? 'phone' : p.annoyed ? 'crossed' : p.ready ? 'controller' : 'down';
    const wave = Math.sin(t * (p.screaming ? 25 : 3) + ph) * (p.screaming ? 0.25 : 0.08);
    const angle = side => {
      switch (mode) {
        case 'up': return side * (-2.4 + wave);
        case 'controller': return side === 1 ? -2.5 + wave * 0.5 : side * (0.25 + wave);
        case 'phone': return -side * 0.62;
        case 'crossed': return -side * 0.95;
        case 'megaphone': return side === 1 ? -1.75 + Math.sin(t * 14) * 0.08 : side * (0.25 + wave);
        default: return side * (0.25 + wave);
      }
    };
    const hands = {};
    for (const side of [-1, 1]) {
      const a = angle(side);
      c.save(); c.translate(side * 28 * s, -92 * s); c.rotate(a);
      c.fillStyle = look.shirt; rr(c, -7 * s, -4 * s, 14 * s, 44 * s, 7 * s); c.fill();
      c.fillStyle = skin; c.beginPath(); c.arc(0, 42 * s, 8 * s, 0, 7); c.fill();
      c.restore();
      hands[side] = { x: side * 28 * s - 42 * s * Math.sin(a), y: -92 * s + 42 * s * Math.cos(a) };
    }
    // things in hand
    if (mode === 'controller') { const h = hands[1]; c.fillStyle = '#26262e'; rr(c, h.x - 14 * s, h.y - 9 * s, 28 * s, 15 * s, 7 * s); c.fill(); c.fillStyle = '#4ade80'; c.fillRect(h.x + 5 * s, h.y - 4 * s, 3 * s, 3 * s); c.fillStyle = '#ff5a5a'; c.fillRect(h.x + 9 * s, h.y - 1 * s, 3 * s, 3 * s); c.fillStyle = '#aaa'; c.fillRect(h.x - 9 * s, h.y - 3 * s, 6 * s, 2 * s); c.fillRect(h.x - 7 * s, h.y - 5 * s, 2 * s, 6 * s); }
    if (mode === 'phone') { c.fillStyle = '#111'; rr(c, -8 * s, -78 * s, 16 * s, 25 * s, 3 * s); c.fill(); c.fillStyle = 'rgba(126,200,255,0.95)'; rr(c, -6.5 * s, -76 * s, 13 * s, 20 * s, 2 * s); c.fill(); }
    if (mode === 'megaphone') {
      const h = hands[1], pulse = 1 + Math.sin(t * 14) * 0.08;
      c.save(); c.translate(h.x, h.y); c.scale(pulse, pulse);
      c.fillStyle = '#f2f2f2'; c.beginPath(); c.moveTo(-2 * s, -5 * s); c.lineTo(26 * s, -16 * s); c.lineTo(26 * s, 14 * s); c.lineTo(-2 * s, 5 * s); c.closePath(); c.fill();
      c.fillStyle = '#ff5a5a'; c.fillRect(22 * s, -16 * s, 5 * s, 30 * s);
      c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 2 * s;
      const ba = c.globalAlpha;
      for (let i = 0; i < 3; i++) { const k = (t * 2.5 + i / 3) % 1; c.globalAlpha = (1 - k) * ba; c.beginPath(); c.arc(28 * s, -1 * s, (8 + k * 22) * s, -0.8, 0.8); c.stroke(); }
      c.restore();
    }
    if (p.bottle) { const h = hands[-1]; c.fillStyle = '#3fae5a'; rr(c, h.x - 5 * s, h.y - 20 * s, 10 * s, 24 * s, 3 * s); c.fill(); rr(c, h.x - 2 * s, h.y - 29 * s, 4 * s, 10 * s, 1.5 * s); c.fill(); c.fillStyle = 'rgba(255,255,255,0.7)'; c.fillRect(h.x - 3 * s, h.y - 12 * s, 6 * s, 5 * s); }
    head(c, look, s, { t, tilt: mode === 'phone' ? 4 : 0, closed: p.closed, spiral: p.spiral, screaming: p.screaming, talking: p.talking, smile: (p.ready || p.match) && !p.annoyed, frown: p.annoyed, angerK: p.angerK, afk: p.afk });
    if (mode === 'phone') { c.fillStyle = 'rgba(126,200,255,0.16)'; rr(c, -22 * s, -128 * s, 44 * s, 26 * s, 10 * s); c.fill(); }
    c.restore();
    // overlays above the head
    c.globalAlpha = Math.min(1, alpha);
    const top = -192 * s + bob;
    if (p.download !== undefined && p.download !== null) {
      const w = 66 * s, h = 10 * s;
      c.fillStyle = 'rgba(0,0,0,0.65)'; rr(c, -w / 2, top, w, h, h / 2); c.fill();
      c.fillStyle = '#5ac8ff'; rr(c, -w / 2, top, Math.max(h, w * p.download), h, h / 2); c.fill();
      c.fillStyle = '#fff'; c.font = `800 ${8 * s}px -apple-system, Helvetica, Arial`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('⬇ ' + Math.floor(p.download * 100) + '%', 0, top + h / 2 + 0.5);
    } else if (p.icon) {
      c.font = `${22 * s}px -apple-system, "Apple Color Emoji", sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(p.icon, 0, top + 4 * s + Math.sin(t * 3 + ph) * 3 * s);
    }
    if (p.glitch !== undefined) {
      for (let i = 0; i < 4; i++) { c.fillStyle = i % 2 ? 'rgba(90,200,255,0.55)' : 'rgba(255,60,140,0.55)'; c.fillRect(-40 * s + (Math.random() - 0.5) * 20 * s, -Math.random() * 170 * s, 80 * s, 3 * s + Math.random() * 4 * s); }
    }
    c.restore();
  }
  function beam(c, s, k) {
    const a = 1 - k, g = c.createLinearGradient(0, 0, 0, -240 * s);
    g.addColorStop(0, `rgba(140,220,255,${0.65 * a})`); g.addColorStop(1, 'rgba(140,220,255,0)');
    c.fillStyle = g; c.fillRect(-36 * s, -240 * s, 72 * s, 240 * s);
    c.fillStyle = `rgba(255,255,255,${0.8 * a})`; c.fillRect(-4 * s, -240 * s, 8 * s, 240 * s);
  }

  // ------------------------------------------------------------- portraits
  const pcache = {};
  function portrait(look, size) {
    const key = JSON.stringify(look) + '|' + size;
    if (pcache[key]) return pcache[key];
    const d = 3, cv = document.createElement('canvas'); cv.width = cv.height = size * d;
    const c = cv.getContext('2d'); c.scale(d, d);
    c.fillStyle = mix(look.shirt, '#000000', 0.35); c.beginPath(); c.arc(size / 2, size / 2, size / 2, 0, 7); c.fill();
    c.save(); c.beginPath(); c.arc(size / 2, size / 2, size / 2, 0, 7); c.clip();
    const s = size * 0.78 / 70;
    c.translate(size / 2, size * 0.54 + 133 * s);
    c.fillStyle = look.shirt; rr(c, -30 * s, -104 * s, 60 * s, 70 * s, 14 * s); c.fill();
    head(c, look, s, { smile: true });
    c.restore();
    return (pcache[key] = cv.toDataURL());
  }

  // ------------------------------------------------------------ the stage
  let sky = { key: '', b: [] };
  function skyline(W, H, horizon) {
    const key = W + 'x' + H + 'x' + Math.round(horizon);
    if (sky.key === key) return sky.b;
    const r = new Rng(4242), b = []; let x = -8;
    const sc = clamp(H / 330, 0.7, 2.2);
    while (x < W + 8) {
      const w = r.range(26, 64) * sc, h = r.range(0.14, 0.36) * horizon;
      const wins = [];
      for (let i = 0; 5 + i * 9 * sc + 4 * sc < w - 3; i++) for (let j = 0; 8 + j * 11 * sc + 6 * sc < h - 4; j++) if (r.chance(0.72)) wins.push({ x: 5 * sc + i * 9 * sc, y: 8 * sc + j * 11 * sc, k: r.next() });
      b.push({ x, w, h, tone: r.next(), wins, antenna: r.chance(0.22) });
      x += w + r.range(-3, 5) * sc;
    }
    sky = { key, b }; return b;
  }
  // o: { clock (0..240), horizon (y), match }
  function background(c, W, H, o) {
    const k = clamp((o.clock || 0) / 240, 0, 1), hz = o.horizon, sc = clamp(H / 330, 0.7, 2.2);
    const g = c.createLinearGradient(0, 0, 0, hz);
    if (o.match) { g.addColorStop(0, '#1a0b3d'); g.addColorStop(0.6, '#5b2a9b'); g.addColorStop(1, '#ff7b39'); }
    else { g.addColorStop(0, mix('#1c2a66', '#05070f', k)); g.addColorStop(0.65, mix('#3d3f86', '#111633', k)); g.addColorStop(1, mix('#b0607a', '#2a2147', k)); }
    c.fillStyle = g; c.fillRect(0, 0, W, hz + 1);
    const r = new Rng(77);
    for (let i = 0; i < 90; i++) { const sx = r.next() * W, sy = r.next() * hz * 0.85, th = r.next(), a = 0.25 + r.next() * 0.55; if (th < 0.25 + k * 0.7) { c.fillStyle = `rgba(255,255,255,${a})`; c.fillRect(sx, sy, 1.4 * sc, 1.4 * sc); } }
    // the moon rises as the evening goes on
    const mr = 16 * sc, mx = W * (0.88 - 0.2 * k), my = hz - mr - (0.05 + 0.7 * k) * (hz - mr * 2);
    const mg = c.createRadialGradient(mx, my, mr * 0.5, mx, my, mr * 4); mg.addColorStop(0, 'rgba(255,244,201,0.35)'); mg.addColorStop(1, 'rgba(255,244,201,0)');
    c.fillStyle = mg; c.beginPath(); c.arc(mx, my, mr * 4, 0, 7); c.fill();
    c.fillStyle = '#fff4c9'; c.beginPath(); c.arc(mx, my, mr, 0, 7); c.fill();
    c.fillStyle = 'rgba(200,190,150,0.5)'; c.beginPath(); c.arc(mx - mr * 0.3, my - mr * 0.2, mr * 0.22, 0, 7); c.arc(mx + mr * 0.35, my + mr * 0.3, mr * 0.15, 0, 7); c.fill();
    // skyline: windows switch off one by one from 9pm to 1am
    for (const b of skyline(W, H, hz)) {
      const top = hz - b.h;
      c.fillStyle = mix('#161a38', '#23285a', b.tone); c.fillRect(b.x, top, b.w, b.h + 1);
      if (b.antenna) { c.fillRect(b.x + b.w / 2 - sc, top - 12 * sc, 2 * sc, 12 * sc); c.fillStyle = '#ff4d4d'; c.fillRect(b.x + b.w / 2 - 1.5 * sc, top - 14 * sc, 3 * sc, 3 * sc); }
      for (const w of b.wins) {
        const lit = w.k > k * 0.94;
        c.fillStyle = lit ? (w.k > 0.94 ? 'rgba(160,210,255,0.85)' : 'rgba(255,214,120,0.85)') : 'rgba(0,0,0,0.25)';
        c.fillRect(b.x + w.x, top + w.y, 4 * sc, 6 * sc);
      }
    }
    if (o.haze) { c.fillStyle = o.haze; c.fillRect(0, 0, W, H); }
    // the stage floor
    const fg = c.createLinearGradient(0, hz, 0, H); fg.addColorStop(0, '#30366c'); fg.addColorStop(0.3, '#1b1f45'); fg.addColorStop(1, '#0b0e22');
    c.fillStyle = fg; c.fillRect(0, hz, W, H - hz);
    c.fillStyle = 'rgba(255,210,63,0.8)'; c.fillRect(0, hz, W, 2 * sc);
    c.strokeStyle = 'rgba(130,150,255,0.10)'; c.lineWidth = 1;
    for (let i = -8; i <= 8; i++) { c.beginPath(); c.moveTo(W / 2 + i * W * 0.05, hz); c.lineTo(W / 2 + i * W * 0.2, H); c.stroke(); }
    for (const fx of [0.15, 0.5, 0.85]) {
      const lg = c.createLinearGradient(0, 0, 0, H); lg.addColorStop(0, 'rgba(255,255,255,0.07)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = lg; c.beginPath(); c.moveTo(W * fx - 6, 0); c.lineTo(W * fx + 6, 0); c.lineTo(W * fx + W * 0.12, H); c.lineTo(W * fx - W * 0.12, H); c.closePath(); c.fill();
    }
  }
  // Rain streaks and lightning flashes over the stage. vis: { rain, lightning }
  function weather(c, W, H, t, vis) {
    if (vis.lightning) {
      const p = t % 6.5;
      const a = p < 0.08 ? 0.35 : p > 0.18 && p < 0.24 ? 0.22 : 0;
      if (a) { c.fillStyle = `rgba(220,230,255,${a})`; c.fillRect(0, 0, W, H); }
    }
    if (vis.rain) {
      c.strokeStyle = 'rgba(170,200,255,0.35)'; c.lineWidth = 1.2; c.beginPath();
      for (let i = 0; i < 70; i++) {
        const speed = 380 + (i * 37) % 160, x0 = (i * 97.3) % (W + 60) - 30;
        const y = ((t * speed + i * 113) % (H + 40)) - 20, x = x0 - (y / H) * 30;
        c.moveTo(x, y); c.lineTo(x - 4, y + 13);
      }
      c.stroke();
    }
  }
  // state: 'off' | 'open' | 'notready' | 'ready' | 'blocker' | 'codered'; o: { t, pulse, focus }
  function platform(c, x, y, s, state, o) {
    const t = (o && o.t) || 0, rx = 46 * s, ry = 12 * s, th = 9 * s;
    const rim = { ready: '#4ade80', blocker: '#ffd23f', codered: '#ff5a5a', notready: '#59609a', open: 'rgba(255,255,255,0.35)', off: 'rgba(255,255,255,0.12)' }[state] || '#59609a';
    c.save();
    if (state === 'ready') {
      const g = c.createLinearGradient(0, y, 0, y - 170 * s); g.addColorStop(0, 'rgba(74,222,128,0.28)'); g.addColorStop(1, 'rgba(74,222,128,0)');
      c.fillStyle = g; c.beginPath(); c.moveTo(x - rx * 0.9, y); c.lineTo(x - rx * 0.6, y - 170 * s); c.lineTo(x + rx * 0.6, y - 170 * s); c.lineTo(x + rx * 0.9, y); c.closePath(); c.fill();
    }
    c.fillStyle = '#0d1026'; c.beginPath(); c.ellipse(x, y + th, rx, ry, 0, 0, 7); c.fill();
    c.fillRect(x - rx, y, rx * 2, th);
    const tg = c.createLinearGradient(0, y - ry, 0, y + ry); tg.addColorStop(0, '#363d78'); tg.addColorStop(1, '#1d2148');
    c.fillStyle = tg; c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, 7); c.fill();
    let glow = state === 'ready' || state === 'blocker' || state === 'codered' ? 1 : 0;
    if (state === 'blocker' || state === 'codered') glow = 0.6 + 0.4 * Math.sin(t * 9);
    if (o && o.pulse) glow = Math.max(glow, 0.7 + 0.3 * Math.sin(t * 14));
    if (o && o.focus) glow = Math.max(glow, 0.8);
    c.lineWidth = (state === 'off' || state === 'open' ? 1.5 : 3) * s;
    if (state === 'open') c.setLineDash([6 * s, 5 * s]);
    c.strokeStyle = o && o.focus && state !== 'ready' ? '#ffffff' : rim;
    if (glow) { c.shadowColor = c.strokeStyle; c.shadowBlur = 16 * s * glow; }
    c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, 7); c.stroke();
    c.shadowBlur = 0; c.setLineDash([]);
    c.globalAlpha = 0.45; c.beginPath(); c.ellipse(x, y + th, rx, ry, 0, 0.15, Math.PI - 0.15); c.stroke(); c.globalAlpha = 1;
    if (state === 'open') { c.fillStyle = 'rgba(255,255,255,0.55)'; c.font = `${30 * s}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('+', x, y - 60 * s); }
    c.restore();
  }

  // --------------------------------------------------------------- lineups
  // entries: [{ look, name, trail: [emoji], pose, platform }]
  // o: { t, labels, labelSize, trailSize, maxScale }
  function lineup(c, W, H, entries, o) {
    const n = entries.length; if (!n) return;
    const slot = W / n, labelH = o.labels ? (o.labelSize || 10) + 8 : 4;
    const trailRows = entries.some(e => e.trail && e.trail.length) ? Math.min(2, Math.ceil(Math.max(...entries.map(e => (e.trail || []).length)) / 4)) : 0;
    const trailH = trailRows * (o.trailSize || 14) * 1.15;
    const s = Math.min(o.maxScale || 2, slot / 118, (H - labelH - trailH - 14) / 196);
    const baseY = H - labelH - 10 * s;
    entries.forEach((e, i) => {
      const x = slot * (i + 0.5);
      platform(c, x, baseY, s * 0.82, e.platform || 'notready', { t: o.t });
      avatar(c, e.look, x, baseY, s, Object.assign({ t: o.t, phase: i * 1.7 + 0.4 }, e.pose || {}));
      if (o.labels) {
        c.fillStyle = '#fff'; c.font = `${o.labelSize || 10}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'top';
        c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 4; c.fillText(e.name.toUpperCase(), x, baseY + 14 * s); c.shadowBlur = 0;
      }
      const tr = e.trail || [];
      if (tr.length) {
        const fs = o.trailSize || 14, per = 4, rows = [];
        const shown = tr.length > per * 2 ? tr.slice(0, per * 2 - 1).concat('…') : tr;
        for (let j = 0; j < shown.length; j += per) rows.push(shown.slice(j, j + per).join(''));
        c.font = `${fs}px -apple-system, "Apple Color Emoji", sans-serif`; c.textAlign = 'center'; c.textBaseline = 'bottom';
        rows.forEach((row, j) => c.fillText(row, x, baseY - 186 * s - (rows.length - 1 - j) * fs * 1.12));
      }
    });
  }

  // ----------------------------------------------------------- share card
  // o: { title, lines: [string], entries, url, clock, win }
  function shareCard(o) {
    const W = 1200, H = 675, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const c = cv.getContext('2d');
    background(c, W, H, { clock: o.clock, horizon: H * 0.6, match: o.win });
    const shade = c.createLinearGradient(0, 0, 0, H * 0.4); shade.addColorStop(0, 'rgba(6,8,20,0.85)'); shade.addColorStop(1, 'rgba(6,8,20,0)');
    c.fillStyle = shade; c.fillRect(0, 0, W, H * 0.4);
    c.textAlign = 'left'; c.textBaseline = 'top';
    c.fillStyle = '#ffd23f'; c.font = `58px ${FONT}`; c.shadowColor = '#7a5a00'; c.shadowOffsetY = 4; c.fillText(o.title, 48, 34);
    c.shadowColor = 'rgba(0,0,0,0.7)'; c.shadowOffsetY = 2; c.shadowBlur = 6;
    c.fillStyle = '#fff'; c.font = '700 30px -apple-system, Helvetica, Arial, "Apple Color Emoji"';
    (o.lines || []).forEach((l, i) => c.fillText(l, 50, 112 + i * 40));
    c.shadowBlur = 0; c.shadowOffsetY = 0;
    c.save(); c.translate(20, H * 0.3); lineup(c, W - 40, H * 0.66, o.entries, { t: 0.6, labels: true, labelSize: 18, trailSize: 30, maxScale: 1.25 }); c.restore();
    c.fillStyle = 'rgba(255,255,255,0.75)'; c.font = '600 20px -apple-system, Helvetica, Arial'; c.textAlign = 'right'; c.textBaseline = 'bottom';
    c.fillText(o.url, W - 28, H - 18);
    return cv;
  }

  // ------------------------------------------------------- the map preview
  function mapSVG() {
    return '<svg viewBox="0 0 160 90" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">' +
      '<rect width="160" height="90" fill="#1d6fae"/>' +
      '<path d="M26 52 C22 28 52 12 80 18 C108 10 140 26 136 50 C142 70 112 84 84 76 C56 86 28 76 26 52Z" fill="#ead292"/>' +
      '<path d="M33 52 C31 33 56 21 80 25 C103 17 129 31 127 50 C132 65 109 74 84 69 C60 78 36 69 33 52Z" fill="#5db35b"/>' +
      '<path d="M50 30 C64 40 74 30 82 42 C90 54 104 44 118 58" stroke="#2c86c9" stroke-width="4" fill="none" stroke-linecap="round"/>' +
      '<rect x="78" y="37" width="12" height="6" rx="1" fill="#c8ced9"/>' +
      '<g fill="#3c8a3e"><circle cx="48" cy="58" r="5"/><circle cx="58" cy="64" r="4"/><circle cx="104" cy="32" r="5"/><circle cx="112" cy="40" r="4"/></g>' +
      '<g fill="#8a8fa3"><rect x="94" y="58" width="6" height="5"/><rect x="102" y="62" width="5" height="4"/><rect x="62" y="30" width="6" height="5"/></g>' +
      '</svg>';
  }

  return { FONT, rr, avatar, head, portrait, background, weather, platform, lineup, shareCard, mapSVG };
})();
