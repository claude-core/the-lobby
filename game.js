'use strict';
// game.js — The Lobby, phase 1: lobby, slots, friends list, invite/kick,
// READY states, Party Vibe, clock, win/lose. Friend content comes from
// friends.js; shared foundation from base.js.
(function () {

const EVENING_MIN = 240;            // 9:00pm → 1:00am
const REAL_SECONDS = 180;           // one evening ≈ 3 real minutes
const MIN_PER_SEC = EVENING_MIN / REAL_SECONDS;
const SLOTS = 5;
const WIN_HOLD = 3;                 // seconds everyone must be ready together
const MATCH_SECONDS = 15;

const $ = id => document.getElementById(id);
const ui = {
  app: $('app'), clock: $('clock'), vibeFill: $('vibe-fill'), vibeLabel: $('vibe-label'), mute: $('mute'),
  list: $('friend-list'), friendCount: $('friend-count'), restart: $('btn-restart'), feed: $('feed'),
  stage: $('stage'), canvas: $('chars'), slots: $('slots'), banner: $('banner'), readyCheck: $('ready-check'), readyCount: $('ready-count'),
  subs: $('subs'), menu: $('menu'), menuTitle: $('menu-title'), menuSub: $('menu-sub'), menuActions: $('menu-actions'), menuResult: $('menu-result'), menuClose: $('menu-close'),
  title: $('screen-title'), titleDay: $('title-day'), titleTwist: $('title-twist'), titleNext: $('title-next'), start: $('btn-start'),
  result: $('screen-result'), resultDay: $('result-day'), resultTitle: $('result-title'), resultBody: $('result-body'), again: $('btn-again'), resultNext: $('result-next'),
  toast: $('toast'),
};
const ctx = ui.canvas.getContext('2d');
Sfx.setup('thelobby_muted', ui.mute);

const Store = new DailyStore('thelobby_v1', { evenings: 0, matches: 0, longestLobby: 0, shaunMatches: 0, shaunLongest: 0, parkerAfk: 0, andreOutbursts: 0 });

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const G = { notices: [], state: 'title', day: 1, mode: 'official', rng: null, t: 0, clock: 0, vibe: 100, friends: {}, lobby: [], subs: [], winT: 0, shake: 0, matchT: 0, matchLine: 0, lobbyMinutes: 0, result: null, bannerT: 0, rcCooldown: 0, log: {} };
let menuTarget = null;

const skinOf = f => SKIN[f.def.look.skin] || f.def.look.skin;
const needed = () => Math.min(SLOTS, ROSTER.length);
const lobbyMembers = () => G.lobby.filter(Boolean).map(id => G.friends[id]);
const freeSlot = () => G.lobby.indexOf(null);
const fmtClock = m => { const h24 = 21 + Math.floor(m / 60), mi = Math.floor(m % 60); const h = ((h24 - 1) % 12) + 1; return h + ':' + String(mi).padStart(2, '0') + ' ' + (h24 >= 24 ? 'AM' : 'PM'); };
const fmtDur = m => { m = Math.round(m); return m >= 60 ? Math.floor(m / 60) + 'h ' + (m % 60) + 'm' : m + 'm'; };
const pick = (rng, arr) => arr && arr.length ? arr[Math.floor(rng.next() * arr.length)] : '';

function makeFriend(id) {
  const def = FRIENDS[id];
  const w = def.online.window;
  return {
    id, def, name: def.name,
    online: false, onlineAt: G.rng.range(w[0], w[1]),
    inLobby: false, ready: false, readyT: 0, invitePending: 0, reinviteT: 0, annoyed: 0,
    patience: def.patience ? def.patience.max : 0, anger: 0, screaming: 0,
    cd: { ping: 0, text: 0, call: 0, calm: 0 }, chatterT: G.rng.range(30, 60), talkT: 0, phase: G.rng.next() * 6.28, blink: 0,
    status: 'Offline', joinedAt: 0, leaves: 0,
    readyHold: 0, waitT: 0, complainT: 0, mood: 'ok', distractT: G.rng.range(10, 18), falseReady: 0, bubble: '', bubbleKind: '', bubbleT: 0,
    outburstT: def.outburst ? G.rng.range(def.outburst.every[0], def.outburst.every[1]) : 0, ignoredT: 0,
  };
}

function startEvening(mode) {
  G.mode = mode || (Daily.debug ? 'debug' : 'official');
  G.day = Daily.todayNumber();
  G.rng = new Rng(Daily.seedFor(G.day, 0));
  G.t = 0; G.clock = 0; G.vibe = 100; G.winT = 0; G.shake = 0; G.matchT = 0; G.matchLine = 0; G.result = null; G.rcCooldown = 0;
  G.subs = []; G.notices = []; ui.feed.innerHTML = ''; G.log = { leaves: 0, screams: 0, kicks: 0, calls: 0, outbursts: 0, unreadies: 0, lines: {} };
  G.friends = {}; for (const id of ROSTER) G.friends[id] = makeFriend(id);
  G.lobby = new Array(SLOTS).fill(null);
  // Justin is already in the lobby at 9:00pm. He is always in the lobby.
  for (const id of ROSTER) if (FRIENDS[id].neverLeaves) { const f = G.friends[id]; setOnline(f, true); joinLobby(f, true); }
  G.state = 'playing';
  ui.title.classList.add('hidden'); ui.result.classList.add('hidden'); ui.app.classList.remove('hidden');
  ui.stage.classList.remove('night', 'match');
  ui.subs.innerHTML = '';
  notice('Party created · need ' + needed() + ' ready');
  buildSlots(); buildList(); resize();
}

// ---------------------------------------------------------------------------
// Subtitles, banners, toasts
// ---------------------------------------------------------------------------
// System events go to the feed in the friends panel so they never cover the voice chat.
function notice(text) {
  G.notices.push(text); if (G.notices.length > 2) G.notices.shift();
  ui.feed.innerHTML = G.notices.map(n => `<div>${esc(n)}</div>`).join('');
}
function say(f, text, kind, noBubble) {
  if (!text) return;
  if (!f) return notice(text);
  if (!noBubble) { f.bubble = text; f.bubbleKind = kind || ''; f.bubbleT = 3; }
  G.subs.push({ who: f ? f.name : null, text, kind: kind || (f ? '' : 'sys'), color: f ? f.def.look.shirt : '' });
  if (G.subs.length > 2) G.subs.shift();
  if (f) { f.talkT = 1.2; G.log.lines[f.id] = (G.log.lines[f.id] || 0) + 1; }
  ui.subs.innerHTML = G.subs.map(s => `<div class="line ${s.kind}">${s.who ? `<b style="color:${s.color}">${s.who}:</b>` : ''}${esc(s.text)}</div>`).join('');
}
function esc(s) { return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
function banner(text, kind, secs) {
  ui.banner.textContent = text; ui.banner.className = kind || ''; ui.banner.classList.remove('hidden');
  G.bannerT = secs || 2.2;
}
let toastT = null;
function toast(msg) { ui.toast.textContent = msg; ui.toast.classList.remove('hidden'); clearTimeout(toastT); toastT = setTimeout(() => ui.toast.classList.add('hidden'), 1800); }

// ---------------------------------------------------------------------------
// Lobby mechanics
// ---------------------------------------------------------------------------
function setOnline(f, quiet) {
  f.online = true; f.status = 'Online';
  if (!quiet) { say(null, f.name + ' is online.'); Sfx.tone(880, 0.08, 'sine', 0.12, 1320); }
}
function invite(f) {
  if (!f.online || f.inLobby || f.invitePending > 0 || freeSlot() < 0 || f.reinviteT > 0) return false;
  const d = f.def.joinDelay;
  f.invitePending = G.rng.range(d[0], d[1]) * (1 + 0.4 * f.annoyed);
  f.status = 'Invited…';
  Sfx.tone(660, 0.07, 'square', 0.08);
  return true;
}
function joinLobby(f, quiet) {
  const s = freeSlot(); if (s < 0) return false;
  G.lobby[s] = f.id; f.inLobby = true; f.ready = false; f.invitePending = 0; f.joinedAt = G.clock;
  const r = f.def.readyTime; f.readyT = G.rng.range(r[0], r[1]) * (1 + 0.3 * f.annoyed);
  if (f.def.patience) f.patience = f.def.patience.max * (1 - 0.15 * f.annoyed);
  f.status = 'In lobby';
  if (!quiet) { say(f, pick(G.rng, f.def.lines.join)); Sfx.tone(520, 0.1, 'triangle', 0.15, 780); G.vibe = clamp(G.vibe + 4, 0, 100); }
  return true;
}
function leaveLobby(f, reason) {
  const s = G.lobby.indexOf(f.id); if (s >= 0) G.lobby[s] = null;
  f.inLobby = false; f.ready = false; f.leaves++; G.log.leaves++;
  f.annoyed = Math.min(3, f.annoyed + 1);
  f.reinviteT = reason === 'kicked' ? 6 : 10;
  f.status = 'Online';
  G.winT = 0;
  if (reason === 'kicked') { say(null, f.name + ' was kicked from the party.'); G.log.kicks++; }
  else { say(f, pick(G.rng, f.def.lines.leave) || 'later'); say(null, f.name + ' left the party.'); banner(f.name + ' left', 'bad', 1.6); G.vibe = clamp(G.vibe - 8, 0, 100); }
  Sfx.tone(440, 0.18, 'sawtooth', 0.12, 220);
}
function setReady(f, on, quiet) {
  if (f.ready === on) return;
  f.ready = on; f.waitT = 0; f.complainT = 0;
  if (on) { const h = f.def.readyHold || [20, 30]; f.readyHold = G.rng.range(h[0], h[1]) * (1 - 0.2 * f.annoyed);
    f.falseReady = G.rng.chance(0.28 + 0.12 * f.def.chaos) ? G.rng.range(2, 6) : 0; const recent = G.t - (f.lastReadyLine || -99) < 25; if (!quiet && !recent) { say(f, pick(G.rng, f.def.lines.ready)); f.lastReadyLine = G.t; } G.vibe = clamp(G.vibe + 8, 0, 100); Sfx.tone(990, 0.1, 'sine', 0.15, 1480); }
  else { G.winT = 0; if (!quiet) Sfx.tone(300, 0.15, 'square', 0.08, 200); }
}
// Someone who was ready gives up waiting: un-readies, complains, and sours the room.
function giveUp(f) {
  setReady(f, false, true); G.log.unreadies++;
  say(f, pick(G.rng, f.def.lines.unready) || 'un-ready', 'complain');
  f.readyT = G.rng.range(4, 8);
  if (f.def.patience) f.patience -= 6;
  G.vibe = clamp(G.vibe - 6, 0, 100);
  Sfx.tone(320, 0.2, 'square', 0.1, 180);
  for (const m of lobbyMembers()) if (m !== f) { if (m.ready && m.def.patience) m.patience -= 4; if (m.def.anger) m.anger += 10; }
}
function outburst(f) {
  const o = f.def.outburst;
  say(f, pick(G.rng, f.def.lines.outburst), 'scream');
  G.log.outbursts++; f.ignoredT = o.ignoreSeconds; G.shake = Math.max(G.shake, 0.35);
  G.vibe = clamp(G.vibe - 5, 0, 100);
  for (const m of lobbyMembers()) if (m !== f) { if (m.def.patience) m.patience -= 8; if (m.def.anger) m.anger += 18; if (m.ready && G.rng.chance(0.5)) { setReady(m, false, true); m.readyT = G.rng.range(3, 6); m.bubble = 'wait what', m.bubbleKind = 'complain', m.bubbleT = 2; } }
  Sfx.noise(0.25, 0.2, 700, 0.8);
}
function ignoredOutburst(f) {
  say(f, pick(G.rng, f.def.lines.ignored), 'scream');
  G.shake = Math.max(G.shake, 0.4); G.vibe = clamp(G.vibe - 6, 0, 100);
  for (const m of lobbyMembers()) if (m !== f) { if (m.def.patience) m.patience -= 6; if (m.def.anger) m.anger += 12; }
}
function startScream(f) {
  const a = f.def.anger;
  f.screaming = a.screamSeconds; f.anger = a.max; G.log.screams++;
  say(f, pick(G.rng, f.def.lines.scream), 'scream');
  banner(f.name.toUpperCase() + ' IS SCREAMING', 'bad', 2.5);
  for (const m of lobbyMembers()) if (m.ready) { setReady(m, false, true); m.readyT = G.rng.range(4, 8); if (m !== f) { m.bubble = '...', m.bubbleKind = 'complain', m.bubbleT = 2; } }
  G.shake = 1; G.vibe = clamp(G.vibe - 12, 0, 100);
  Sfx.noise(0.5, 0.3, 900, 0.8); Sfx.tone(180, 0.6, 'sawtooth', 0.2, 120);
}
function calmDown(f) {
  const a = f.def.anger;
  f.anger = clamp(f.anger - a.calm, 0, a.max);
  if (f.screaming > 0) { f.screaming = 0; G.vibe = clamp(G.vibe + 5, 0, 100); }
  say(f, pick(G.rng, f.def.lines.calmed));
}

function tick(dt) {
  G.t += dt;
  if (G.state === 'match') { tickMatch(dt); return; }
  if (G.state !== 'playing') return;
  G.clock += dt * MIN_PER_SEC;
  if (G.clock >= EVENING_MIN) { G.clock = EVENING_MIN; return endEvening('time'); }
  G.rcCooldown = Math.max(0, G.rcCooldown - dt);
  const members = lobbyMembers();
  const anyNotReady = members.some(m => !m.ready);
  const screamer = members.find(m => m.screaming > 0);

  for (const id of ROSTER) {
    const f = G.friends[id];
    for (const k in f.cd) f.cd[k] = Math.max(0, f.cd[k] - dt);
    f.talkT = Math.max(0, f.talkT - dt);
    f.reinviteT = Math.max(0, f.reinviteT - dt);
    if (!f.online && G.clock >= f.onlineAt) setOnline(f);
    if (f.invitePending > 0) { f.invitePending -= dt; if (f.invitePending <= 0) { f.invitePending = 0; if (!joinLobby(f)) f.status = 'Online'; } }
    if (!f.inLobby) continue;
    f.bubbleT = Math.max(0, f.bubbleT - dt);
    // readying up, and getting antsy once ready
    if (!f.ready) { f.readyT -= dt; if (f.readyT <= 0) setReady(f, true); }
    else if (f.falseReady > 0) { f.falseReady -= dt; if (f.falseReady <= 0) { giveUp(f); continue; } }
    else if (anyNotReady || members.length < needed()) {
      f.waitT += dt; f.readyHold -= dt;
      if (f.waitT > 6 && f.complainT === 0) { f.complainT = 1; say(f, pick(G.rng, f.def.lines.wait), 'complain'); }
      if (f.readyHold < 3 && f.complainT === 1) { f.complainT = 2; say(f, pick(G.rng, f.def.lines.annoyed), 'complain'); }
      if (f.readyHold <= 0) { giveUp(f); continue; }
    }
    // periodic distractions, more for chaotic friends
    f.distractT -= dt;
    if (f.distractT <= 0) { f.distractT = G.rng.range(10, 18); if (f.ready && G.rng.chance(0.1 + 0.15 * f.def.chaos)) { giveUp(f); continue; } }
    // mood from patience
    if (f.def.patience) {
      const low = f.patience < 35;
      if (low && f.mood !== 'annoyed') { f.mood = 'annoyed'; say(f, pick(G.rng, f.def.lines.annoyed), 'complain'); }
      else if (!low && f.mood === 'annoyed') f.mood = 'ok';
    }
    // Andre-style outbursts that must be acknowledged
    if (f.def.outburst) {
      if (f.ignoredT > 0) { f.ignoredT -= dt; if (f.ignoredT <= 0) { ignoredOutburst(f); f.outburstT = G.rng.range(f.def.outburst.every[0], f.def.outburst.every[1]); } }
      else { f.outburstT -= dt; if (f.outburstT <= 0) outburst(f); }
    }
    // patience
    if (f.def.patience) {
      let drain = f.def.patience.drain * (f.ready ? 1.3 : 0.8);
      if (members.length < needed()) drain *= 1.25;                     // waiting on invites
      if (screamer && screamer !== f) drain += 3;
      f.patience -= drain * dt;
      if (f.patience <= 0) { leaveLobby(f, 'patience'); continue; }
    }
    // Justin's anger
    if (f.def.anger) {
      const a = f.def.anger;
      if (f.screaming > 0) {
        f.screaming -= dt; G.vibe -= 2.5 * dt; G.shake = Math.max(G.shake, 0.3);
        if (f.screaming <= 0) { f.anger = a.max * 0.35; f.bubble = 'im fine.'; f.bubbleKind = ''; f.bubbleT = 2; }
      } else {
        let rise = a.rise * (anyNotReady ? 1 : 0.25);
        if (members.length < needed()) rise *= 1.2;
        f.anger += rise * dt;
        if (f.anger >= a.max) startScream(f);
      }
    }
    // idle chatter: rare, and never while something is already going on
    f.chatterT -= dt;
    if (f.chatterT <= 0) { f.chatterT = G.rng.range(40, 75); if (!f.screaming && f.ready && !anyNotReady) say(f, pick(G.rng, f.def.lines.idle), '', true); }
  }

  // party vibe
  let drain = 0.6;
  if (members.length && !members.some(m => m.ready)) drain += 1.1;
  if (members.some(m => m.mood === 'annoyed')) drain += 0.7;
  if (!members.length) drain += 0.5;
  G.vibe -= drain * dt;
  if (G.vibe <= 0) { G.vibe = 0; return endEvening('vibe'); }

  // win check
  if (members.length >= needed() && !anyNotReady) {
    G.winT += dt;
    if (G.winT >= WIN_HOLD) return matchFound();
  } else G.winT = 0;

  if (G.clock > 150) ui.stage.classList.add('night');
}

function matchFound() {
  G.state = 'match'; G.matchT = 0; G.matchLine = 0; G.lobbyMinutes = G.clock;
  banner('MATCH FOUND', 'good', 3);
  ui.stage.classList.add('match');
  Sfx.tone(523, 0.15, 'square', 0.2); Sfx.tone(659, 0.15, 'square', 0.2, 0, 0.15); Sfx.tone(784, 0.3, 'square', 0.25, 0, 0.3);
  const matt = G.friends.matt;
  if (matt && matt.inLobby) setTimeout(() => say(matt, matt.def.lines.matchFound, 'scream'), 600);
  G.shake = 0.6;
}
function tickMatch(dt) {
  G.matchT += dt;
  const want = Math.min(MATCH_LINES.length, Math.floor((G.matchT - 1.5) / (MATCH_SECONDS / MATCH_LINES.length)));
  while (G.matchLine < want) {
    const [id, text] = MATCH_LINES[G.matchLine++];
    const f = G.friends[id];
    if (f && f.inLobby) say(f, text, text === text.toUpperCase() && text.length > 6 ? 'scream' : '');
  }
  if (G.matchT >= MATCH_SECONDS + 2) endEvening('win');
}

function endEvening(kind) {
  G.state = 'over';
  const matchMin = kind === 'win' ? Math.round(MATCH_SECONDS * MIN_PER_SEC) : 0;
  G.result = { kind, day: G.day, mode: G.mode, lobbyMinutes: kind === 'win' ? G.lobbyMinutes : G.clock, matchMinutes: matchMin, log: G.log, vibe: Math.round(G.vibe) };
  if (kind !== 'win') { banner(kind === 'vibe' ? 'Everyone hopped off.' : "It's 1am.", 'bad', 3); Sfx.tone(220, 0.8, 'sawtooth', 0.2, 80); }
  closeMenu();
  setTimeout(showResult, kind === 'win' ? 800 : 2200);
}
function showResult() {
  const r = G.result;
  ui.app.classList.add('hidden');
  ui.resultDay.textContent = 'Evening #' + r.day + (r.mode === 'debug' ? ' · debug' : '');
  const win = r.kind === 'win';
  ui.resultTitle.textContent = win ? 'MATCH FOUND' : r.kind === 'vibe' ? 'GN BOYS' : "IT'S 1AM";
  ui.resultTitle.classList.toggle('lose', !win);
  const mostLines = Object.entries(r.log.lines).sort((a, b) => b[1] - a[1])[0];
  let html = '';
  if (win) html += `<div class="big-num">Lobby: ${fmtDur(r.lobbyMinutes)}. Match: ${fmtDur(r.matchMinutes)}.</div><div>${pick(G.rng, RESULT_LINES.win)}</div>`;
  else html += `<div class="big-num">${r.kind === 'vibe' ? RESULT_LINES.vibe : RESULT_LINES.time}</div><div>Lobby: ${fmtDur(r.lobbyMinutes)}. Match: never.</div>`;
  html += `<div class="row"><span>😤 Justin screamed</span><span>×${r.log.screams}</span></div>`;
  html += `<div class="row"><span>🚪 People left the party</span><span>×${r.log.leaves}</span></div>`;
  html += `<div class="row"><span>🦶 Kicks</span><span>×${r.log.kicks}</span></div>`;
  html += `<div class="row"><span>📢 Andre outbursts</span><span>×${r.log.outbursts}</span></div>`;
  html += `<div class="row"><span>🔴 People un-readied</span><span>×${r.log.unreadies}</span></div>`;
  if (mostLines) html += `<div class="row"><span>🎙️ Most talkative</span><span>${FRIENDS[mostLines[0]].name} (${mostLines[1]} lines)</span></div>`;
  ui.resultBody.innerHTML = html;
  ui.resultNext.textContent = Daily.debug ? 'Debug evening — not saved' : 'Phase 1 build — results are not saved yet';
  ui.result.classList.remove('hidden');
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------
const ACTIONS = {
  invite: { label: 'Invite', hint: 'to the party', cls: 'primary', can: f => f.online && !f.inLobby && f.invitePending <= 0 && freeSlot() >= 0 && f.reinviteT <= 0,
    run: f => { invite(f); return f.name + ' invited. Now we wait.'; } },
  ping: { label: 'Ping', hint: 'free, weak', can: f => f.inLobby && f.cd.ping <= 0,
    run: f => { f.cd.ping = 4; f.readyT -= 2; f.readyHold += 4; if (f.def.anger) f.anger += 4; say(f, pick(G.rng, f.def.lines.ping)); Sfx.tone(1200, 0.05, 'square', 0.1); return 'Pinged ' + f.name + '. A grunt was heard.'; } },
  text: { label: 'Text "chillllll"', hint: 'medium · 20s cooldown', can: f => f.inLobby && f.cd.text <= 0,
    run: f => { f.cd.text = 20; f.readyT -= 4; f.readyHold += 10; f.waitT = 0; if (f.def.patience) f.patience = clamp(f.patience + 12, 0, f.def.patience.max); if (f.def.anger) f.anger = clamp(f.anger - 10, 0, 100); say(f, pick(G.rng, f.def.lines.text)); return f.name + ' read it. Left on read, but read.'; } },
  call: { label: 'Call', hint: 'strong · annoys everyone else', can: f => f.inLobby && f.cd.call <= 0,
    run: f => { f.cd.call = 30; f.readyT = Math.min(f.readyT, 0.5); f.readyHold += 15; f.waitT = 0; G.log.calls++; if (f.def.patience) f.patience = clamp(f.patience + 6, 0, f.def.patience.max);
      for (const m of lobbyMembers()) if (m !== f) { if (m.def.patience) m.patience -= 8; if (m.def.anger) m.anger += 10; }
      say(f, pick(G.rng, f.def.lines.call)); Sfx.tone(700, 0.12, 'sine', 0.12); Sfx.tone(700, 0.12, 'sine', 0.12, 0, 0.25); return 'Called ' + f.name + '. Everyone else heard it ring.'; } },
  calm: { label: 'Calm down, Justin', hint: 'lowers anger', cls: 'fix', can: f => f.inLobby && !!f.def.anger && f.cd.calm <= 0,
    run: f => { f.cd.calm = 8; calmDown(f); return 'Justin took a breath. One breath.'; } },
  listen: { label: "I'm listening, Andre", hint: 'ends the outburst', cls: 'fix', can: f => f.inLobby && !!f.def.outburst && f.ignoredT > 0,
    run: f => { f.ignoredT = 0; f.outburstT = G.rng.range(f.def.outburst.every[0], f.def.outburst.every[1]); say(f, pick(G.rng, f.def.lines.listened)); if (f.def.patience) f.patience = clamp(f.patience + 10, 0, f.def.patience.max); G.vibe = clamp(G.vibe + 4, 0, 100); return 'Andre feels heard. For now.'; } },
  kick: { label: 'Kick', hint: 'frees the slot', cls: 'danger', can: f => f.inLobby,
    run: f => {
      if (f.def.neverLeaves) { f.anger = clamp(f.anger + 25, 0, 100); say(f, f.def.lines.kicked, 'scream'); banner(f.name + ' instantly rejoined', 'bad', 1.8); G.shake = 0.5; return 'Kick failed. He was back before the button finished animating.'; }
      leaveLobby(f, 'kicked'); return f.name + ' kicked. He will remember this.'; } },
};
const ACTION_ORDER = ['invite', 'ping', 'text', 'call', 'calm', 'listen', 'kick'];

let menuButtons = [], menuSig = '';
function menuSignature(f) { return [f.inLobby, !!f.def.anger, !!f.def.outburst].join('|'); }
function openMenu(f) {
  if (G.state !== 'playing') return;
  menuTarget = f;
  ui.menuResult.textContent = '';
  buildMenu(); updateMenu();
  ui.menu.classList.remove('hidden');
}
// Built once per open and updated in place: rebuilding buttons every frame
// swallowed taps on touch screens.
function buildMenu() {
  const f = menuTarget; if (!f) return;
  menuSig = menuSignature(f);
  ui.menuTitle.textContent = f.name;
  ui.menuActions.innerHTML = ''; menuButtons = [];
  for (const key of ACTION_ORDER) {
    const a = ACTIONS[key];
    if (key === 'calm' && !f.def.anger) continue;
    if (key === 'listen' && !f.def.outburst) continue;
    if (key === 'invite' && f.inLobby) continue;
    if (key !== 'invite' && !f.inLobby) continue;
    const b = document.createElement('button'); b.type = 'button'; b.className = a.cls || '';
    b.innerHTML = `${a.label}<small></small>`;
    b.addEventListener('click', e => { e.preventDefault(); if (!a.can(f)) return; ui.menuResult.textContent = a.run(f); updateMenu(); });
    ui.menuActions.appendChild(b);
    menuButtons.push({ key, el: b, small: b.querySelector('small'), lastSmall: '', lastDisabled: null });
  }
}
function updateMenu() {
  const f = menuTarget; if (!f) return;
  if (menuSignature(f) !== menuSig) buildMenu();
  const bits = [f.status];
  if (f.inLobby) bits.push(f.ready ? 'READY' : 'not ready');
  if (f.def.patience && f.inLobby) bits.push('patience ' + Math.round(f.patience) + '%');
  if (f.def.anger) bits.push('anger ' + Math.round(f.anger) + '%');
  if (f.annoyed) bits.push('annoyed ×' + f.annoyed);
  const sub = bits.join(' · ');
  if (ui.menuSub.textContent !== sub) ui.menuSub.textContent = sub;
  for (const mb of menuButtons) {
    const a = ACTIONS[mb.key];
    const cd = f.cd[mb.key] || 0;
    const small = cd > 0 ? 'cooldown ' + Math.ceil(cd) + 's' : (mb.key === 'listen' ? Math.ceil(f.ignoredT) + 's to answer' : a.hint);
    if (small !== mb.lastSmall) { mb.lastSmall = small; mb.small.textContent = small; }
    const dis = !a.can(f);
    if (dis !== mb.lastDisabled) { mb.lastDisabled = dis; mb.el.disabled = dis; }
  }
}
function closeMenu() { ui.menu.classList.add('hidden'); menuTarget = null; }
ui.menuClose.addEventListener('click', e => { e.preventDefault(); closeMenu(); });
ui.menu.addEventListener('click', e => { if (e.target === ui.menu) closeMenu(); });

ui.restart.addEventListener('click', e => {
  e.preventDefault(); if (G.state !== 'playing') return;
  for (const m of lobbyMembers()) { setReady(m, false, true); m.readyT = Math.max(m.readyT, 2) * 0.6; }
  G.vibe = clamp(G.vibe - 5, 0, 100);
  say(null, 'Party restarted. Everyone is un-readied.'); Sfx.tone(400, 0.2, 'triangle', 0.15, 200);
});
ui.readyCheck.addEventListener('click', e => {
  e.preventDefault(); if (G.state !== 'playing' || G.rcCooldown > 0) return;
  G.rcCooldown = 10;
  const members = lobbyMembers();
  const not = members.filter(m => !m.ready);
  for (const m of members) { m.readyT -= 1.5; if (m.def.anger) m.anger += 3; }
  say(null, not.length ? 'Ready check: waiting on ' + not.map(m => m.name).join(', ') + '.' : 'Ready check: everyone is ready!');
  Sfx.tone(880, 0.08, 'square', 0.15); Sfx.tone(1100, 0.08, 'square', 0.15, 0, 0.1);
});

// ---------------------------------------------------------------------------
// DOM rendering: friends list, slots, HUD
// ---------------------------------------------------------------------------
function statusText(f) {
  if (f.inLobby) return f.ready ? 'In lobby · READY' : 'In lobby';
  if (f.invitePending > 0) return 'Joining…';
  if (f.reinviteT > 0) return 'Just left (' + Math.ceil(f.reinviteT) + 's)';
  return f.online ? 'Online' : 'Offline';
}
const listRows = {};
function buildList() {
  ui.list.innerHTML = '';
  for (const id of ROSTER) {
    const f = G.friends[id];
    const li = document.createElement('li');
    li.innerHTML = `<span class="dot"></span><div class="finfo"><div class="fname">${f.name}</div><div class="fstatus"></div></div>`;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'invite';
    b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); if (ACTIONS.invite.can(f)) { ACTIONS.invite.run(f); updateList(); } });
    li.appendChild(b);
    li.addEventListener('click', e => { e.preventDefault(); openMenu(f); });
    ui.list.appendChild(li);
    listRows[id] = { li, dot: li.querySelector('.dot'), status: li.querySelector('.fstatus'), btn: b, last: '' };
  }
}
function updateList() {
  const count = lobbyMembers().length + '/' + needed() + ' in party';
  if (ui.friendCount.textContent !== count) ui.friendCount.textContent = count;
  for (const id of ROSTER) {
    const f = G.friends[id], r = listRows[id]; if (!r) continue;
    const st = statusText(f);
    const dot = f.inLobby ? 'dot lobby' : f.online ? 'dot online' : 'dot';
    const btn = f.inLobby ? 'IN' : f.invitePending > 0 ? '…' : 'INVITE';
    const dis = f.inLobby || f.invitePending > 0 || !ACTIONS.invite.can(f);
    const key = st + '|' + dot + '|' + btn + '|' + dis;
    if (r.last === key) continue;
    r.last = key;
    r.status.textContent = st; r.dot.className = dot;
    r.btn.textContent = btn; r.btn.disabled = dis; r.btn.className = 'invite' + (btn === '…' ? ' pending' : '');
  }
}
const slotEls = [];
function buildSlots() {
  ui.slots.innerHTML = ''; slotEls.length = 0;
  for (let i = 0; i < SLOTS; i++) {
    const d = document.createElement('div'); d.className = 'slot empty';
    d.innerHTML = `<div class="tag"><div class="icon"></div><span class="name"></span><span class="state"></span><div class="bar"><div></div></div></div><div class="bubble hidden"></div>`;
    d.addEventListener('click', e => { e.preventDefault(); const id = G.lobby[i]; if (id) openMenu(G.friends[id]); });
    ui.slots.appendChild(d); slotEls.push(d);
  }
}
function renderHud() {
  ui.clock.textContent = fmtClock(G.clock);
  ui.clock.classList.toggle('late', G.clock > 210);
  ui.vibeFill.style.width = Math.round(G.vibe) + '%';
  const members = lobbyMembers(), readyN = members.filter(m => m.ready).length;
  ui.readyCount.textContent = readyN + ' / ' + needed() + (G.winT > 0 ? ' · ' + Math.ceil(WIN_HOLD - G.winT) : '');
  ui.readyCheck.classList.toggle('all', members.length >= needed() && readyN === members.length);
  ui.readyCheck.disabled = G.rcCooldown > 0;
  for (let i = 0; i < SLOTS; i++) {
    const el = slotEls[i], id = G.lobby[i], f = id ? G.friends[id] : null;
    const bub = el.querySelector('.bubble');
    const bubKey = f && f.bubbleT > 0 ? f.bubble + '|' + f.bubbleKind : '';
    if (bub.dataset.key !== bubKey) { bub.dataset.key = bubKey; if (!bubKey) bub.classList.add('hidden'); else { bub.textContent = f.bubble; bub.className = 'bubble ' + f.bubbleKind; } }
    const waiting = f && f.ready && f.waitT > 4;
    const key = f ? `${f.id}|${f.ready}|${f.screaming > 0}|${f.mood}|${waiting}|${Math.round((f.def.patience ? f.patience : f.anger) / 4)}` : (i < needed() ? 'empty' : 'na');
    if (el.dataset.key === key) continue;
    el.dataset.key = key;
    el.className = 'slot' + (f ? (f.screaming > 0 ? ' screaming' : '') : ' empty');
    const icon = el.querySelector('.icon'), name = el.querySelector('.name'), st = el.querySelector('.state'), bar = el.querySelector('.bar');
    if (!f) { icon.textContent = ''; name.textContent = i < needed() ? 'EMPTY' : '—'; st.textContent = i < needed() ? 'invite someone' : 'phase 2'; bar.style.visibility = 'hidden'; continue; }
    icon.textContent = f.screaming > 0 ? '📢' : f.mood === 'annoyed' && !f.ready ? '😤' : f.ready ? '✅' : '🔴';
    name.textContent = f.name;
    st.textContent = f.screaming > 0 ? 'SCREAMING' : waiting ? 'READY · WAITING…' : f.mood === 'annoyed' ? (f.ready ? 'READY · ANNOYED' : 'ANNOYED') : f.ready ? 'READY' : 'NOT READY';
    st.className = 'state ' + (f.screaming > 0 ? 'notready' : waiting ? 'waiting' : f.mood === 'annoyed' ? 'annoyed' : f.ready ? 'ready' : 'notready');
    bar.style.visibility = 'visible';
    if (f.def.anger) { bar.className = 'bar anger'; bar.firstElementChild.style.width = Math.round(f.anger) + '%'; }
    else { const pct = f.patience / f.def.patience.max * 100; bar.className = 'bar' + (pct < 30 ? ' low' : ''); bar.firstElementChild.style.width = Math.round(pct) + '%'; }
  }
  updateList();
  if (menuTarget && !ui.menu.classList.contains('hidden')) updateMenu();
  if (G.bannerT > 0) { G.bannerT -= 1 / 60; if (G.bannerT <= 0) ui.banner.classList.add('hidden'); }
}

// ---------------------------------------------------------------------------
// Canvas: chunky cartoon friends on the stage
// ---------------------------------------------------------------------------
let dpr = 1, CW = 1, CH = 1;
function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 3);
  const r = ui.stage.getBoundingClientRect();
  CW = Math.max(1, r.width); CH = Math.max(1, r.height);
  ui.canvas.width = Math.round(CW * dpr); ui.canvas.height = Math.round(CH * dpr);
}
window.addEventListener('resize', () => setTimeout(resize, 50));
window.addEventListener('orientationchange', () => setTimeout(resize, 250));

function drawScene() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, CW, CH);
  if (G.state === 'title' || !G.lobby.length) return;
  const shx = G.shake > 0 ? (Math.random() - 0.5) * G.shake * 8 : 0, shy = G.shake > 0 ? (Math.random() - 0.5) * G.shake * 8 : 0;
  G.shake = Math.max(0, G.shake - 1 / 60 * 1.5);
  const slotW = CW / SLOTS;
  const baseY = CH * 0.78 + shy;
  const scale = clamp(Math.min(slotW / 110, CH / 300), 0.6, 1.6);
  for (let i = 0; i < SLOTS; i++) {
    const id = G.lobby[i];
    const cx = slotW * (i + 0.5) + shx;
    if (!id) { drawEmpty(cx, baseY, scale, i < needed()); continue; }
    drawFriend(G.friends[id], cx, baseY, scale);
  }
}
function drawEmpty(cx, baseY, s, active) {
  ctx.save(); ctx.translate(cx, baseY);
  ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.ellipse(0, 6 * s, 34 * s, 9 * s, 0, 0, 7); ctx.fill();
  if (active) {
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.setLineDash([6 * s, 5 * s]); ctx.lineWidth = 2;
    rr(-24 * s, -120 * s, 48 * s, 118 * s, 14 * s); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = `900 ${28 * s}px ${'-apple-system, Helvetica, Arial'}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('+', 0, -62 * s);
  }
  ctx.restore();
}
function rr(x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}
function drawFriend(f, cx, baseY, s) {
  const look = f.def.look, t = G.t, skin = skinOf(f);
  const screaming = f.screaming > 0, talking = f.talkT > 0, ready = f.ready, match = G.state === 'match';
  const bob = Math.sin(t * 2.2 + f.phase) * 2.5 * s + (match ? Math.abs(Math.sin(t * 6 + f.phase)) * -14 * s : 0);
  const sway = Math.sin(t * 1.3 + f.phase) * 0.03;
  ctx.save(); ctx.translate(cx, baseY);
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(0, 6 * s, 34 * s, 9 * s, 0, 0, 7); ctx.fill();
  ctx.translate(0, bob); ctx.rotate(sway);
  ctx.lineJoin = 'round';
  // legs
  ctx.fillStyle = look.pants;
  rr(-20 * s, -46 * s, 17 * s, 48 * s, 7 * s); ctx.fill();
  rr(3 * s, -46 * s, 17 * s, 48 * s, 7 * s); ctx.fill();
  ctx.fillStyle = '#222'; rr(-22 * s, -6 * s, 21 * s, 10 * s, 4 * s); ctx.fill(); rr(1 * s, -6 * s, 21 * s, 10 * s, 4 * s); ctx.fill();
  // body
  ctx.fillStyle = look.shirt; rr(-28 * s, -104 * s, 56 * s, 64 * s, 14 * s); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.12)'; rr(-28 * s, -60 * s, 56 * s, 20 * s, 10 * s); ctx.fill();
  // arms
  const armUp = ready || screaming || match;
  const wave = Math.sin(t * (screaming ? 25 : 3) + f.phase) * (screaming ? 0.25 : 0.08);
  for (const side of [-1, 1]) {
    ctx.save(); ctx.translate(side * 28 * s, -92 * s);
    const up = armUp && (side === 1 || screaming || match);
    ctx.rotate(up ? side * (-2.4 + wave) : side * (0.25 + wave));
    ctx.fillStyle = look.shirt; rr(-7 * s, -4 * s, 14 * s, 44 * s, 7 * s); ctx.fill();
    ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(0, 42 * s, 8 * s, 0, 7); ctx.fill();
    ctx.restore();
  }
  // head
  ctx.fillStyle = skin; rr(-26 * s, -160 * s, 52 * s, 58 * s, 18 * s); ctx.fill();
  // hair
  ctx.fillStyle = look.hairColor;
  if (look.hair === 'medium') { rr(-29 * s, -166 * s, 58 * s, 28 * s, 16 * s); ctx.fill(); rr(-29 * s, -150 * s, 9 * s, 34 * s, 4 * s); ctx.fill(); rr(20 * s, -150 * s, 9 * s, 34 * s, 4 * s); ctx.fill(); }
  else { rr(-27 * s, -165 * s, 54 * s, 20 * s, 14 * s); ctx.fill(); }
  // eyes (blink)
  f.blink -= 1 / 60; if (f.blink <= -0.12) f.blink = 2 + Math.random() * 4;
  const closed = f.blink < 0;
  ctx.fillStyle = '#1b1b1b';
  for (const side of [-1, 1]) {
    if (closed) { ctx.fillRect(side * 10 * s - 4 * s, -132 * s, 8 * s, 2 * s); }
    else { ctx.beginPath(); ctx.ellipse(side * 10 * s, -132 * s, 3.5 * s, screaming ? 5 * s : 4 * s, 0, 0, 7); ctx.fill(); }
  }
  if (look.freckles) { ctx.fillStyle = 'rgba(160,80,40,0.6)'; for (let i = 0; i < 6; i++) ctx.fillRect((-14 + (i % 3) * 10 + (i > 2 ? 4 : 0)) * s, (-122 + (i > 2 ? 4 : 0)) * s, 2 * s, 2 * s); }
  // mouth
  ctx.fillStyle = '#7a2a2a';
  if (screaming) { ctx.beginPath(); ctx.ellipse(0, -112 * s, 9 * s, (7 + Math.sin(t * 30) * 2) * s, 0, 0, 7); ctx.fill(); }
  else if (talking) { ctx.beginPath(); ctx.ellipse(0, -113 * s, 6 * s, (2 + Math.abs(Math.sin(t * 18)) * 4) * s, 0, 0, 7); ctx.fill(); }
  else if (ready || match) { ctx.strokeStyle = '#7a2a2a'; ctx.lineWidth = 2.5 * s; ctx.beginPath(); ctx.arc(0, -118 * s, 8 * s, 0.3, Math.PI - 0.3); ctx.stroke(); }
  else { ctx.fillRect(-6 * s, -114 * s, 12 * s, 2.5 * s); }
  // anger blush
  if (f.def.anger && f.anger > 60) { ctx.fillStyle = `rgba(255,60,40,${(f.anger - 60) / 80})`; rr(-26 * s, -160 * s, 52 * s, 58 * s, 18 * s); ctx.fill(); }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Title / boot / loop
// ---------------------------------------------------------------------------
function boot() {
  G.state = 'title';
  G.day = Daily.todayNumber();
  ui.app.classList.add('hidden'); ui.result.classList.add('hidden');
  ui.titleDay.textContent = 'Evening #' + G.day + (Daily.debug ? ' · debug' : '');
  ui.title.classList.remove('hidden');
  refreshCountdown();
}
function refreshCountdown() {
  if (Daily.debug) { ui.titleNext.textContent = 'Debug evening — results are not saved'; return; }
  ui.titleNext.textContent = 'Phase 1 test build · next evening in ' + Daily.countdownText();
}
setInterval(() => { if (G.state === 'title') refreshCountdown(); }, 1000);
ui.start.addEventListener('click', e => { e.preventDefault(); Sfx.init(); startEvening(); });
ui.again.addEventListener('click', e => { e.preventDefault(); Sfx.init(); startEvening(G.mode === 'debug' ? 'debug' : 'practice'); });

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  tick(dt);
  if (G.state !== 'title') { renderHud(); drawScene(); }
  requestAnimationFrame(frame);
}
resize(); boot();
requestAnimationFrame(frame);

window.LOBBY = { G, startEvening, endEvening, Store, step(ms) { tick(ms / 1000); renderHud(); drawScene(); } };
})();
