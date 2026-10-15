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
  menu: $('menu'), menuTitle: $('menu-title'), menuSub: $('menu-sub'), menuActions: $('menu-actions'), menuResult: $('menu-result'), menuClose: $('menu-close'),
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
const G = { notices: [], vote: null, state: 'title', day: 1, mode: 'official', rng: null, t: 0, clock: 0, vibe: 100, friends: {}, lobby: [], subs: [], winT: 0, shake: 0, matchT: 0, matchLine: 0, lobbyMinutes: 0, result: null, bannerT: 0, rcCooldown: 0, log: {} };
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
    issue: null, afk: false, broken: false, readyMul: 1, deadlineAt: null, gone: false, goneStatus: '', disconnected: false, dcT: 0,
    sneaking: false, sneakFrom: 0, sneakDef: null, late: null, schedule: [], issuesHad: 0, afkRantT: 0, wanderT: 0, wanderBack: 0, sojuT: 0, voteT: 0,
    shaun: def.codeRed ? { windowT: G.rng.range(def.windowSeconds[0], def.windowSeconds[1]), appeared: false, left: false, daysAway: G.rng.int(def.daysAway[0], def.daysAway[1]), stayed: 0, appearedAt: 0 } : null,
  };
}

function startEvening(mode) {
  G.mode = mode || (Daily.debug ? 'debug' : 'official');
  G.day = Daily.todayNumber();
  G.rng = new Rng(Daily.seedFor(G.day, 0));
  G.t = 0; G.clock = 0; G.vibe = 100; G.winT = 0; G.shake = 0; G.matchT = 0; G.matchLine = 0; G.result = null; G.rcCooldown = 0;
  G.subs = []; G.notices = []; ui.feed.innerHTML = ''; G.log = { leaves: 0, screams: 0, kicks: 0, calls: 0, outbursts: 0, unreadies: 0, lines: {}, issues: {}, afk: {}, caught: false, withShaun: false };
  G.friends = {}; for (const id of ROSTER) G.friends[id] = makeFriend(id);
  for (const id of ROSTER) scheduleIssues(G.friends[id]);
  G.vote = null;
  G.lobby = new Array(SLOTS).fill(null);
  // Justin is already in the lobby at 9:00pm. He is always in the lobby.
  for (const id of ROSTER) if (FRIENDS[id].neverLeaves) { const f = G.friends[id]; setOnline(f, true); joinLobby(f, true); }
  G.state = 'playing';
  ui.title.classList.add('hidden'); ui.result.classList.add('hidden'); ui.app.classList.remove('hidden');
  ui.stage.classList.remove('night', 'match');
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
  f.talkT = 1.2; G.log.lines[f.id] = (G.log.lines[f.id] || 0) + 1;
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
  if (reason === 'dc' || reason === 'gone') { f.status = 'Online'; G.winT = 0; if (f.issue && f.issue.def.type !== 'disconnect') endIssue(f, true); return; }
  f.annoyed = Math.min(3, f.annoyed + 1);
  f.reinviteT = reason === 'kicked' ? 6 : 10;
  f.status = 'Online';
  G.winT = 0;
  if (f.issue && f.issue.def.type !== 'deadline') endIssue(f, true);
  if (reason === 'kicked') { say(null, f.name + ' was kicked from the party.'); G.log.kicks++; }
  else if (f.shaun) { shaunLeaves(f); return; }
  else { say(f, pick(G.rng, f.def.lines.leave) || 'later'); say(null, f.name + ' left the party.'); banner(f.name + ' left', 'bad', 1.6); G.vibe = clamp(G.vibe - 8, 0, 100); }
  Sfx.tone(440, 0.18, 'sawtooth', 0.12, 220);
}
function setReady(f, on, quiet) {
  if (f.ready === on) return;
  f.ready = on; f.waitT = 0; f.complainT = 0;
  if (on) { const h = f.def.readyHold || [20, 30]; f.readyHold = G.rng.range(h[0], h[1]) * (1 - 0.2 * f.annoyed);
    const closeN = lobbyMembers().filter(m => m.ready).length;
    f.falseReady = G.rng.chance((0.14 + 0.1 * f.def.chaos) * (closeN >= 3 ? 0.5 : 1)) ? G.rng.range(2, 6) : 0; const recent = G.t - (f.lastReadyLine || -99) < 25; if (!quiet && !recent) { say(f, pick(G.rng, f.def.lines.ready)); f.lastReadyLine = G.t; } G.vibe = clamp(G.vibe + 10, 0, 100); Sfx.tone(990, 0.1, 'sine', 0.15, 1480); }
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
  for (const m of lobbyMembers()) if (m !== f) { if (m.def.patience) m.patience -= 8 * ((m.def.sensitive && m.def.sensitive.outburst) || 1); if (m.def.anger) m.anger += 18; if (m.ready && G.rng.chance(0.5)) { setReady(m, false, true); m.readyT = G.rng.range(3, 6); m.bubble = 'wait what', m.bubbleKind = 'complain', m.bubbleT = 2; } }
  Sfx.noise(0.25, 0.2, 700, 0.8);
}
function ignoredOutburst(f) {
  say(f, pick(G.rng, f.def.lines.ignored), 'scream');
  G.shake = Math.max(G.shake, 0.4); G.vibe = clamp(G.vibe - 6, 0, 100);
  for (const m of lobbyMembers()) if (m !== f) { if (m.def.patience) m.patience -= 6 * ((m.def.sensitive && m.def.sensitive.outburst) || 1); if (m.def.anger) m.anger += 12; }
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
    if (f.shaun) tickShaun(f, dt);
    else if (f.disconnected) { f.dcT -= dt; if (f.dcT <= 0) { f.disconnected = false; setOnline(f, true); notice(f.name + ' is back online.'); if (f.issue) { notice(f.name + ': ' + pick(G.rng, f.issue.def.lines.end)); endIssue(f, true); } } }
    else if (!f.online && !f.gone && G.clock >= f.onlineAt) {
      if (f.sneaking) { f.sneaking = false; setOnline(f, true); notice(f.name + ' is online. "' + pick(G.rng, f.sneakDef.lines.end) + '"'); }
      else if (f.late) { setOnline(f, true); notice(f.name + ' is online. ' + pick(G.rng, f.late.def.lines.end)); f.late = null; }
      else setOnline(f);
    }
    if (f.sneaking && G.clock >= f.sneakFrom) f.status = 'Offline';
    if (f.invitePending > 0) { f.invitePending -= dt; if (f.invitePending <= 0) { f.invitePending = 0; if (!joinLobby(f)) f.status = 'Online'; } }
    if (!f.inLobby) continue;
    f.bubbleT = Math.max(0, f.bubbleT - dt);
    // scheduled issues fire once their time comes and the friend is actually here
    if (!f.issue) { const next = f.schedule.find(s => !s.done && s.at <= G.clock); if (next) { next.done = true; triggerIssue(f, next.def, next.minutes); } }
    if (f.issue) { tickIssue(f, dt); if (!f.inLobby) continue; }
    // readying up, and getting antsy once ready
    if (!f.ready) { if (!f.afk && !f.broken) { f.readyT -= dt / (f.readyMul || 1); if (f.readyT <= 0) setReady(f, true); } }
    else if (f.falseReady > 0) { f.falseReady -= dt; if (f.falseReady <= 0) { giveUp(f); continue; } }
    else if (anyNotReady || members.length < needed()) {
      const readyN = members.filter(m => m.ready).length;
      f.waitT += dt; f.readyHold -= dt * (readyN >= 4 ? 0.35 : readyN >= 3 ? 0.65 : 1);   // people hang on when it's close
      if (f.waitT > 6 && f.complainT === 0) { f.complainT = 1; say(f, pick(G.rng, f.def.lines.wait), 'complain'); }
      if (f.readyHold < 3 && f.complainT === 1) { f.complainT = 2; say(f, pick(G.rng, f.def.lines.annoyed), 'complain'); }
      if (f.readyHold <= 0) { giveUp(f); continue; }
    }
    // periodic distractions, more for chaotic friends
    f.distractT -= dt;
    if (f.distractT <= 0) { f.distractT = G.rng.range(12, 20); const rn = members.filter(m => m.ready).length; if (f.ready && G.rng.chance((0.05 + 0.1 * f.def.chaos) * (rn >= 4 ? 0.4 : 1))) { giveUp(f); continue; } }
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
    // patience (paused while away)
    if (f.def.patience && !f.afk) {
      let drain = f.def.patience.drain * (f.ready ? 1.3 : 0.8);
      if (members.length < needed()) drain *= 1.25;                     // waiting on invites
      if (screamer && screamer !== f) drain += 3 * ((f.def.sensitive && f.def.sensitive.scream) || 1);
      f.patience -= drain * dt;
      if (f.patience <= 0) { if (f.shaun) shaunLeaves(f); else leaveLobby(f, 'patience'); continue; }
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
        const afkLong = members.find(m => m.afk && m.issue && m.issue.t > gm2s(10));
        if (afkLong) { rise += a.afkRise || 1; f.afkRantT -= dt; if (f.afkRantT <= 0) { f.afkRantT = 9; say(f, tpl(pick(G.rng, f.def.lines.afkRant), { name: afkLong.name.toUpperCase(), min: Math.round(s2gm(afkLong.issue.t)) }), 'scream'); } }
        f.anger += rise * dt;
        if (f.anger >= a.max) startScream(f);
      }
    }
    // idle chatter: rare, and never while something is already going on
    f.chatterT -= dt;
    if (f.chatterT <= 0) { f.chatterT = G.rng.range(40, 75); if (!f.screaming && f.ready && !anyNotReady) say(f, pick(G.rng, f.def.lines.idle), '', true); }
  }

  // party vibe
  let drain = 0.4;
  if (members.length && !members.some(m => m.ready)) drain += 0.8;
  if (members.some(m => m.mood === 'annoyed')) drain += 0.5;
  if (!members.length) drain += 0.4;
  drain *= Math.max(0.3, 1 - 0.14 * members.filter(m => m.ready).length);   // a mostly-ready lobby keeps its own vibe up
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
  const sh = G.friends.shaun;
  if (sh && sh.inLobby) { G.log.withShaun = true; setTimeout(() => { if (G.state === 'match') banner('PLAYED WITH SHAUN 👑', 'good', 3); }, 2600); }
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
  const sh = G.friends.shaun;
  G.result = { kind, day: G.day, mode: G.mode, lobbyMinutes: kind === 'win' ? G.lobbyMinutes : G.clock, matchMinutes: matchMin, log: G.log, vibe: Math.round(G.vibe), shaun: sh ? { appeared: sh.shaun.appeared, stayed: sh.shaun.stayed, withMatch: G.log.withShaun } : null };
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
  const trouble = Object.entries(r.log.issues).sort((a, b) => b[1] - a[1])[0];
  if (trouble) html += `<div class="row"><span>🧨 Most trouble</span><span>${FRIENDS[trouble[0]].name} (${trouble[1]} issue${trouble[1] === 1 ? '' : 's'})</span></div>`;
  if (r.shaun) html += `<div class="row"><span>👑 Shaun</span><span>${r.shaun.withMatch ? 'PLAYED WITH SHAUN' : r.shaun.appeared ? (r.shaun.stayed > 0 ? 'stayed ' + fmtDur(s2gm(r.shaun.stayed)) + ' then left' : 'popped in and left') : 'never showed'}</span></div>`;
  html += `<div class="row"><span>🚽 Parker AFK</span><span>×${r.log.afk.parker || 0}</span></div>`;
  if (r.log.caught) html += `<div class="row"><span>🕵️ Caught Nicky C</span><span>yes</span></div>`;
  html += `<div class="row"><span>📢 Andre outbursts</span><span>×${r.log.outbursts}</span></div>`;
  html += `<div class="row"><span>🔴 People un-readied</span><span>×${r.log.unreadies}</span></div>`;
  if (mostLines) html += `<div class="row"><span>🎙️ Most talkative</span><span>${FRIENDS[mostLines[0]].name} (${mostLines[1]} lines)</span></div>`;
  ui.resultBody.innerHTML = html;
  ui.resultNext.textContent = Daily.debug ? 'Debug evening — not saved' : 'Phase 2 build — results are not saved yet';
  ui.result.classList.remove('hidden');
}

// ---------------------------------------------------------------------------
// Issues: scheduled from friends.js data, one engine per issue type.
// ---------------------------------------------------------------------------
const gm2s = m => m * (REAL_SECONDS / EVENING_MIN);     // game minutes → real seconds
const s2gm = s => s * MIN_PER_SEC;
const roundQuarter = m => Math.ceil(m / 15) * 15;
const tpl = (s, vars) => String(s || '').replace(/\{(\w+)\}/g, (_, k) => vars[k] !== undefined ? vars[k] : '');

function weightedPick(rng, arr) {
  const total = arr.reduce((a, d) => a + (d.weight || 1), 0);
  let r = rng.next() * total;
  for (const d of arr) { r -= (d.weight || 1); if (r < 0) return d; }
  return arr[arr.length - 1];
}

// Decide which issues each friend will have tonight and when. Pre-online
// issues (late, sneak) apply right away; lobby issues wait for their time
// and for the friend to actually be in the lobby.
function scheduleIssues(f) {
  const defs = f.def.issues || []; if (!defs.length) return;
  const rng = G.rng;
  let pool = defs.slice();
  const chosen = [];
  const sneak = pool.find(d => d.type === 'sneak');
  if (sneak) { pool = pool.filter(d => d !== sneak); if (rng.chance(f.def.sneakChance || 0)) chosen.push(sneak); }
  const n = f.def.issuesPerEvening ? rng.int(f.def.issuesPerEvening[0], f.def.issuesPerEvening[1]) : 1;
  for (let i = 0; i < n && pool.length; i++) { const d = weightedPick(rng, pool); chosen.push(d); pool = pool.filter(x => x !== d); }
  let nextAt = f.onlineAt + rng.range(6, 14);
  for (const def of chosen) {
    const minutes = def.minutes ? rng.range(def.minutes[0], def.minutes[1]) : 0;
    if (def.type === 'late') { f.late = { def, used: {} }; f.onlineAt += minutes; continue; }
    if (def.type === 'sneak') { f.sneaking = true; f.sneakFrom = f.onlineAt; f.onlineAt += minutes; f.sneakDef = def; continue; }
    f.schedule.push({ def, at: Math.min(205, nextAt), minutes });
    nextAt += rng.range(18, 40);
  }
}

function triggerIssue(f, def, minutesIn) {
  if (f.issue) return false;
  const rng = G.rng;
  const minutes = minutesIn !== undefined ? minutesIn : (def.minutes ? rng.range(def.minutes[0], def.minutes[1]) : 0);
  const label = def.labels ? pick(rng, def.labels) : def.label;
  const I = { def, minutes, remaining: gm2s(minutes), used: {}, label, t: 0, fixing: 0 };
  f.issue = I; f.issuesHad++;
  G.log.issues[f.id] = (G.log.issues[f.id] || 0) + 1;
  const vars = { label, time: '', name: f.name };
  switch (def.type) {
    case 'afk':
      f.afk = true; setReady(f, false, true); G.log.afk[f.id] = (G.log.afk[f.id] || 0) + 1;
      say(f, tpl(pick(rng, def.lines.start), vars), 'complain'); break;
    case 'disconnect':
      say(f, pick(rng, def.lines.start), 'complain');
      leaveLobby(f, 'dc'); f.online = false; f.disconnected = true; f.dcT = gm2s(minutes); f.status = 'Disconnected';
      notice(f.name + ' disconnected (' + def.label.toLowerCase() + ').'); break;
    case 'fixable':
      f.broken = true; setReady(f, false, true); say(f, pick(rng, def.lines.start), 'complain'); break;
    case 'deadline':
      f.deadlineAt = roundQuarter(G.clock + minutes); vars.time = fmtClock(f.deadlineAt);
      say(f, tpl(pick(rng, def.lines.start), vars), 'complain'); notice(f.name + ' leaves at ' + fmtClock(f.deadlineAt) + '.'); break;
    case 'slowready':
      f.readyMul = def.readyMul || 3; f.wanderT = rng.range(8, 14); say(f, pick(rng, def.lines.start), ''); break;
    case 'soju':
      f.sojuT = rng.range(3, 6); say(f, pick(rng, def.lines.start), 'complain'); break;
    case 'vote':
      f.voteT = def.seconds || 12; G.vote = f; say(f, pick(rng, def.lines.start), 'scream');
      Sfx.tone(600, 0.1, 'square', 0.15); Sfx.tone(900, 0.1, 'square', 0.15, 0, 0.12); break;
  }
  return true;
}

function endIssue(f, silent) {
  const I = f.issue; if (!I) return;
  const wasAfk = f.afk || f.broken;
  f.issue = null; f.afk = false; f.broken = false; f.readyMul = 1; f.wanderBack = 0;
  if (G.vote === f) G.vote = null;
  if (!silent && I.def.lines.end) say(f, pick(G.rng, I.def.lines.end));
  if (wasAfk && f.inLobby) f.readyT = G.rng.range(3, 6);
}

function tickIssue(f, dt) {
  const I = f.issue, def = I.def, rng = G.rng;
  I.t += dt;
  switch (def.type) {
    case 'afk':
      I.remaining -= dt; if (I.remaining <= 0) endIssue(f); break;
    case 'fixable':
      if (I.fixing > 0) { I.fixing -= dt; if (I.fixing <= 0) { f.broken = false; say(f, pick(rng, def.lines.fixed)); endIssue(f, true); if (f.inLobby) f.readyT = 1; } }
      else { I.remaining -= dt; if (I.remaining <= 0) { say(f, 'found a cable. ready.'); endIssue(f, true); } }
      break;
    case 'deadline':
      if (G.clock >= f.deadlineAt) {
        say(f, pick(rng, def.lines.leave), 'complain');
        leaveLobby(f, 'gone'); f.online = false; f.gone = true; f.goneStatus = def.goneStatus || 'Gone for the night'; f.status = f.goneStatus;
        notice(f.name + ' is gone for the night.'); endIssue(f, true);
      }
      break;
    case 'slowready':
      I.remaining -= dt;
      if (f.wanderBack > 0) { f.wanderBack -= dt; if (f.wanderBack <= 0) { f.afk = false; say(f, pick(rng, def.lines.during), 'complain'); } }
      else { f.wanderT -= dt; if (f.wanderT <= 0) { f.wanderT = rng.range(10, 16); if (rng.chance(0.5)) { f.afk = true; setReady(f, false, true); f.wanderBack = gm2s(rng.range(3, 5)); say(f, pick(rng, def.lines.wander), 'complain'); } else say(f, pick(rng, def.lines.during), ''); } }
      if (I.remaining <= 0) endIssue(f);
      break;
    case 'soju':
      I.remaining -= dt; f.sojuT -= dt;
      if (f.sojuT <= 0) { f.sojuT = rng.range(3, 7); setReady(f, !f.ready, true); say(f, pick(rng, def.lines.during), f.ready ? '' : 'complain'); }
      if (I.remaining <= 0) endIssue(f);
      break;
    case 'vote':
      f.voteT -= dt;
      if (f.voteT <= 0) {
        G.vote = null; endIssue(f, true);
        for (const m of lobbyMembers()) if (m.ready) { setReady(m, false, true); m.readyT = rng.range(3, 7); }
        say(f, f.def.lines.voteLose, 'scream'); G.vibe = clamp(G.vibe - 10, 0, 100); G.shake = Math.max(G.shake, 0.3);
        banner('VOTE TIMED OUT · EVERYONE UN-READY', 'bad', 2.2);
      }
      break;
  }
}

// A button from friends.js for the current issue.
function runIssueButton(f, I, b) {
  if (b.once && I.used[b.id]) return 'Already used that one.';
  I.used[b.id] = true;
  const rng = G.rng;
  switch (b.kind) {
    case 'shorten': I.remaining -= gm2s(b.minutes); break;
    case 'lengthen': I.remaining += gm2s(b.minutes); break;
    case 'resolve': endIssue(f, true); break;
    case 'postpone': f.deadlineAt += b.minutes; notice(f.name + ' now leaves at ' + fmtClock(f.deadlineAt) + '.'); break;
    case 'fix': I.fixing = b.seconds || 4; break;
    case 'answer': G.vote = null; endIssue(f, true); if (b.id === 'no' && f.def.anger) f.anger = clamp(f.anger + 15, 0, 100); G.vibe = clamp(G.vibe + 3, 0, 100); break;
  }
  if (b.kind !== 'lengthen') G.vibe = clamp(G.vibe + 5, 0, 100);
  if (b.line) say(f, b.line);
  return b.result || 'Done.';
}
function runLateButton(f, b) {
  if (b.once && f.late.used[b.id]) return 'Already used that one.';
  f.late.used[b.id] = true;
  if (b.kind === 'shorten') f.onlineAt = Math.max(G.clock + 1, f.onlineAt - b.minutes);
  if (b.line) notice(f.name + ': ' + b.line);
  return b.result || 'Done.';
}
function catchSneak(f) {
  f.sneaking = false; setOnline(f, true);
  notice('You caught ' + f.name + ' in another party.');
  G.log.caught = true;
  if (!joinLobby(f, true)) f.status = 'Online';
  say(f, pick(G.rng, f.def.lines.caught), 'complain');
  f.annoyed = Math.min(3, f.annoyed + 1);
  const j = G.friends.justin;
  if (j && j.inLobby) { j.anger = clamp(j.anger + 45, 0, 100); say(j, j.def.lines.caughtNickyC, 'scream'); G.shake = Math.max(G.shake, 0.4); }
  G.vibe = clamp(G.vibe - 4, 0, 100);
  Sfx.tone(300, 0.2, 'sawtooth', 0.15, 150);
}

// Shaun shows up exactly once. Keeping him is the hard part.
function shaunAppears(f) {
  const S = f.shaun; S.appeared = true; S.appearedAt = G.clock;
  setOnline(f, true); f.status = 'Online';
  banner('SHAUN IS ONLINE FOR THE FIRST TIME IN ' + S.daysAway + ' DAYS', 'good', 3.5);
  notice('Shaun is online for the first time in ' + S.daysAway + ' days.');
  Sfx.tone(523, 0.12, 'square', 0.18); Sfx.tone(784, 0.12, 'square', 0.18, 0, 0.14); Sfx.tone(1046, 0.25, 'square', 0.2, 0, 0.28);
  G.shake = Math.max(G.shake, 0.25);
  const matt = G.friends.matt;
  if (matt) { if (matt.inLobby) say(matt, matt.def.lines.hiShaun); else notice('Matt: Hi Shaun'); }
}
function shaunLeaves(f) {
  const S = f.shaun; S.left = true;
  if (f.inLobby) { const s = G.lobby.indexOf(f.id); if (s >= 0) G.lobby[s] = null; f.inLobby = false; f.ready = false; G.winT = 0; }
  f.online = false; f.gone = true; f.goneStatus = 'Offline · see you next month'; f.status = f.goneStatus; f.invitePending = 0;
  banner(f.def.lines.gone, 'bad', 3); notice(f.def.lines.gone);
  Sfx.tone(440, 0.3, 'sine', 0.15, 220);
  G.vibe = clamp(G.vibe - 6, 0, 100);
}
function tickShaun(f, dt) {
  const S = f.shaun;
  if (!S.appeared) { if (G.clock >= f.onlineAt) shaunAppears(f); return; }
  if (S.left) return;
  if (f.inLobby) { S.stayed += dt; }
  else if (f.online && f.invitePending <= 0) { S.windowT -= dt; if (S.windowT <= 0) shaunLeaves(f); }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------
const ACTIONS = {
  invite: { label: 'Invite', hint: 'to the party', cls: 'primary', can: f => f.online && !f.gone && !f.disconnected && !f.inLobby && f.invitePending <= 0 && freeSlot() >= 0 && f.reinviteT <= 0,
    run: f => { invite(f); return f.name + ' invited. Now we wait.'; } },
  ping: { label: 'Ping', hint: 'free, weak', can: f => f.inLobby && f.cd.ping <= 0,
    run: f => { f.cd.ping = 4; Sfx.tone(1200, 0.05, 'square', 0.1);
      if (f.issue && f.issue.def.type === 'slowready') { f.issue.remaining -= gm2s(4); say(f, 'huh? oh. yeah.'); return 'The ping got through the haze a little.'; }
      if (f.afk || f.broken) return f.name + ' is away. The ping echoed.';
      f.readyT -= 2; f.readyHold += 4; if (f.def.anger) f.anger += 4; say(f, pick(G.rng, f.def.lines.ping)); return 'Pinged ' + f.name + '. A grunt was heard.'; } },
  text: { label: 'Text "chillllll"', hint: 'medium · 20s cooldown', can: f => f.inLobby && f.cd.text <= 0,
    run: f => { f.cd.text = 20; f.readyT -= 4; f.readyHold += 10; f.waitT = 0; if (f.def.patience) f.patience = clamp(f.patience + 12, 0, f.def.patience.max); if (f.def.anger) f.anger = clamp(f.anger - 10, 0, 100); say(f, pick(G.rng, f.def.lines.text)); return f.name + ' read it. Left on read, but read.'; } },
  call: { label: 'Call', hint: 'strong · annoys everyone else', can: f => f.inLobby && f.cd.call <= 0,
    run: f => { f.cd.call = 30; G.log.calls++;
      for (const m of lobbyMembers()) if (m !== f) { if (m.def.patience) m.patience -= 8; if (m.def.anger) m.anger += 10; }
      Sfx.tone(700, 0.12, 'sine', 0.12); Sfx.tone(700, 0.12, 'sine', 0.12, 0, 0.25);
      if (f.issue && f.issue.def.worse && f.issue.def.worse.call) { f.issue.remaining += gm2s(f.issue.def.worse.call); if (f.issue.def.type === 'deadline') f.deadlineAt -= 10; say(f, f.issue.def.worse.line || pick(G.rng, f.def.lines.call), 'complain'); return 'That made it worse. Everyone else heard it ring too.'; }
      if (f.afk || f.broken) { say(f, pick(G.rng, f.def.lines.call), 'complain'); return f.name + ' picked up, annoyed, and is still away.'; }
      f.readyT = Math.min(f.readyT, 0.5); f.readyHold += 15; f.waitT = 0; if (f.def.patience) f.patience = clamp(f.patience + 6, 0, f.def.patience.max);
      say(f, pick(G.rng, f.def.lines.call)); return 'Called ' + f.name + '. Everyone else heard it ring.'; } },
  calm: { label: 'Calm down, Justin', hint: 'lowers anger', cls: 'fix', can: f => f.inLobby && !!f.def.anger && f.cd.calm <= 0,
    run: f => { f.cd.calm = 8; calmDown(f); return 'Justin took a breath. One breath.'; } },
  listen: { label: "I'm listening, Andre", hint: 'ends the outburst', cls: 'fix', can: f => f.inLobby && !!f.def.outburst && f.ignoredT > 0,
    run: f => { f.ignoredT = 0; f.outburstT = G.rng.range(f.def.outburst.every[0], f.def.outburst.every[1]); say(f, pick(G.rng, f.def.lines.listened)); if (f.def.patience) f.patience = clamp(f.patience + 10, 0, f.def.patience.max); G.vibe = clamp(G.vibe + 6, 0, 100); return 'Andre feels heard. For now.'; } },
  kick: { label: 'Kick', hint: 'frees the slot', cls: 'danger', can: f => f.inLobby,
    run: f => {
      if (f.def.neverLeaves) { f.anger = clamp(f.anger + 25, 0, 100); say(f, f.def.lines.kicked, 'scream'); banner(f.name + ' instantly rejoined', 'bad', 1.8); G.shake = 0.5; return 'Kick failed. He was back before the button finished animating.'; }
      leaveLobby(f, 'kicked'); return f.name + ' kicked. He will remember this.'; } },
};
const ACTION_ORDER = ['invite', 'ping', 'text', 'call', 'calm', 'listen', 'kick'];

let menuButtons = [], menuSig = '';
function menuSignature(f) { return [f.inLobby, !!f.def.anger, !!f.def.outburst, f.issue ? f.issue.def.id : '', f.issue ? Object.keys(f.issue.used).length : 0, !!f.late, f.late ? Object.keys(f.late.used).length : 0, f.sneaking && G.clock >= f.sneakFrom, f.gone].join('|'); }
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
  const addBtn = (label, hint, cls, canFn, runFn) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = cls || '';
    b.innerHTML = `${label}<small></small>`;
    b.addEventListener('click', e => { e.preventDefault(); if (!canFn()) return; ui.menuResult.textContent = runFn(); updateMenu(); });
    ui.menuActions.appendChild(b);
    menuButtons.push({ key: null, el: b, small: b.querySelector('small'), lastSmall: '', lastDisabled: null, hint, canFn });
  };
  if (f.issue && f.issue.def.buttons) for (const bt of f.issue.def.buttons) {
    const I = f.issue;
    addBtn(bt.label, (I.def.icon + ' ' + I.label), 'fix', () => !!f.issue && f.issue === I && !(bt.once && I.used[bt.id]) && G.state === 'playing', () => runIssueButton(f, I, bt));
  }
  if (f.late && f.late.def.buttons) for (const bt of f.late.def.buttons) addBtn(bt.label, f.late.def.icon + ' ' + f.late.def.label, 'fix', () => !!f.late && !(bt.once && f.late.used[bt.id]), () => runLateButton(f, bt));
  if (f.sneaking && G.clock >= f.sneakFrom && f.sneakDef) for (const bt of f.sneakDef.buttons) addBtn(bt.label, 'something is off about that "Offline"', 'fix', () => f.sneaking, () => { catchSneak(f); return bt.result; });
  if (f.gone) addBtn(f.goneStatus, 'gone for the night', '', () => false, () => '');
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
    if (!mb.key) { if (mb.hint !== mb.lastSmall) { mb.lastSmall = mb.hint; mb.small.textContent = mb.hint; } const d = !mb.canFn(); if (d !== mb.lastDisabled) { mb.lastDisabled = d; mb.el.disabled = d; } continue; }
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
  if (f.gone) return f.goneStatus;
  if (f.disconnected) return 'Disconnected · back in ' + Math.ceil(s2gm(f.dcT)) + 'm';
  if (f.inLobby) {
    if (f.issue && f.issue.def.type === 'deadline') return (f.ready ? 'READY · ' : '') + f.issue.def.icon + ' leaves ' + fmtClock(f.deadlineAt);
    if (f.afk) return 'AFK · ' + f.issue.def.icon + ' ' + f.issue.label;
    if (f.issue) return f.issue.def.icon + ' ' + f.issue.label;
    return f.ready ? 'In lobby · READY' : 'In lobby';
  }
  if (f.shaun && !f.shaun.appeared) return 'Offline · ' + f.shaun.daysAway + ' days';
  if (f.sneaking && G.clock >= f.sneakFrom) return 'Offline · last seen just now';
  if (!f.online && f.late) return f.late.def.icon + ' ' + f.late.def.label;
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
    const dot = f.inLobby ? 'dot lobby' : f.online ? 'dot online' : (f.sneaking && G.clock >= f.sneakFrom) ? 'dot away blink' : f.disconnected ? 'dot away' : 'dot';
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
    const key = f ? `${f.id}|${f.ready}|${f.screaming > 0}|${f.mood}|${waiting}|${f.afk}|${f.broken}|${f.issue ? f.issue.def.id : ''}|${f.deadlineAt}|${Math.round((f.def.patience ? f.patience : f.anger) / 4)}` : (i < needed() ? 'empty' : 'na');
    if (el.dataset.key === key) continue;
    el.dataset.key = key;
    el.className = 'slot' + (f ? (f.screaming > 0 ? ' screaming' : '') + (f.def.codeRed ? ' codered' : '') : ' empty');
    const icon = el.querySelector('.icon'), name = el.querySelector('.name'), st = el.querySelector('.state'), bar = el.querySelector('.bar');
    if (!f) { icon.textContent = ''; name.textContent = i < needed() ? 'EMPTY' : '—'; st.textContent = i < needed() ? 'invite someone' : 'phase 2'; bar.style.visibility = 'hidden'; continue; }
    const I = f.issue;
    icon.textContent = f.screaming > 0 ? '📢' : (f.afk || f.broken) && I ? I.def.icon : f.mood === 'annoyed' && !f.ready ? '😤' : f.ready ? '✅' : I && I.def.type !== 'deadline' ? I.def.icon : '🔴';
    name.textContent = f.name;
    let txt = f.screaming > 0 ? 'SCREAMING' : f.afk && I ? 'AFK · ' + I.label.toUpperCase() : f.broken && I ? I.label.toUpperCase() : waiting ? 'READY · WAITING…' : f.mood === 'annoyed' ? (f.ready ? 'READY · ANNOYED' : 'ANNOYED') : f.ready ? 'READY' : 'NOT READY';
    if (I && I.def.type === 'deadline') txt += ' · ' + I.def.icon + ' ' + fmtClock(f.deadlineAt);
    if (f.def.codeRed) txt = 'CODE RED · ' + txt;
    st.textContent = txt;
    st.className = 'state ' + (f.screaming > 0 || f.afk || f.broken ? 'notready' : waiting ? 'waiting' : f.mood === 'annoyed' ? 'annoyed' : f.ready ? 'ready' : 'notready');
    bar.style.visibility = 'visible';
    if (f.def.anger) { bar.className = 'bar anger'; bar.firstElementChild.style.width = Math.round(f.anger) + '%'; }
    else { const pct = f.patience / f.def.patience.max * 100; bar.className = 'bar' + (pct < 30 ? ' low' : ''); bar.firstElementChild.style.width = Math.round(pct) + '%'; }
  }
  updateList();
  if (menuTarget && !ui.menu.classList.contains('hidden')) updateMenu();
  if (G.vote && G.state === 'playing') { ui.banner.textContent = 'MODE VOTE · answer Justin · ' + Math.ceil(G.vote.voteT) + 's'; if (ui.banner.className !== 'bad') ui.banner.className = 'bad'; ui.banner.classList.remove('hidden'); G.bannerT = 0.5; }
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
  const armUp = (ready || screaming || match) && !f.afk;
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
  const closed = f.blink < 0 || f.afk;
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
  if (f.afk) { ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = `900 ${14 * s}px -apple-system, Helvetica, Arial`; ctx.textAlign = 'left'; ctx.fillText('z', 26 * s, -150 * s + Math.sin(t * 2) * 3 * s); ctx.fillText('Z', 34 * s, -164 * s + Math.sin(t * 2 + 1) * 3 * s); }
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
  ui.titleNext.textContent = 'Phase 2 test build · next evening in ' + Daily.countdownText();
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
