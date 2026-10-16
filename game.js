'use strict';
// game.js — The Lobby engine: lobby, slots, friends list, actions, issues,
// chemistry, events, results, share, stats, first-evening guide, music.
// Every line of friend content and every joke comes from friends.js; the
// shared foundation comes from base.js. No jokes in this file.
(function () {

const EVENING_MIN = 240;            // 9:00pm → 1:00am
const REAL_SECONDS = 180;           // one evening ≈ 3 real minutes
const MIN_PER_SEC = EVENING_MIN / REAL_SECONDS;
const SLOTS = 5;
const WIN_HOLD = 3;                 // seconds everyone must be ready together
const MATCH_SECONDS = 15;
const KICK_MINUTES = 20;            // a kicked friend can't be re-invited for this long
const KEEP_ON_KICK = ['afk', 'download', 'fixable', 'slowready', 'soju', 'deadline'];   // these issues keep running while kicked

const $ = id => document.getElementById(id);
const ui = {
  app: $('app'), clock: $('clock'), vibeFill: $('vibe-fill'), vibeLabel: $('vibe-label'), mute: $('mute'),
  list: $('friend-list'), friendCount: $('friend-count'), restart: $('btn-restart'), notes: $('notes'), modeTag: $('mode-tag'),
  bg: $('bg'), mapImg: $('map-img'), mapHead: $('map-head'), mapName: $('map-name'), modeName: $('mode-name'), modeSub: $('mode-sub'),
  countdown: $('countdown'), splash: $('splash'), vibeFace: $('vibe-face'), titleCrew: $('title-crew'), resultCrew: $('result-crew'),
  menuSheet: $('menu-sheet'), menuPortrait: $('menu-portrait'),
  stage: $('stage'), canvas: $('chars'), slots: $('slots'), banner: $('banner'), readyCheck: $('ready-check'), readyCount: $('ready-count'),
  menu: $('menu'), menuTitle: $('menu-title'), menuSub: $('menu-sub'), menuActions: $('menu-actions'), menuResult: $('menu-result'), menuClose: $('menu-close'),
  title: $('screen-title'), titleDay: $('title-day'), titleTwist: $('title-twist'), titleNext: $('title-next'), start: $('btn-start'), titleBest: $('title-best'),
  result: $('screen-result'), resultDay: $('result-day'), resultTitle: $('result-title'), resultTag: $('result-tag'), resultBig: $('result-big'), resultBody: $('result-body'), again: $('btn-again'), resultNext: $('result-next'), resultBest: $('result-best'),
  share: $('btn-share'), stats: $('btn-stats'), statsScreen: $('screen-stats'), statsBody: $('stats-body'), statsClose: $('btn-stats-close'),
  toast: $('toast'), achBody: $('ach-body'), guide: $('guide'),
  pauseBtn: $('btn-pause'), pauseScreen: $('screen-pause'), resume: $('btn-resume'), quit: $('btn-quit'),
  loading: $('screen-loading'), loadFill: $('load-fill'), loadTip: $('load-tip'), titleTip: $('title-tip'), vibe: $('vibe'),
};
const ctx = ui.canvas.getContext('2d'), bgx = ui.bg.getContext('2d');
Sfx.setup('thelobby_muted', ui.mute);

const Store = new DailyStore('thelobby_v1', { evenings: 0, matches: 0, longestLobby: 0, shaunMatches: 0, shaunLongest: 0, parkerAfk: 0, andreOutbursts: 0, streak: 0, bestStreak: 0, lastDay: 0 });

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const G = { chem: {}, chemActive: [], chatBug: 0, doubleXp: 0, rcHighlight: 0, notices: [], vote: null, evening: null, serverDown: 0, confetti: [], ach: {}, heartbeatT: 0, state: 'title', day: 1, mode: 'official', rng: null, t: 0, clock: 0, vibe: 100, friends: {}, lobby: [], subs: [], winT: 0, shake: 0, matchT: 0, matchLine: 0, lobbyMinutes: 0, result: null, bannerT: 0, rcCooldown: 0, log: {} };
let menuTarget = null;

const skinOf = f => SKIN[f.def.look.skin] || f.def.look.skin;
const needed = () => Math.min(SLOTS, ROSTER.length);
const lobbyMembers = () => G.lobby.filter(Boolean).map(id => G.friends[id]);
const freeSlot = () => G.lobby.indexOf(null);
const fmtClock = m => { const h24 = 21 + Math.floor(m / 60), mi = Math.floor(m % 60); const h = ((h24 - 1) % 12) + 1; return h + ':' + String(mi).padStart(2, '0') + ' ' + (h24 >= 24 ? 'AM' : 'PM'); };
const fmtDur = m => { m = Math.round(m); return m >= 60 ? Math.floor(m / 60) + 'h ' + (m % 60) + 'm' : m + 'm'; };
const pick = (rng, arr) => arr && arr.length ? arr[Math.floor(rng.next() * arr.length)] : '';
const nameVars = f => ({ name: f.name, min: KICK_MINUTES });

function planEvening(day) {
  const rng = new Rng(Daily.seedFor(day, 7));
  const golden = rng.chance(GOLDEN.chance);
  const twist = golden ? null : rng.pick(TWISTS);
  const fx = golden ? { patienceMul: GOLDEN.patienceMul, angerMul: GOLDEN.angerMul, outburstMul: GOLDEN.outburstMul, shaunSeconds: GOLDEN.shaunSeconds } : Object.assign({}, twist.effects);
  return {
    day, golden, twist, fx,
    maintenanceAt: rng.chance(EVENTS.maintenance.chance) ? rng.range(EVENTS.maintenance.window[0], EVENTS.maintenance.window[1]) : null,
    crash: rng.chance(EVENTS.crash.chance), crashed: false, maintained: false,
    matchMinutes: rng.int(4, 9),
    chatbugAt: rng.chance(EVENTS.chatbug.chance) && !golden ? rng.range(EVENTS.chatbug.window[0], EVENTS.chatbug.window[1]) : null,
    doublexpAt: rng.chance(EVENTS.doublexp.chance) ? rng.range(EVENTS.doublexp.window[0], EVENTS.doublexp.window[1]) : null,
    chatbugged: false, doublexped: false,
  };
}
function fxOnline(id, w) {
  const fx = G.evening.fx;
  if (G.evening.golden) return [0, 0];
  if (fx.online && fx.online.friend === id) return fx.online.window;
  return w;
}
function makeFriend(id) {
  const def = FRIENDS[id];
  const w = fxOnline(id, def.online.window);
  return {
    id, def, name: def.name,
    online: false, onlineAt: G.rng.range(w[0], w[1]),
    inLobby: false, ready: false, readyT: 0, invitePending: 0, reinviteT: 0, annoyed: 0,
    patience: def.patience ? def.patience.max : 0, anger: 0, screaming: 0,
    cd: { ping: 0, text: 0, call: 0, calm: 0 }, buffs: {}, usedActions: {}, pending: [], backfire: null, chatterT: G.rng.range(30, 60), talkT: 0, phase: G.rng.next() * 6.28, blink: 0,
    status: 'Offline', joinedAt: 0, leaves: 0,
    readyHold: 0, waitT: 0, complainT: 0, mood: 'ok', distractT: G.rng.range(10, 18), falseReady: 0, bubble: '', bubbleKind: '', bubbleT: 0,
    outburstT: def.outburst ? G.rng.range(def.outburst.every[0], def.outburst.every[1]) : 0, ignoredT: 0,
    issue: null, afk: false, broken: false, readyMul: 1, deadlineAt: null, gone: false, goneStatus: '', disconnected: false, dcT: 0,
    sneaking: false, sneakFrom: 0, sneakDef: null, late: null, schedule: [], issuesHad: 0, afkRantT: 0, wanderT: 0, wanderBack: 0, sojuT: 0, voteT: 0,
    shaun: def.codeRed ? { windowT: (() => { const ws = G.evening.fx.shaunSeconds || def.windowSeconds; return G.rng.range(ws[0], ws[1]); })(), appeared: false, left: false, daysAway: G.rng.int(def.daysAway[0], def.daysAway[1]), stayed: 0, appearedAt: 0 } : null,
  };
}

function startEvening(mode) {
  G.mode = Daily.debug ? 'debug' : 'play';
  G.day = Daily.todayNumber();
  G.rng = new Rng(Daily.seedFor(G.day, 0));
  G.evening = planEvening(G.day); G.serverDown = 0;
  G.t = 0; G.clock = 0; G.vibe = 100; G.winT = 0; G.shake = 0; G.matchT = 0; G.matchLine = 0; G.result = null; G.rcCooldown = 0;
  G.subs = []; ui.notes.innerHTML = ''; G.slotFx = []; G.cdShown = 0; ui.splash.classList.add('hidden'); G.log = { leaves: 0, screams: 0, kicks: 0, calls: 0, outbursts: 0, unreadies: 0, lines: {}, issues: {}, afk: {}, trail: {}, caught: false, withShaun: false, crashed: false };
  G.chem = {}; G.chemActive = []; G.chatBug = 0; G.doubleXp = 0; G.rcHighlight = 0;
  G.friends = {}; for (const id of ROSTER) G.friends[id] = makeFriend(id);
  for (const id of ROSTER) scheduleIssues(G.friends[id]);
  G.vote = null;
  G.ach = { listened: 0, restarts: 0, kickJustin: false, bnccall: false, water: false, vote: false, seen: {}, actions: 0, parkerJoinedAt: null, parkerReadyAt: null };
  G.confetti = [];
  G.lobby = new Array(SLOTS).fill(null);
  // Justin is already in the lobby at 9:00pm. He is always in the lobby.
  for (const id of ROSTER) if (FRIENDS[id].neverLeaves) { const f = G.friends[id]; setOnline(f, true); joinLobby(f, true); }
  G.state = 'playing';
  ui.title.classList.add('hidden'); ui.result.classList.add('hidden'); ui.statsScreen.classList.add('hidden'); ui.app.classList.remove('hidden');
  notice('Party created · need ' + needed() + ' ready');
  if (G.evening.golden) { banner('✨ GOLDEN EVENING ✨', 'good', 3.5); spawnConfetti(80, ['#ffd23f', '#ffe066', '#fff3b0', '#ffb800']); notice(GOLDEN.notice); }
  else if (G.evening.twist) notice('Tonight: ' + G.evening.twist.text);
  if (ui.modeTag) { ui.modeTag.textContent = G.mode === 'debug' ? 'DEBUG · EVENING #' + G.day : ''; ui.modeTag.classList.toggle('hidden', G.mode !== 'debug'); }
  buildSlots(); buildList(); resize();
  Guide.init(); Music.start();
}

// ---------------------------------------------------------------------------
// Subtitles, banners, toasts
// ---------------------------------------------------------------------------
// System events slide in as console-style notifications, with the friend's
// portrait when the text is about someone. Dialogue stays in speech bubbles.
function notice(text) {
  if (!text || !ui.notes) return;
  const who = Object.values(G.friends || {}).find(x => text.startsWith(x.name));
  const n = document.createElement('div'); n.className = 'note';
  n.innerHTML = (who ? `<img alt="" src="${portraitOf(who)}">` : '<span class="ic">🎮</span>') + `<span>${esc(text)}</span>`;
  ui.notes.appendChild(n);
  while (ui.notes.children.length > 3) ui.notes.firstChild.remove();
  setTimeout(() => { n.classList.add('out'); setTimeout(() => n.remove(), 360); }, 3800);
}
function say(f, text, kind, noBubble) {
  if (!text) return;
  if (!f) return notice(text);
  if (G.chatBug > 0) { text = EVENTS.chatbug.muffled; kind = ''; }
  if (!noBubble) { f.bubble = text; f.bubbleKind = kind || ''; f.bubbleT = 3; }
  if (G.chatBug <= 0) blip(f, kind);
  f.talkT = 1.2; G.log.lines[f.id] = (G.log.lines[f.id] || 0) + 1;
}
let lastBlip = {};
function blip(f, kind) {
  const v = VOICES[f.id] || { pitch: 400, type: 'square' };
  const now = G.t;
  if (now - (lastBlip[f.id] || -9) < 0.12) return;
  lastBlip[f.id] = now;
  if (kind === 'scream') { Sfx.tone(v.pitch * 0.8, 0.12, 'sawtooth', 0.14, v.pitch * 0.5); Sfx.tone(v.pitch * 1.1, 0.1, 'sawtooth', 0.1, v.pitch * 0.6, 0.11); }
  else { Sfx.tone(v.pitch, 0.05, v.type, 0.07); Sfx.tone(v.pitch * (kind === 'complain' ? 0.84 : 1.26), 0.05, v.type, 0.06, 0, 0.06); }
}
// A short reaction bubble (no voice blip), e.g. when an outburst startles someone.
function react(f, lines, kind, secs) {
  const t = Array.isArray(lines) ? pick(G.rng, lines) : lines; if (!t) return;
  f.bubble = G.chatBug > 0 ? EVENTS.chatbug.muffled : t; f.bubbleKind = kind === undefined ? 'complain' : kind; f.bubbleT = secs || 2;
}
// Emoji history of each friend's night, for the share card.
function trail(f, tok) {
  if (!tok || !f || !G.log.trail) return;
  (G.log.trail[f.id] = G.log.trail[f.id] || []).push(tok);
}
function esc(s) { return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
function banner(text, kind, secs) {
  Sfx.noise(0.18, 0.12, 1200, 0.7);
  ui.banner.textContent = text; ui.banner.className = kind || ''; ui.banner.classList.remove('hidden');
  G.bannerT = secs || 2.2;
}
let toastT = null;
function toast(msg, cls, ms) { ui.toast.textContent = msg; ui.toast.className = cls || ''; clearTimeout(toastT); toastT = setTimeout(() => ui.toast.classList.add('hidden'), ms || 1800); }

// ---------------------------------------------------------------------------
// Lobby mechanics
// ---------------------------------------------------------------------------
function setOnline(f, quiet) {
  f.online = true; f.status = 'Online';
  if (!quiet) { say(null, f.name + ' is online.'); Sfx.tone(880, 0.08, 'sine', 0.12, 1320); }
}
function invite(f) {
  if (!f.online || f.inLobby || f.invitePending > 0 || freeSlot() < 0 || f.reinviteT > 0 || G.serverDown > 0) return false;
  const d = f.def.joinDelay;
  f.invitePending = G.rng.range(d[0], d[1]) * (1 + 0.4 * f.annoyed);
  f.status = 'Invited…';
  Sfx.tone(660, 0.07, 'square', 0.08);
  return true;
}
function joinLobby(f, quiet) {
  const s = freeSlot(); if (s < 0) return false;
  G.lobby[s] = f.id; f.inLobby = true; f.ready = false; f.invitePending = 0; f.joinedAt = G.clock; f.spawnAt = G.t;
  f.kicked = false;
  if (G.ach && G.ach.seen && ROSTER.includes(f.id)) { G.ach.seen[f.id] = true; if (f.id === 'parker' && G.ach.parkerJoinedAt === null) G.ach.parkerJoinedAt = G.clock; }
  const r = f.def.readyTime; f.readyT = G.rng.range(r[0], r[1]) * (1 + 0.3 * f.annoyed);
  if (f.def.patience) f.patience = f.def.patience.max * (1 - 0.15 * f.annoyed);
  f.status = 'In lobby';
  if (!quiet) { say(f, pick(G.rng, f.def.lines.join)); Sfx.tone(520, 0.1, 'triangle', 0.15, 780); G.vibe = clamp(G.vibe + 4, 0, 100); }
  return true;
}
function leaveLobby(f, reason) {
  const s = G.lobby.indexOf(f.id); if (s >= 0) { G.lobby[s] = null; exitFx(s, f, reason === 'kicked' ? 'kick' : 'glitch'); }
  f.inLobby = false; f.ready = false; f.leaves++; G.log.leaves++;
  G.winT = 0;
  if (reason === 'dc' || reason === 'gone') { f.status = 'Online'; if (f.issue && f.issue.def.type !== 'disconnect') endIssue(f, true); return; }
  if (f.def.stranger) {
    // strangers don't come back
    if (f.issue) endIssue(f, true);
    f.online = false; f.gone = true; f.goneStatus = ''; f.status = '';
    if (reason === 'kicked') { G.log.kicks++; trail(f, SHARE.trail.kicked); say(null, tpl(ACTION_TEXT.kick.notice, nameVars(f))); }
    else { say(f, pick(G.rng, f.def.lines.leave)); say(null, f.name + ' left the party.'); trail(f, SHARE.trail.leave); }
    Sfx.tone(440, 0.18, 'sawtooth', 0.12, 220);
    return;
  }
  f.annoyed = Math.min(3, f.annoyed + 1);
  f.status = 'Online';
  if (reason === 'kicked') {
    // out for a while; anything they were doing carries on while they're gone
    f.reinviteT = gm2s(KICK_MINUTES); f.kicked = true;
    if (f.issue && !KEEP_ON_KICK.includes(f.issue.def.type)) endIssue(f, true);
    say(null, tpl(ACTION_TEXT.kick.notice, nameVars(f))); G.log.kicks++; trail(f, SHARE.trail.kicked);
    Sfx.tone(440, 0.18, 'sawtooth', 0.12, 220);
    return;
  }
  f.reinviteT = 10;
  if (f.issue && f.issue.def.type !== 'deadline') endIssue(f, true);
  if (f.shaun) { shaunLeaves(f); return; }
  say(f, pick(G.rng, f.def.lines.leave)); say(null, f.name + ' left the party.'); banner(f.name + ' left', 'bad', 1.6); G.vibe = clamp(G.vibe - 8, 0, 100);
  trail(f, SHARE.trail.leave);
  Sfx.tone(440, 0.18, 'sawtooth', 0.12, 220);
}
function setReady(f, on, quiet) {
  if (f.ready === on) return;
  f.ready = on; f.waitT = 0; f.complainT = 0;
  if (on && G.ach && f.id === 'parker' && G.ach.parkerReadyAt === null) G.ach.parkerReadyAt = G.clock;
  if (on) { const h = f.def.readyHold || [20, 30]; f.readyHold = G.rng.range(h[0], h[1]) * (1 - 0.2 * f.annoyed);
    const closeN = lobbyMembers().filter(m => m.ready).length;
    f.falseReady = G.rng.chance((0.14 + 0.1 * f.def.chaos) * (closeN >= 3 ? 0.5 : 1)) ? G.rng.range(2, 6) : 0; const recent = G.t - (f.lastReadyLine || -99) < 25; if (!quiet && !recent) { say(f, pick(G.rng, f.def.lines.ready)); f.lastReadyLine = G.t; } G.vibe = clamp(G.vibe + 10, 0, 100); Sfx.tone(990, 0.1, 'sine', 0.15, 1480); }
  else {
    G.winT = 0; if (!quiet) Sfx.tone(300, 0.15, 'square', 0.08, 200);
    if (hasBuff(f, 'bet')) { const b = f.buffs.bet.value; delete f.buffs.bet; G.vibe = clamp(G.vibe - b.vibe, 0, 100); notice(f.name + ': "' + b.lose + '"'); }
  }
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
function outburst(f, power, line) {
  const o = f.def.outburst; power = power || 1;
  const nextOutburst = () => { f.outburstT = G.rng.range(o.every[0], o.every[1]); };
  if (hasBuff(f, 'noOutburst')) { nextOutburst(); return; }
  if (hasBuff(f, 'muted')) { nextOutburst(); react(f, '🔇 ' + pick(G.rng, f.def.lines.outburst), ''); return; }   // nobody hears it
  say(f, line || pick(G.rng, f.def.lines.outburst), 'scream');
  G.log.outbursts++; f.ignoredT = o.ignoreSeconds; G.shake = Math.max(G.shake, 0.35 * power); trail(f, SHARE.trail.outburst);
  G.vibe = clamp(G.vibe - 5 * power, 0, 100);
  for (const m of lobbyMembers()) if (m !== f) {
    if (m.def.patience && !hasBuff(m, 'yellProof')) m.patience -= 8 * power * ((m.def.sensitive && m.def.sensitive.outburst) || 1);
    if (m.def.anger) m.anger += 18 * power;
    if (m.ready && !hasBuff(m, 'yellProof') && G.rng.chance(Math.min(1, 0.5 * power))) { setReady(m, false, true); m.readyT = G.rng.range(3, 6); react(m, m.def.lines.startled); }
  }
  Sfx.noise(0.25, 0.2 * power, 700, 0.8);
  breakPromises(f);
}
function ignoredOutburst(f) {
  say(f, pick(G.rng, f.def.lines.ignored), 'scream');
  G.shake = Math.max(G.shake, 0.4); G.vibe = clamp(G.vibe - 6, 0, 100);
  for (const m of lobbyMembers()) if (m !== f) { if (m.def.patience && !hasBuff(m, 'yellProof')) m.patience -= 6 * ((m.def.sensitive && m.def.sensitive.outburst) || 1); if (m.def.anger) m.anger += 12; }
  breakPromises(f);
}
// Anyone promised a quiet lobby leaves the moment someone yells.
function breakPromises(yeller) {
  const broken = lobbyMembers().filter(m => m !== yeller && hasBuff(m, 'promise'));
  for (const m of broken) { const p = m.buffs.promise.value; delete m.buffs.promise; notice(m.name + ': "' + p.line + '"'); leaveLobby(m, 'patience'); }
}
function startScream(f) {
  const a = f.def.anger;
  f.screaming = a.screamSeconds; f.anger = a.max; G.log.screams++; trail(f, SHARE.trail.scream);
  if (hasBuff(f, 'screamHarmless')) {   // push-to-talk: he screams, nobody hears
    react(f, '🔇 ' + pick(G.rng, f.def.lines.scream), '', 3); setReady(f, false, true); f.readyT = G.rng.range(4, 8);
    return;
  }
  say(f, pick(G.rng, f.def.lines.scream), 'scream');
  banner(f.name.toUpperCase() + ' IS SCREAMING', 'bad', 2.5);
  for (const m of lobbyMembers()) if (m.ready) { setReady(m, false, true); m.readyT = G.rng.range(4, 8); if (m !== f) react(m, m.def.lines.shushed); }
  G.shake = 1; G.vibe = clamp(G.vibe - 12, 0, 100);
  Sfx.noise(0.5, 0.3, 900, 0.8); Sfx.tone(180, 0.6, 'sawtooth', 0.2, 120);
  breakPromises(f);
}
function calmDown(f) {
  const a = f.def.anger;
  f.anger = clamp(f.anger - a.calm, 0, a.max);
  if (f.screaming > 0) { f.screaming = 0; G.vibe = clamp(G.vibe + 5, 0, 100); }
  say(f, pick(G.rng, f.def.lines.calmed));
}

function serversDown(minutes, bannerText, noticeText) {
  G.serverDown = gm2s(minutes);
  for (const m of lobbyMembers()) { const s = G.lobby.indexOf(m.id); if (s >= 0) { G.lobby[s] = null; exitFx(s, m, 'glitch'); } m.inLobby = false; m.ready = false; m.invitePending = 0; m.status = 'Servers down'; if (m.issue && m.issue.def.type !== 'deadline') endIssue(m, true); if (m.def.stranger) { m.gone = true; m.online = false; } }
  for (const id of ROSTER) { const f = G.friends[id]; if (f.invitePending > 0) { f.invitePending = 0; f.status = 'Servers down'; } }
  G.winT = 0; G.vote = null;
  banner(bannerText, 'bad', 3); notice(noticeText);
  G.vibe = clamp(G.vibe - 6, 0, 100); G.shake = Math.max(G.shake, 0.5);
  Sfx.noise(0.6, 0.3, 300, 0.6); Sfx.tone(200, 0.6, 'sawtooth', 0.2, 60);
}
function tick(dt) {
  G.t += dt;
  if (G.state === 'match') { tickMatch(dt); return; }
  if (G.state !== 'playing') return;
  G.clock += dt * MIN_PER_SEC;
  if (G.clock >= EVENING_MIN) { G.clock = EVENING_MIN; return endEvening('time'); }
  G.rcCooldown = Math.max(0, G.rcCooldown - dt);
  G.rcHighlight = Math.max(0, G.rcHighlight - dt);
  tickEvents(dt);
  // servers down: everyone sits in the friends list until they're back
  if (G.serverDown > 0) {
    G.serverDown -= dt;
    if (G.serverDown <= 0) {
      G.serverDown = 0; notice(EVENTS.maintenance.back);
      for (const id of ROSTER) { const f = G.friends[id]; if (f.online && !f.gone) f.status = 'Online'; if (f.def.neverLeaves) joinLobby(f, true); }
    }
  } else if (G.evening.maintenanceAt !== null && !G.evening.maintained && G.clock >= G.evening.maintenanceAt) {
    G.evening.maintained = true; serversDown(EVENTS.maintenance.minutes, EVENTS.maintenance.banner, EVENTS.maintenance.notice);
  }
  updateChemistry();
  const members = lobbyMembers();
  const anyNotReady = members.some(m => !m.ready);
  const screamer = members.find(m => m.screaming > 0);

  for (const id in G.friends) {
    const f = G.friends[id];
    for (const k in f.cd) f.cd[k] = Math.max(0, f.cd[k] - dt);
    f.talkT = Math.max(0, f.talkT - dt);
    f.reinviteT = Math.max(0, f.reinviteT - dt);
    tickBuffs(f, dt);
    if (f.shaun) tickShaun(f, dt);
    else if (f.disconnected) { f.dcT -= dt; if (f.dcT <= 0) { f.disconnected = false; setOnline(f, true); notice(f.name + ' is back online.'); if (f.issue) { notice(f.name + ': ' + pick(G.rng, f.issue.def.lines.end)); endIssue(f, true); } } }
    else if (!f.online && !f.gone && G.clock >= f.onlineAt) {
      if (f.sneaking) { f.sneaking = false; setOnline(f, true); notice(f.name + ' is online. "' + pick(G.rng, f.sneakDef.lines.end) + '"'); }
      else if (f.late) { setOnline(f, true); notice(f.name + ' is online. ' + pick(G.rng, f.late.def.lines.end)); f.late = null; }
      else setOnline(f);
    }
    if (f.sneaking && G.clock >= f.sneakFrom) f.status = 'Offline';
    if (f.invitePending > 0) { f.invitePending -= dt; if (f.invitePending <= 0) { f.invitePending = 0; if (!joinLobby(f)) f.status = 'Online'; } }
    if (!f.inLobby) { tickAway(f, dt); continue; }
    f.bubbleT = Math.max(0, f.bubbleT - dt);
    // scheduled issues fire once their time comes and the friend is actually here
    if (!f.issue) { const next = f.schedule.find(s => !s.done && s.at <= G.clock); if (next) { if (triggerIssue(f, next.def, next.minutes)) next.done = true; else next.at = G.clock + 4; } }
    if (f.issue) { tickIssue(f, dt); if (!f.inLobby) continue; }
    // readying up, and getting antsy once ready
    if (!f.ready) { if (!f.afk && !f.broken) { f.readyT -= dt / (hasBuff(f, 'sober') ? 1 : (f.readyMul || 1)); if (f.readyT <= 0) setReady(f, true); } }
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
      else { f.outburstT -= dt / (G.evening.fx.outburstMul || 1); if (f.outburstT <= 0) outburst(f); }
    }
    // patience (paused while away)
    if (f.def.patience && !f.afk) {
      let drain = f.def.patience.drain * (f.ready ? 1.3 : 0.8) * (G.evening.fx.patienceMul || 1) * chemMul(f, 'drainMul') * buffVal(f, 'drainMul') * (G.doubleXp > 0 ? EVENTS.doublexp.patienceMul : 1);
      if (members.length < needed()) drain *= 1.25;                     // waiting on invites
      if (screamer && screamer !== f && !hasBuff(screamer, 'screamHarmless') && !hasBuff(f, 'yellProof')) drain += 3 * ((f.def.sensitive && f.def.sensitive.scream) || 1);
      f.patience -= drain * dt;
      if (f.patience <= 0) { if (f.shaun) shaunLeaves(f); else leaveLobby(f, 'patience'); continue; }
    }
    // Justin's anger
    if (f.def.anger) {
      const a = f.def.anger;
      if (f.screaming > 0) {
        f.screaming -= dt; if (!hasBuff(f, 'screamHarmless')) { G.vibe -= 2.5 * dt; G.shake = Math.max(G.shake, 0.3); }
        if (f.screaming <= 0) { f.anger = a.max * 0.35; react(f, f.def.lines.afterScream, ''); }
      } else {
        let rise = a.rise * (anyNotReady ? 1 : 0.25) * (G.evening.fx.angerMul || 1) * chemMul(f, 'angerMul') * buffVal(f, 'angerRiseMul');
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
  for (const c of G.chemActive) if (c.vibe) G.vibe = Math.min(100, G.vibe + c.vibe * dt);
  if (G.vibe <= 0) { G.vibe = 0; return endEvening('vibe'); }

  // win check
  if (members.length >= needed() && !anyNotReady) {
    G.winT += dt;
    if (G.winT >= WIN_HOLD) {
      if (G.evening.crash && !G.evening.crashed) { G.evening.crashed = true; G.log.crashed = true; unlock('crash'); serversDown(EVENTS.crash.minutes, EVENTS.crash.banner, EVENTS.crash.notice); return; }
      return matchFound();
    }
  } else G.winT = 0;

  Guide.update(dt);
}

// Issues that keep going while a friend is out of the lobby (kicked mid-issue).
function tickAway(f, dt) {
  const I = f.issue;
  if (!I || !f.online || !KEEP_ON_KICK.includes(I.def.type) || I.def.type === 'deadline') return;
  if (I.fixing > 0) { I.fixing -= dt; if (I.fixing <= 0) endIssue(f, true); return; }
  I.remaining -= dt; if (I.remaining <= 0) endIssue(f, true);
}

// Timed events: party chat bug and double XP.
function tickEvents(dt) {
  const E = G.evening, cb = EVENTS.chatbug, dx = EVENTS.doublexp;
  if (G.chatBug > 0) { G.chatBug -= dt; if (G.chatBug <= 0) { G.chatBug = 0; notice(cb.back); } }
  else if (E.chatbugAt !== null && !E.chatbugged && G.clock >= E.chatbugAt && G.serverDown <= 0) {
    E.chatbugged = true; G.chatBug = gm2s(cb.minutes);
    banner(cb.banner, 'bad', 2.5); notice(cb.notice); Sfx.noise(0.4, 0.2, 2500, 2);
    for (const id in G.friends) { const f = G.friends[id]; if (f.bubbleT > 0) { f.bubble = cb.muffled; f.bubbleKind = ''; } }
  }
  if (G.doubleXp > 0) { G.doubleXp -= dt; if (G.doubleXp <= 0) { G.doubleXp = 0; notice(dx.back); } }
  else if (E.doublexpAt !== null && !E.doublexped && G.clock >= E.doublexpAt) {
    E.doublexped = true; G.doubleXp = gm2s(dx.minutes);
    banner(dx.banner, 'good', 2.5); notice(dx.notice); Sfx.tone(660, 0.1, 'square', 0.15); Sfx.tone(990, 0.15, 'square', 0.15, 0, 0.12);
  }
}

// ---------------------------------------------------------------------------
// Chemistry: pairs from friends.js that help or hurt while both are in the lobby.
// ---------------------------------------------------------------------------
function updateChemistry() {
  G.chemActive = CHEMISTRY.filter(c => c.pair.every(id => G.friends[id] && G.friends[id].inLobby));
  for (const c of G.chemActive) {
    const k = c.pair.join('+'); if (G.chem[k]) continue;
    G.chem[k] = true; notice(c.notice);
    const sp = c.line && G.friends[c.line[0]];
    if (sp && sp.inLobby) say(sp, c.line[1], c.kind === 'clash' ? 'complain' : '');
  }
}
function chemMul(f, key) { let m = 1; for (const c of G.chemActive) if (c[key] && c.targets.includes(f.id)) m *= c[key]; return m; }
function chemBadge(f) {
  let like = false, clash = false;
  for (const c of G.chemActive) if (c.pair.includes(f.id)) { if (c.kind === 'clash') clash = true; else like = true; }
  return (like ? ' 💚' : '') + (clash ? ' ⚡' : '');
}

function spawnConfetti(n, colors) {
  for (let i = 0; i < n; i++) G.confetti.push({ x: Math.random() * CW, y: -20 - Math.random() * CH * 0.6, vx: (Math.random() - 0.5) * 60, vy: 60 + Math.random() * 120, w: 5 + Math.random() * 6, h: 8 + Math.random() * 8, rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 8, color: colors[Math.floor(Math.random() * colors.length)] });
}
function matchFound() {
  G.state = 'match'; G.matchT = 0; G.matchLine = 0; G.lobbyMinutes = G.clock;
  showSplash();
  setTimeout(() => { if (G.state === 'match') spawnConfetti(160, ['#ffd23f', '#ff5a5a', '#4ade80', '#5ac8ff', '#ff8ad8', '#fff']); }, 3000);
  Sfx.tone(523, 0.15, 'square', 0.2); Sfx.tone(659, 0.15, 'square', 0.2, 0, 0.15); Sfx.tone(784, 0.3, 'square', 0.25, 0, 0.3);
  for (const m of lobbyMembers()) {
    trail(m, SHARE.trail.match);
    if (m.def.lines.matchFound) setTimeout(() => say(m, m.def.lines.matchFound), 600);
    if (m.def.codeRed) { G.log.withShaun = true; setTimeout(() => { if (G.state === 'match') banner(m.def.lines.matchBanner, 'good', 3); }, 3600); }
  }
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
  Music.stop(); ui.pauseScreen.classList.add('hidden'); ui.guide.classList.add('hidden');
  for (const id of ROSTER) { const f = G.friends[id]; if (!G.log.trail[id]) trail(f, f.shaun && f.shaun.appeared ? SHARE.trail.shaunLeft : G.ach.seen[id] ? SHARE.trail.quiet : SHARE.trail.never); }
  const sh = G.friends.shaun;
  const matchMin = kind === 'win' ? G.evening.matchMinutes : 0;
  G.result = {
    kind, day: G.day, mode: G.mode, lobbyMinutes: Math.round(kind === 'win' ? G.lobbyMinutes : G.clock), matchMinutes: matchMin,
    screams: G.log.screams, leaves: G.log.leaves, kicks: G.log.kicks, outbursts: G.log.outbursts, unreadies: G.log.unreadies, caught: G.log.caught, crashed: G.log.crashed,
    parkerAfk: G.log.afk.parker || 0, issues: G.log.issues, lines: G.log.lines, golden: G.evening.golden, twist: G.evening.twist ? G.evening.twist.text : '',
    shaun: sh ? { appeared: sh.shaun.appeared, stayedMin: Math.round(s2gm(sh.shaun.stayed)), withMatch: G.log.withShaun } : null,
    trail: G.log.trail,
  };
  if (kind !== 'win') { banner(RESULT_LINES.banners[kind], 'bad', 3); Sfx.tone(220, 0.8, 'sawtooth', 0.2, 80); }
  closeMenu();
  checkEndAchievements(G.result);
  if (G.mode !== 'debug') {
    applyStats(Store.stats, G.result, G.day); Store.data.runs = (Store.data.runs || 0) + 1;
    G.result.newBest = recordTonight(G.result); Store.data.guideDone = true; Store.save();
  }
  setTimeout(() => showResult(G.result, G.mode), kind === 'win' ? 800 : kind === 'quit' ? 600 : 2200);
}
// Best result for today's evening, so replays have something to beat.
function recordTonight(r) {
  const days = Store.data.days = Store.data.days || {};
  const d = days[r.day] = days[r.day] || { runs: 0, best: null };
  d.runs++;
  let improved = false;
  if (r.kind === 'win' && (d.best === null || r.lobbyMinutes < d.best)) { d.best = r.lobbyMinutes; improved = true; }
  for (const k of Object.keys(days)) if (+k < r.day - 7) delete days[k];
  return improved;
}
function bestText(day, isNew) {
  if (Daily.debug) return '';
  const d = (Store.data.days || {})[day]; if (!d || !d.runs) return '';
  const tries = d.runs + (d.runs === 1 ? ' try' : ' tries');
  return d.best !== null ? (isNew ? '🎉 New best tonight: ' : '🏆 Best tonight: ') + 'match after ' + fmtDur(d.best) + ' · ' + tries : 'No match yet tonight · ' + tries;
}
function applyStats(s, r, day) {
  s.evenings++;
  if (r.kind === 'win') { s.matches++; s.streak++; if (s.streak > s.bestStreak) s.bestStreak = s.streak; }
  else s.streak = 0;
  if (r.lobbyMinutes > s.longestLobby) s.longestLobby = r.lobbyMinutes;
  if (r.shaun && r.shaun.withMatch) s.shaunMatches++;
  if (r.shaun && r.shaun.stayedMin > s.shaunLongest) s.shaunLongest = r.shaun.stayedMin;
  s.parkerAfk += r.parkerAfk || 0;
  s.andreOutbursts += r.outbursts || 0;
  s.lastDay = day;
}
// ---------------------------------------------------------------------------
// Achievements
// ---------------------------------------------------------------------------
function unlock(id) {
  if (G.mode === 'debug') return;
  Store.data.achievements = Store.data.achievements || {};
  if (Store.data.achievements[id]) return;
  const a = ACHIEVEMENTS.find(x => x.id === id); if (!a) return;
  Store.data.achievements[id] = G.day; Store.save();
  toast('🏆 ' + a.title, 'ach', 3200);
  Sfx.tone(880, 0.1, 'square', 0.15); Sfx.tone(1175, 0.1, 'square', 0.15, 0, 0.1); Sfx.tone(1760, 0.25, 'square', 0.18, 0, 0.2);
}
function checkEndAchievements(r) {
  const A = G.ach;
  if (r.kind === 'win') {
    if (r.lobbyMinutes >= 228) unlock('lotr');
    if (r.screams >= 3) unlock('justin');
    if (r.lobbyMinutes <= 30) unlock('early');
    if (r.lobbyMinutes >= 225) unlock('lastcall');
    if (A.actions === 0) unlock('noactions');
    if (r.shaun && r.shaun.withMatch) unlock('shaunmatch');
  }
  if (r.golden) unlock('golden');
  if (r.caught) unlock('caught');
  if (r.crashed) unlock('crash');
  if (r.shaun && r.shaun.stayedMin >= 10) unlock('shaun10');
  if (A.parkerJoinedAt !== null && A.parkerJoinedAt <= 15 && A.parkerReadyAt !== null && A.parkerReadyAt <= 20) unlock('parkerontime');
  if (A.listened >= 5) unlock('listener');
  if (Object.keys(A.seen).length >= ROSTER.length) unlock('allseven');
  if (A.restarts >= 3) unlock('restart3');
}
function hideScreens() { for (const s of [ui.title, ui.result, ui.statsScreen, ui.loading, ui.pauseScreen]) s.classList.add('hidden'); ui.app.classList.add('hidden'); }
function showResult(r, mode) {
  hideScreens();
  G.state = 'over'; G.shownDay = r.day;
  const debug = mode === 'debug', win = r.kind === 'win';
  ui.resultDay.textContent = 'Evening #' + r.day;
  ui.resultTitle.textContent = RESULT_LINES.titles[r.kind];
  ui.resultTitle.classList.toggle('lose', !win);
  ui.resultTag.classList.toggle('hidden', !debug);
  ui.resultTag.textContent = 'DEBUG — NOT COUNTED';
  ui.resultBig.innerHTML = win ? `Lobby: ${fmtDur(r.lobbyMinutes)}. Match: ${fmtDur(r.matchMinutes)}.<br><span style="font-weight:600;color:#c7cdf0">${pick(new Rng(r.day), RESULT_LINES.win)}</span>`
    : `${RESULT_LINES[r.kind]}<br><span style="font-weight:600;color:#c7cdf0">Lobby: ${fmtDur(r.lobbyMinutes)}. Match: never.</span>`;
  const rows = [], L = RESULT_LABELS;
  const trouble = Object.entries(r.issues || {}).sort((a, b) => b[1] - a[1])[0];
  if (trouble) rows.push([L.trouble, `${FRIENDS[trouble[0]].name} (${trouble[1]} issue${trouble[1] === 1 ? '' : 's'})`]);
  if (r.shaun) rows.push([L.shaun, r.shaun.withMatch ? L.shaunMatch : r.shaun.appeared ? (r.shaun.stayedMin > 0 ? tpl(L.shaunStayed, { dur: fmtDur(r.shaun.stayedMin) }) : L.shaunPopped) : L.shaunNever]);
  rows.push([L.parker, '×' + r.parkerAfk]);
  rows.push([L.andre, '×' + r.outbursts]);
  rows.push([L.justin, '×' + r.screams]);
  rows.push([L.unreadies, '×' + r.unreadies]);
  rows.push([L.leaves, '×' + r.leaves]);
  if (r.kicks) rows.push([L.kicks, '×' + r.kicks]);
  if (r.caught) rows.push([L.caught, 'yes']);
  if (r.crashed) rows.push([L.crashed, 'yes']);
  const talk = Object.entries(r.lines || {}).sort((a, b) => b[1] - a[1])[0];
  if (talk) rows.push([L.talk, `${FRIENDS[talk[0]].name} (${talk[1]} lines)`]);
  if (r.golden) rows.push([L.golden, 'yes']);
  else if (r.twist) rows.push([L.twist, r.twist]);
  ui.resultBody.innerHTML = rows.map(([k, v]) => `<div class="row"><span>${k}</span><span>${v}</span></div>`).join('');
  ui.share.classList.toggle('hidden', debug);
  ui.resultBest.textContent = bestText(r.day, r.newBest);
  ui.result.classList.remove('hidden');
  refreshCountdowns();
}
function shareTextFor(r) {
  const lines = [tpl(SHARE.title, { day: r.day })].concat(shareHead(r));
  // one row per friend: the emoji story of their night
  lines.push('');
  const ids = ROSTER.concat(Object.keys(r.trail || {}).filter(id => !ROSTER.includes(id)));
  for (const id of ids) {
    const toks = (r.trail || {})[id]; if (!toks || !toks.length) continue;
    const shown = toks.length > 9 ? toks.slice(0, 8).concat('…') : toks;
    lines.push(FRIENDS[id].name + ' ' + shown.join(''));
  }
  lines.push('');
  if (r.caught) lines.push(SHARE.caught);
  if (r.kind === 'win') lines.push(SHARE.tooney);
  if (r.golden) lines.push(SHARE.golden);
  lines.push(gameUrl());
  return lines.join('\n');
}
function shareHead(r) {
  const T = tpl, lines = [];
  if (r.kind === 'win') lines.push(T(SHARE.win, { lobby: fmtDur(r.lobbyMinutes), match: fmtDur(r.matchMinutes) }));
  else { lines.push(r.kind === 'vibe' ? SHARE.loseVibe : r.kind === 'quit' ? SHARE.loseQuit : SHARE.loseTime); lines.push(T(SHARE.lobbyOnly, { lobby: fmtDur(r.lobbyMinutes) })); }
  if (r.shaun) lines.push(r.shaun.withMatch ? SHARE.shaunMatch : r.shaun.appeared ? T(SHARE.shaunLeft, { min: fmtDur(Math.max(1, r.shaun.stayedMin)) }) : SHARE.shaunNever);
  return lines;
}
// Share an image card when the phone supports it, text otherwise.
async function shareResult(r) {
  const text = shareTextFor(r);
  try {
    if (document.fonts && document.fonts.load) await document.fonts.load('20px Bungee');
    const cv = shareCanvas(r);
    const blob = await new Promise(res => cv.toBlob(res, 'image/png'));
    const file = blob && new File([blob], 'the-lobby-' + r.day + '.png', { type: 'image/png' });
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], text }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
    }
  } catch (_) {}
  shareText(text, toast);
}
function shareCanvas(r) {
  return Art.shareCard({ title: tpl(SHARE.title, { day: r.day }), lines: shareHead(r), entries: resultEntries(r), url: gameUrl().replace(/^https?:\/\//, ''), clock: r.lobbyMinutes, win: r.kind === 'win' });
}
function showStats() {
  const s = Store.stats;
  const rate = s.evenings ? Math.round(100 * s.matches / s.evenings) : 0;
  const L = STATS_LABELS;
  const rows = [[L.evenings, s.evenings], [L.matches, s.matches], [L.rate, rate + '%'], [L.longest, fmtDur(s.longestLobby)],
    [L.shaunMatches, s.shaunMatches], [L.shaunLongest, fmtDur(s.shaunLongest)], [L.parkerAfk, s.parkerAfk], [L.andreOutbursts, s.andreOutbursts],
    [L.streak, s.streak], [L.bestStreak, s.bestStreak]];
  ui.statsBody.innerHTML = rows.map(([k, v]) => `<div class="row"><span>${k}</span><b>${v}</b></div>`).join('');
  const got = Store.data.achievements || {};
  const n = Object.keys(got).length;
  ui.achBody.innerHTML = `<div id="ach-title">ACHIEVEMENTS ${n}/${ACHIEVEMENTS.length}</div>` + ACHIEVEMENTS.map(a => `<div class="ach ${got[a.id] ? 'on' : ''}">${a.title}</div>`).join('');
  ui.statsScreen.classList.remove('hidden');
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
  const fx = G.evening.fx;
  const defs = (f.def.issues || []).filter(d => !(fx.skip && fx.skip.friend === f.id && fx.skip.issue === d.id)).filter(d => !(G.evening.golden && (d.type === 'sneak' || d.type === 'late'))); if (!defs.length) return;
  const rng = G.rng;
  let pool = defs.map(d => (fx.weight && fx.weight.friend === f.id && fx.weight.issue === d.id) ? Object.assign({}, d, { weight: (d.weight || 1) * fx.weight.mul }) : d);
  const chosen = [];
  const sneak = pool.find(d => d.type === 'sneak');
  if (sneak) { pool = pool.filter(d => d !== sneak); if (rng.chance(fx.sneakChance !== undefined ? fx.sneakChance : (f.def.sneakChance || 0))) chosen.push(sneak); }
  const n = f.def.issuesPerEvening ? rng.int(f.def.issuesPerEvening[0], f.def.issuesPerEvening[1]) : 1;
  for (let i = 0; i < n && pool.length; i++) { const d = weightedPick(rng, pool); chosen.push(d); pool = pool.filter(x => x !== d); }
  let nextAt = f.onlineAt + rng.range(6, 14);
  for (const def of chosen) {
    const minutes = def.minutes ? rng.range(def.minutes[0], def.minutes[1]) : 0;
    if (def.type === 'late') { f.late = { def, used: {} }; f.onlineAt += minutes; continue; }
    if (def.type === 'sneak') { f.sneaking = true; f.sneakFrom = f.onlineAt; f.onlineAt += minutes; f.sneakDef = def; continue; }
    if (def.atJoin) { f.schedule.push({ def, at: 0, minutes }); continue; }
    f.schedule.push({ def, at: Math.min(205, nextAt), minutes });
    nextAt += rng.range(18, 40);
  }
}

function triggerIssue(f, def, minutesIn) {
  if (f.issue) return false;
  if (def.type === 'vote' && G.vote) return false;            // one vote at a time
  const rng = G.rng;
  if (def.type === 'stranger') { G.log.issues[f.id] = (G.log.issues[f.id] || 0) + 1; spawnStranger(f, def); return true; }
  const minutes = minutesIn !== undefined ? minutesIn : (def.minutes ? rng.range(def.minutes[0], def.minutes[1]) : 0);
  const label = def.labels ? pick(rng, def.labels) : def.label;
  const I = { def, minutes, remaining: gm2s(minutes), total: gm2s(minutes), used: {}, label, t: 0, fixing: 0, sulk: 0 };
  f.issue = I; f.issuesHad++;
  G.log.issues[f.id] = (G.log.issues[f.id] || 0) + 1;
  trail(f, def.icon);
  setTimeout(() => checkBackfire(f), 900);   // after his opening line
  const vars = { label, time: '', name: f.name };
  switch (def.type) {
    case 'afk':
      f.afk = true; setReady(f, false, true); G.log.afk[f.id] = (G.log.afk[f.id] || 0) + 1;
      say(f, tpl(pick(rng, def.lines.start), vars), 'complain'); break;
    case 'download':
      f.afk = true; setReady(f, false, true); say(f, pick(rng, def.lines.start), 'complain'); break;
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

// Justin-style: drops a stranger into a free slot.
function spawnStranger(host, def) {
  trail(host, def.icon);
  if (freeSlot() < 0 || G.serverDown > 0 || (G.friends[def.stranger] && G.friends[def.stranger].inLobby)) { say(host, pick(G.rng, def.lines.full), 'complain'); return; }
  const s = makeFriend(def.stranger); G.friends[s.id] = s;
  setOnline(s, true); joinLobby(s, true);
  say(host, pick(G.rng, def.lines.start), 'scream');
  setTimeout(() => { if (s.inLobby) say(s, pick(G.rng, s.def.lines.join)); }, 1200);
  notice(tpl(def.notice, { host: host.name, name: s.name }));
}

function endIssue(f, silent) {
  const I = f.issue; if (!I) return;
  const wasAfk = f.afk || f.broken;
  f.issue = null; f.afk = false; f.broken = false; f.readyMul = 1; f.wanderBack = 0;
  if (G.vote === f) G.vote = null;
  if (!silent && I.def.achievementOnEnd && f.inLobby) unlock(I.def.achievementOnEnd);
  if (!silent && I.def.lines.end) say(f, pick(G.rng, I.def.lines.end));
  if (wasAfk && f.inLobby) f.readyT = G.rng.range(3, 6);
}

function tickIssue(f, dt) {
  const I = f.issue, def = I.def, rng = G.rng;
  I.t += dt;
  switch (def.type) {
    case 'afk': case 'download':
      I.remaining -= dt; if (I.remaining <= 0) endIssue(f); break;
    case 'fixable':
      if (I.fixing > 0) { I.fixing -= dt; if (I.fixing <= 0) { f.broken = false; say(f, pick(rng, def.lines.fixed)); endIssue(f, true); if (f.inLobby) f.readyT = 1; } }
      else { I.remaining -= dt; if (I.remaining <= 0) { say(f, pick(rng, def.lines.timeout)); endIssue(f, true); } }
      break;
    case 'deadline':
      if (G.clock >= f.deadlineAt) {
        say(f, pick(rng, def.lines.leave), 'complain');
        leaveLobby(f, 'gone'); f.online = false; f.gone = true; f.goneStatus = def.goneStatus || 'Gone for the night'; f.status = f.goneStatus;
        notice(f.name + ' is gone for the night.'); trail(f, SHARE.trail.gone); endIssue(f, true);
      }
      break;
    case 'slowready':
      I.remaining -= dt;
      if (f.wanderBack > 0) { f.wanderBack -= dt; if (f.wanderBack <= 0) { f.afk = false; say(f, pick(rng, def.lines.during), 'complain'); } }
      else if (!hasBuff(f, 'sober')) { f.wanderT -= dt; if (f.wanderT <= 0) { f.wanderT = rng.range(10, 16); if (rng.chance(0.5)) { f.afk = true; setReady(f, false, true); f.wanderBack = gm2s(rng.range(3, 5)); say(f, pick(rng, def.lines.wander), 'complain'); } else say(f, pick(rng, def.lines.during), ''); } }
      if (I.remaining <= 0) endIssue(f);
      break;
    case 'soju':
      I.remaining -= dt; f.sojuT -= dt;
      if (f.sojuT <= 0) { f.sojuT = rng.range(3, 7); setReady(f, !f.ready, true); say(f, pick(rng, def.lines.during), f.ready ? '' : 'complain'); }
      if (I.remaining <= 0) endIssue(f);
      break;
    case 'vote':
      if (I.sulk > 0) { I.sulk -= dt; if (I.sulk <= 0) endIssue(f); break; }
      f.voteT -= dt;
      if (f.voteT <= 0) voteTimeout(f, I);
      break;
  }
}
// Nobody answered in time. What happens next is in the issue's data.
function voteTimeout(f, I) {
  const def = I.def, to = def.timeout || { unreadyAll: true }, rng = G.rng;
  G.vote = null;
  say(f, pick(rng, def.lines.timeout), 'scream');
  G.vibe = clamp(G.vibe - (def.vibe || 10), 0, 100); G.shake = Math.max(G.shake, 0.3);
  if (def.timeoutBanner) banner(def.timeoutBanner, 'bad', 2.2);
  if (to.sulk) {
    f.afk = true; setReady(f, false, true); I.sulk = gm2s(rng.range(to.sulk[0], to.sulk[1]));
    G.log.afk[f.id] = (G.log.afk[f.id] || 0) + 1;
  } else if (to.disconnect) {
    endIssue(f, true); leaveLobby(f, 'dc');
    f.online = false; f.disconnected = true; f.dcT = gm2s(rng.range(to.disconnect[0], to.disconnect[1])); f.status = 'Disconnected';
    notice(f.name + ' disconnected.');
  } else {
    endIssue(f, true);
    for (const m of lobbyMembers()) if (m.ready) { setReady(m, false, true); m.readyT = rng.range(3, 7); }
  }
}

// A button from friends.js for the current issue.
function runIssueButton(f, I, b) {
  if (b.once && I.used[b.id]) return 'Already used that one.';
  I.used[b.id] = true;
  if (b.achievement) unlock(b.achievement);
  switch (b.kind) {
    case 'shorten': I.remaining -= gm2s(b.minutes); break;
    case 'lengthen': I.remaining += gm2s(b.minutes); break;
    case 'restart': I.remaining = I.total; break;
    case 'resolve': endIssue(f, true); break;
    case 'postpone': f.deadlineAt += b.minutes; notice(f.name + ' now leaves at ' + fmtClock(f.deadlineAt) + '.'); break;
    case 'fix': I.fixing = b.seconds || 4; break;
    case 'answer': G.vote = null; endIssue(f, true); if (b.anger && f.def.anger) f.anger = clamp(f.anger + b.anger, 0, 100); G.vibe = clamp(G.vibe + 3, 0, 100); break;
  }
  if (b.kind !== 'lengthen' && b.kind !== 'restart') G.vibe = clamp(G.vibe + 5, 0, 100);
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
  G.log.caught = true; unlock('caught'); trail(f, SHARE.trail.caught);
  if (!joinLobby(f, true)) f.status = 'Online';
  say(f, pick(G.rng, f.def.lines.caught), 'complain');
  f.annoyed = Math.min(3, f.annoyed + 1);
  for (const m of lobbyMembers()) if (m !== f && m.def.lines.caughtSneak) {
    if (m.def.anger) m.anger = clamp(m.anger + 45, 0, 100);
    say(m, m.def.lines.caughtSneak, 'scream'); G.shake = Math.max(G.shake, 0.4);
  }
  G.vibe = clamp(G.vibe - 4, 0, 100);
  Sfx.tone(300, 0.2, 'sawtooth', 0.15, 150);
}

// Shaun shows up exactly once. Keeping him is the hard part.
function shaunAppears(f) {
  const S = f.shaun; S.appeared = true; S.appearedAt = G.clock;
  setOnline(f, true); f.status = 'Online';
  banner(tpl(f.def.lines.appearBanner, { days: S.daysAway }), 'good', 3.5);
  notice(tpl(f.def.lines.appearNotice, { days: S.daysAway }));
  Sfx.tone(523, 0.12, 'square', 0.18); Sfx.tone(784, 0.12, 'square', 0.18, 0, 0.14); Sfx.tone(1046, 0.25, 'square', 0.2, 0, 0.28);
  G.shake = Math.max(G.shake, 0.25);
  for (const id of ROSTER) {
    const g = G.friends[id]; if (g === f || !g.def.lines.greetCodeRed) continue;
    if (g.inLobby) say(g, g.def.lines.greetCodeRed); else notice(g.name + ': ' + g.def.lines.greetCodeRed);
  }
}
function shaunLeaves(f) {
  const S = f.shaun; S.left = true; trail(f, SHARE.trail.shaunLeft);
  if (f.inLobby) { const s = G.lobby.indexOf(f.id); if (s >= 0) { G.lobby[s] = null; exitFx(s, f, 'glitch'); } f.inLobby = false; f.ready = false; G.winT = 0; }
  f.online = false; f.gone = true; f.goneStatus = f.def.goneStatus; f.status = f.goneStatus; f.invitePending = 0;
  banner(f.def.lines.gone, 'bad', 3); notice(f.def.lines.gone);
  Sfx.tone(440, 0.3, 'sine', 0.15, 220);
  G.vibe = clamp(G.vibe - 6, 0, 100);
}
function tickShaun(f, dt) {
  const S = f.shaun;
  if (!S.appeared) { if (G.clock >= f.onlineAt) shaunAppears(f); return; }
  if (S.left) return;
  if (f.inLobby) { S.stayed += dt; if (!S.ach10 && s2gm(S.stayed) >= 10) { S.ach10 = true; unlock('shaun10'); } }
  else if (f.online && f.invitePending <= 0) { S.windowT -= dt; if (S.windowT <= 0) shaunLeaves(f); }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Signature actions: each friend's own moves, read from FRIENDS[id].actions.
// ---------------------------------------------------------------------------
const hasBuff = (f, k) => !!(f && f.buffs && f.buffs[k]);
const buffVal = (f, k) => (f.buffs && f.buffs[k] && typeof f.buffs[k].value === 'number') ? f.buffs[k].value : 1;
const sneakSuspicious = f => f.sneaking && !!f.sneakDef && G.clock >= f.sneakFrom + (f.sneakDef.suspicionMinutes || 0);
const TIMED = ['afk', 'fixable', 'download', 'soju', 'slowready'];
function etaSeconds(f) {
  if (f.disconnected) return f.dcT;
  const I = f.issue; if (!I || !f.inLobby) return 0;
  if (I.sulk > 0) return I.sulk;
  return TIMED.includes(I.def.type) ? Math.max(0, I.remaining) : 0;
}
const etaText = f => f.issue && f.issue.revealed && f.inLobby ? ' · ' + Math.max(1, Math.ceil(s2gm(etaSeconds(f)))) + 'm' : '';
function addBuff(f, spec) {
  const secs = spec.seconds !== undefined ? spec.seconds : gm2s(spec.minutes || 10);
  let first = true;
  for (const k of Object.keys(spec)) {
    if (k === 'seconds' || k === 'minutes' || k === 'onEnd') continue;
    f.buffs[k] = { t: secs, value: spec[k], onEnd: first ? spec.onEnd : null }; first = false;
  }
  if (spec.muted) f.ignoredT = 0;
}
function tickBuffs(f, dt) {
  for (const k of Object.keys(f.buffs)) {
    const b = f.buffs[k]; b.t -= dt; if (b.t > 0) continue;
    delete f.buffs[k];
    if (k === 'bet' && f.ready && f.inLobby) { say(f, b.value.win); G.vibe = clamp(G.vibe + 3, 0, 100); if (b.value.achievement) unlock(b.value.achievement); }
    const e = b.onEnd;
    if (e && f.inLobby && G.state === 'playing') { if (e.achievement) unlock(e.achievement); if (e.outburst && f.def.outburst) outburst(f, e.outburst, e.line); else if (e.line) say(f, e.line, 'complain'); }
  }
  for (const p of f.pending.slice()) {
    if (G.clock < p.at) continue;
    f.pending.splice(f.pending.indexOf(p), 1);
    if (f.gone || !f.online) continue;
    notice(f.name + ': "' + p.line + '"');
    if (f.inLobby) leaveLobby(f, 'gone');
    f.online = false; f.gone = true; f.goneStatus = p.goneStatus || 'Gone for the night'; f.status = f.goneStatus; f.invitePending = 0;
    trail(f, SHARE.trail.gone);
  }
}
function checkBackfire(f) {
  const b = f.backfire; if (!b || !f.issue || !b.issues.includes(f.issue.def.id) || !f.inLobby) return;
  f.backfire = null;
  if (f.def.patience) f.patience = clamp(f.patience + b.patience, 0, f.def.patience.max);
  say(f, b.line, 'complain');
}
function needsMet(f, a) {
  const n = a.needs || {};
  if (n.friend && !(G.friends[n.friend] && G.friends[n.friend].inLobby)) return false;
  if (n.issue && !(f.issue && f.issue.def.id === n.issue)) return false;
  if (n.issueType && !(f.issue && f.issue.def.type === n.issueType)) return false;
  if (n.late && !(f.late && f.late.def.id === n.late && !f.online)) return false;
  if (n.calm && f.ignoredT > 0) return false;
  if (n.notReady && f.ready) return false;
  if (n.notAway && (f.afk || f.broken)) return false;
  if (n.timed && !(etaSeconds(f) > 0)) return false;
  if ((a.where || 'lobby') === 'offline' && (f.online || f.inLobby)) return false;
  return true;
}
function canRunSig(f, a) {
  if (G.state !== 'playing') return false;
  if ((a.where || 'lobby') === 'lobby' && !f.inLobby) return false;
  if (a.once && f.usedActions[a.id]) return false;
  if (a.oncePerIssue && f.issue && f.issue.used['sig_' + a.id]) return false;
  if ((f.cd['sig_' + a.id] || 0) > 0) return false;
  return needsMet(f, a);
}
function sigHint(f, a) {
  if (a.once && f.usedActions[a.id]) return 'used tonight';
  if (a.oncePerIssue && f.issue && f.issue.used['sig_' + a.id]) return 'used for this one';
  const cd = f.cd['sig_' + a.id] || 0; if (cd > 0) return 'cooldown ' + Math.ceil(cd) + 's';
  if (!needsMet(f, a)) return a.needText || (a.where === 'offline' ? 'he is online' : 'not now');
  return a.hint || '';
}
function applySelf(f, s) {
  if (s.patience && f.def.patience) f.patience = clamp(f.patience + s.patience, 0, f.def.patience.max);
  if (s.anger && f.def.anger) f.anger = clamp(f.anger + s.anger, 0, f.def.anger.max);
  if (s.angerMul && f.def.anger) f.anger *= s.angerMul;
  if (s.annoyed) f.annoyed = Math.min(3, f.annoyed + s.annoyed);
  if (s.readyNow && f.inLobby && !f.afk && !f.broken) setReady(f, true, true);
  if (s.hold) f.readyHold += s.hold;
  if (s.comeOnline) f.onlineAt = G.clock;
  if (s.endIssue && f.issue) { f.deadlineAt = null; endIssue(f, true); }
  if (s.shortenPct && f.issue) f.issue.remaining *= (1 - s.shortenPct);
  if (s.reveal && f.issue) f.issue.revealed = true;
  if (s.delayOutburst) f.outburstT += s.delayOutburst;
}
function scheduleLater(f, later) {
  const def = (f.def.issues || []).find(d => d.id === later.issue); if (!def) return;
  if ((f.issue && f.issue.def.id === def.id) || f.schedule.some(s => s.def.id === def.id && !s.done)) return;
  f.schedule.push({ def, at: G.clock + G.rng.range(later.in[0], later.in[1]), minutes: G.rng.range(def.minutes[0], def.minutes[1]) });
}
function runSig(f, a) {
  if (!canRunSig(f, a)) return '';
  if (a.cooldown) f.cd['sig_' + a.id] = a.cooldown;
  if (a.once) f.usedActions[a.id] = true;
  if (a.oncePerIssue && f.issue) f.issue.used['sig_' + a.id] = true;
  Sfx.tone(760, 0.06, 'triangle', 0.12); Sfx.tone(1140, 0.08, 'triangle', 0.1, 0, 0.07);
  const side = a.coin ? (G.rng.chance(a.coin.chance) ? a.coin.win : a.coin.lose) : a;
  const vars = { name: f.name, real: fmtDur(Math.max(1, Math.ceil(s2gm(etaSeconds(f))))) };
  let result = side.result;
  const self = side.self || {};
  if (self.checkSneak) { if (f.sneaking && G.clock >= f.sneakFrom) catchSneak(f); else result = a.miss; }
  applySelf(f, self);
  if (side.all) {
    for (const m of lobbyMembers()) if (m !== f) applySelf(m, { patience: side.all.patience });
    if (side.all.vibe) G.vibe = clamp(G.vibe + side.all.vibe, 0, 100);
    if (side.all.patience < 0) G.vibe = clamp(G.vibe + side.all.patience / 2, 0, 100);
  }
  if (side.speaker) { const sp = G.friends[side.speaker[0]]; if (sp && sp.inLobby) say(sp, side.speaker[1]); }
  if (side.line) setTimeout(() => { if (f.inLobby) say(f, side.line); }, side.speaker ? 700 : 0);
  if (a.others) for (const id in a.others) {
    const o = G.friends[id], spec = a.others[id]; if (!o || !o.inLobby || o === f) continue;
    applySelf(o, spec);
    if (spec.buff) addBuff(o, spec.buff);
    if (spec.outburst && o.def.outburst) setTimeout(() => { if (o.inLobby && G.state === 'playing') outburst(o, 1, spec.line); }, 800);
    else if (spec.line) setTimeout(() => { if (o.inLobby) say(o, spec.line, 'complain'); }, 800);
  }
  if (a.buff) addBuff(f, a.buff);
  if (a.later) scheduleLater(f, a.later);
  if (a.risk && G.rng.chance(a.risk.chance)) f.pending.push({ at: G.clock + G.rng.range(a.risk.in[0], a.risk.in[1]), line: a.risk.line, goneStatus: a.risk.goneStatus });
  if (a.backfire) { f.backfire = a.backfire; checkBackfire(f); }
  return tpl(result, vars);
}

const AT = ACTION_TEXT;
const ACTIONS = {
  invite: { cls: 'primary', can: f => f.online && !f.gone && !f.disconnected && !f.inLobby && f.invitePending <= 0 && freeSlot() >= 0 && f.reinviteT <= 0 && G.serverDown <= 0,
    run: f => { invite(f); return tpl(AT.invite.result, nameVars(f)); } },
  ping: { can: f => f.inLobby && f.cd.ping <= 0,
    run: f => { G.ach.actions++; f.cd.ping = 4; Sfx.tone(1200, 0.05, 'square', 0.1);
      const I = f.issue;
      if (I && I.def.pingLine) { I.remaining -= gm2s(I.def.pingMinutes || 4); say(f, I.def.pingLine); return I.def.pingResult; }
      if (f.afk || f.broken) return tpl(AT.ping.away, nameVars(f));
      f.readyT -= 2; f.readyHold += 4; if (f.def.anger) f.anger += 4; say(f, pick(G.rng, f.def.lines.ping)); return tpl(AT.ping.result, nameVars(f)); } },
  text: { can: f => f.inLobby && f.cd.text <= 0,
    run: f => { G.ach.actions++; f.cd.text = 20; f.readyT -= 4; f.readyHold += 10; f.waitT = 0; if (f.def.patience) f.patience = clamp(f.patience + 12, 0, f.def.patience.max); if (f.def.anger) f.anger = clamp(f.anger - 10, 0, 100); say(f, pick(G.rng, f.def.lines.text)); return tpl(AT.text.result, nameVars(f)); } },
  call: { can: f => f.inLobby && f.cd.call <= 0,
    run: f => { G.ach.actions++; f.cd.call = 30; G.log.calls++;
      for (const m of lobbyMembers()) if (m !== f) { if (m.def.patience) m.patience -= 8; if (m.def.anger) m.anger += 10; }
      Sfx.tone(700, 0.12, 'sine', 0.12); Sfx.tone(700, 0.12, 'sine', 0.12, 0, 0.25);
      const w = f.issue && f.issue.def.worse;
      if (w && w.call) { if (w.achievement) unlock(w.achievement); f.issue.remaining += gm2s(w.call); if (f.issue.def.type === 'deadline') f.deadlineAt -= 10; say(f, w.line || pick(G.rng, f.def.lines.call), 'complain'); return AT.call.worse; }
      if (f.afk || f.broken) { say(f, pick(G.rng, f.def.lines.call), 'complain'); return tpl(AT.call.away, nameVars(f)); }
      f.readyT = Math.min(f.readyT, 0.5); f.readyHold += 15; f.waitT = 0; if (f.def.patience) f.patience = clamp(f.patience + 6, 0, f.def.patience.max);
      say(f, pick(G.rng, f.def.lines.call)); return tpl(AT.call.result, nameVars(f)); } },
  calm: { cls: 'fix', can: f => f.inLobby && !!f.def.anger && f.cd.calm <= 0,
    run: f => { f.cd.calm = 8; calmDown(f); return tpl(AT.calm.result, nameVars(f)); } },
  listen: { cls: 'fix', can: f => f.inLobby && !!f.def.outburst && f.ignoredT > 0,
    run: f => { G.ach.listened++; if (G.ach.listened >= 5) unlock('listener'); f.ignoredT = 0; f.outburstT = G.rng.range(f.def.outburst.every[0], f.def.outburst.every[1]); say(f, pick(G.rng, f.def.lines.listened)); if (f.def.patience) f.patience = clamp(f.patience + 10, 0, f.def.patience.max); G.vibe = clamp(G.vibe + 6, 0, 100); return tpl(AT.listen.result, nameVars(f)); } },
  kick: { cls: 'danger', can: f => f.inLobby,
    run: f => {
      if (f.def.neverLeaves) { G.ach.kickJustin = true; unlock('kickjustin'); f.anger = clamp(f.anger + 25, 0, 100); say(f, f.def.lines.kicked, 'scream'); banner(tpl(AT.kick.failBanner, nameVars(f)), 'bad', 1.8); G.shake = 0.5; return f.def.lines.kickedResult; }
      // Kicking someone who is dragging the lobby down is a relief. Kicking someone who wasn't is a bad look.
      const trouble = f.def.stranger || f.afk || f.broken || f.mood === 'annoyed' || (f.issue && f.issue.def.type !== 'deadline');
      leaveLobby(f, 'kicked');
      if (trouble) {
        for (const m of lobbyMembers()) { if (m.def.patience) m.patience = clamp(m.patience + 8, 0, m.def.patience.max); if (m.def.anger) m.anger = clamp(m.anger - 8, 0, m.def.anger.max); }
        G.vibe = clamp(G.vibe + 4, 0, 100);
      } else G.vibe = clamp(G.vibe - 4, 0, 100);
      if (f.def.stranger) { if (f.def.achievementOnKick) unlock(f.def.achievementOnKick); return tpl(f.def.lines.kickedResult, nameVars(f)); }
      return tpl(trouble ? AT.kick.relief : AT.kick.result, nameVars(f)); } },
};
const ACTION_ORDER = ['invite', 'ping', 'text', 'call', 'calm', 'listen', 'kick'];

let menuButtons = [], menuSig = '';
function menuSignature(f) { return [f.inLobby, !!f.def.anger, !!f.def.outburst, f.issue ? f.issue.def.id : '', f.issue ? Object.keys(f.issue.used).length : 0, !!f.late, f.late ? Object.keys(f.late.used).length : 0, sneakSuspicious(f), f.gone, f.online, f.disconnected].join('|'); }
function openMenu(f) {
  if (G.state !== 'playing') return;
  menuTarget = f;
  ui.menuResult.textContent = '';
  buildMenu(); updateMenu();
  ui.menu.classList.remove('hidden');
  positionMenu();
}
// The menu opens beside the friend, so the lobby stays visible.
function positionMenu() {
  const f = menuTarget; if (!f) return;
  const sh = ui.menuSheet, st = ui.stage.getBoundingClientRect(), pad = 6, vw = window.innerWidth;
  const s = G.lobby.indexOf(f.id);
  let left, width;
  if (s >= 0) {
    const r = slotEls[s].el.getBoundingClientRect();
    const roomR = st.right - r.right - pad * 2, roomL = r.left - st.left - pad * 2;
    if (roomR >= roomL) { width = Math.min(380, Math.max(230, roomR)); left = r.right + pad; }
    else { width = Math.min(380, Math.max(230, roomL)); left = r.left - pad - width; }
  } else { width = Math.min(380, st.width - pad * 2); left = st.left + pad; }
  left = clamp(left, pad, vw - width - pad);
  sh.style.left = left + 'px'; sh.style.width = width + 'px';
  sh.style.top = (st.top + pad) + 'px'; sh.style.maxHeight = (st.height - pad * 2) + 'px';
}
const CD_MAX = { ping: 4, text: 20, call: 30, calm: 8 };
function setCdFill(mb, frac) { const v = clamp(frac, 0, 1).toFixed(2); if (mb.lastCd !== v) { mb.lastCd = v; mb.el.style.setProperty('--cd', v); } }
// Built once per open and updated in place: rebuilding buttons every frame
// swallowed taps on touch screens.
function buildMenu() {
  const f = menuTarget; if (!f) return;
  menuSig = menuSignature(f);
  ui.menuTitle.textContent = f.name; ui.menuPortrait.src = portraitOf(f);
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
  if (sneakSuspicious(f)) for (const bt of f.sneakDef.buttons) addBtn(bt.label, f.sneakDef.hint, 'fix', () => f.sneaking, () => { catchSneak(f); return bt.result; });
  if (f.gone) addBtn(f.goneStatus, 'gone for the night', '', () => false, () => '');
  for (const a of f.def.actions || []) {
    const where = a.where || 'lobby';
    if (where === 'lobby' && !f.inLobby) continue;
    if (where === 'offline' && f.inLobby) continue;
    if (f.gone && where !== 'any') continue;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'sig';
    b.innerHTML = `${esc(a.label)}<small></small>`;
    b.addEventListener('click', e => { e.preventDefault(); if (!canRunSig(f, a)) return; ui.menuResult.textContent = runSig(f, a); updateMenu(); });
    ui.menuActions.appendChild(b);
    menuButtons.push({ key: null, sig: a, el: b, small: b.querySelector('small'), lastSmall: '', lastDisabled: null });
  }
  for (const key of ACTION_ORDER) {
    const a = ACTIONS[key];
    if (key === 'calm' && !f.def.anger) continue;
    if (key === 'listen' && !f.def.outburst) continue;
    if (key === 'invite' && f.inLobby) continue;
    if (key !== 'invite' && !f.inLobby) continue;
    const b = document.createElement('button'); b.type = 'button'; b.className = a.cls || '';
    b.innerHTML = `${esc(tpl(AT[key].label, nameVars(f)))}<small></small>`;
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
  for (const c of CHEMISTRY) if (c.pair.includes(f.id)) { const o = FRIENDS[c.pair.find(x => x !== f.id)]; bits.push((c.kind === 'clash' ? '⚡ ' : '💚 ') + o.name); }
  const sub = bits.join(' · ');
  if (ui.menuSub.textContent !== sub) ui.menuSub.textContent = sub;
  for (const mb of menuButtons) {
    if (mb.sig) { setCdFill(mb, mb.sig.cooldown ? (f.cd['sig_' + mb.sig.id] || 0) / mb.sig.cooldown : 0); const h = sigHint(f, mb.sig); if (h !== mb.lastSmall) { mb.lastSmall = h; mb.small.textContent = h; } const d = !canRunSig(f, mb.sig); if (d !== mb.lastDisabled) { mb.lastDisabled = d; mb.el.disabled = d; } continue; }
    if (!mb.key) { if (mb.hint !== mb.lastSmall) { mb.lastSmall = mb.hint; mb.small.textContent = mb.hint; } const d = !mb.canFn(); if (d !== mb.lastDisabled) { mb.lastDisabled = d; mb.el.disabled = d; } continue; }
    const a = ACTIONS[mb.key];
    const cd = f.cd[mb.key] || 0;
    setCdFill(mb, cd > 0 ? cd / (CD_MAX[mb.key] || cd) : 0);
    const small = cd > 0 ? 'cooldown ' + Math.ceil(cd) + 's' : (mb.key === 'listen' ? Math.ceil(f.ignoredT) + 's to answer' : tpl(AT[mb.key].hint, nameVars(f)));
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
  G.ach.restarts++; if (G.ach.restarts >= 3) unlock('restart3');
  G.vibe = clamp(G.vibe - 5, 0, 100);
  say(null, 'Party restarted. Everyone is un-readied.'); Sfx.tone(400, 0.2, 'triangle', 0.15, 200);
});
ui.readyCheck.addEventListener('click', e => {
  e.preventDefault(); if (G.state !== 'playing' || G.rcCooldown > 0 || G.chatBug > 0) return;
  G.rcCooldown = 10; G.rcHighlight = 6;
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
  if (G.serverDown > 0 && f.online) return 'Servers down · ' + Math.ceil(s2gm(G.serverDown)) + 'm';
  if (f.disconnected) return 'Disconnected · back in ' + Math.ceil(s2gm(f.dcT)) + 'm';
  if (f.inLobby) {
    if (f.issue && f.issue.def.type === 'deadline') return (f.ready ? 'READY · ' : '') + f.issue.def.icon + ' leaves ' + fmtClock(f.deadlineAt);
    if (f.afk && f.issue && f.issue.def.type === 'download') return f.issue.def.icon + ' Updating ' + downloadPct(f.issue) + '%';
    if (f.afk) return 'AFK · ' + f.issue.def.icon + ' ' + f.issue.label + etaText(f);
    if (f.issue) return f.issue.def.icon + ' ' + f.issue.label;
    return f.ready ? 'In lobby · READY' : 'In lobby';
  }
  if (f.shaun && !f.shaun.appeared) return 'Offline · ' + f.shaun.daysAway + ' days';
  if (sneakSuspicious(f)) return 'Offline · last seen just now';
  if (!f.online && f.late) return f.late.def.icon + ' ' + f.late.def.label;
  if (f.invitePending > 0) return 'Joining…';
  if (f.reinviteT > 0) return (f.kicked ? 'Kicked' : 'Just left') + ' (' + Math.ceil(f.reinviteT) + 's)';
  return f.online ? 'Online' : 'Offline';
}
const downloadPct = I => clamp(Math.floor(100 * (1 - I.remaining / I.total)), 0, 99);
const portraitOf = f => Art.portrait(f.def.look, 48);

// ---------------------------------------------------------------------------
// Friends list: portraits with presence rings, online friends sorted to the top
// ---------------------------------------------------------------------------
const listRows = {};
let listOrder = '';
function presence(f) {
  if (f.inLobby) return 'lobby';
  if (f.gone) return 'offline';
  if (f.online || f.invitePending > 0) return 'online';
  if (sneakSuspicious(f) || f.disconnected) return 'away';
  return 'offline';
}
const PRES_RANK = { lobby: 0, online: 1, away: 2, offline: 3 };
function buildList() {
  ui.list.innerHTML = ''; listOrder = '';
  for (const id of ROSTER) {
    const f = G.friends[id];
    const li = document.createElement('li');
    li.innerHTML = `<span class="pt-ring"><img alt="" src="${portraitOf(f)}"></span><div class="finfo"><div class="fname">${esc(f.name)}</div><div class="fstatus"></div></div>`;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'invite';
    b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); if (ACTIONS.invite.can(f)) { ACTIONS.invite.run(f); updateList(); } });
    li.appendChild(b);
    li.addEventListener('click', e => { e.preventDefault(); openMenu(f); });
    ui.list.appendChild(li);
    listRows[id] = { li, ring: li.querySelector('.pt-ring'), status: li.querySelector('.fstatus'), btn: b, last: '' };
  }
}
function updateList() {
  const count = lobbyMembers().length + '/' + needed();
  if (ui.friendCount.textContent !== count) ui.friendCount.textContent = count;
  const rank = id => { const f = G.friends[id]; return PRES_RANK[presence(f)] * 10 + (f.gone ? 50 : 0) + ROSTER.indexOf(id) * 0.1; };
  const order = ROSTER.slice().sort((a, b) => rank(a) - rank(b)).join(',');
  if (order !== listOrder) { listOrder = order; for (const id of order.split(',')) ui.list.appendChild(listRows[id].li); }
  for (const id of ROSTER) {
    const f = G.friends[id], r = listRows[id]; if (!r) continue;
    const st = statusText(f), pres = presence(f);
    const ring = 'pt-ring ' + pres + (sneakSuspicious(f) ? ' blink' : '');
    const btn = f.inLobby ? 'IN' : f.invitePending > 0 ? '…' : 'INVITE';
    const dis = f.inLobby || f.invitePending > 0 || !ACTIONS.invite.can(f);
    const key = st + '|' + ring + '|' + btn + '|' + dis;
    if (r.last === key) continue;
    r.last = key;
    r.status.textContent = st; r.ring.className = ring; r.li.classList.toggle('in', f.inLobby);
    r.btn.textContent = btn; r.btn.disabled = dis; r.btn.className = 'invite' + (btn === '…' ? ' pending' : btn === 'IN' ? ' in' : '');
  }
}

// ---------------------------------------------------------------------------
// Slots: a player card under each platform and a speech bubble over each head
// ---------------------------------------------------------------------------
const slotEls = [];
function buildSlots() {
  ui.slots.innerHTML = ''; slotEls.length = 0;
  for (let i = 0; i < SLOTS; i++) {
    const d = document.createElement('div'); d.className = 'slot';
    d.innerHTML = `<div class="bubble hidden"></div><div class="card empty"><img class="pt" alt=""><div class="cn"><span class="name"></span><span class="ck">✓</span></div><div class="bar"><div></div></div><div class="state"></div></div>`;
    d.addEventListener('click', e => { e.preventDefault(); const id = G.lobby[i]; if (id) openMenu(G.friends[id]); });
    ui.slots.appendChild(d);
    slotEls.push({ el: d, bub: d.querySelector('.bubble'), card: d.querySelector('.card'), pt: d.querySelector('.pt'), name: d.querySelector('.name'), state: d.querySelector('.state'), bar: d.querySelector('.bar'), key: '', bubKey: '', ptId: '' });
  }
}
const menuOpen = () => !!menuTarget && !ui.menu.classList.contains('hidden');
function blockersShown() {
  const members = lobbyMembers(), readyN = members.filter(m => m.ready).length;
  return G.state === 'playing' && ((members.length >= needed() && readyN >= needed() - 2) || G.rcHighlight > 0);
}
function renderHud() {
  if (G.shake > 0.05) ui.stage.style.transform = `translate(${(Math.random() - 0.5) * G.shake * 10}px, ${(Math.random() - 0.5) * G.shake * 8}px)`;
  else if (ui.stage.style.transform) ui.stage.style.transform = '';
  const low = G.state === 'playing' && G.vibe < 25;
  if (ui.vibe.classList.contains('low') !== low) ui.vibe.classList.toggle('low', low);
  if (low) { G.heartbeatT -= 1 / 60; if (G.heartbeatT <= 0) { G.heartbeatT = G.vibe < 12 ? 0.6 : 1.1; Sfx.tone(55, 0.18, 'sine', 0.35, 40); Sfx.tone(55, 0.14, 'sine', 0.25, 38, 0.18); } }
  ui.clock.textContent = fmtClock(G.clock);
  ui.clock.classList.toggle('late', G.clock > 210);
  ui.vibeFill.style.width = Math.round(G.vibe) + '%';
  const face = G.state === 'match' ? '🤩' : G.vibe > 75 ? '😁' : G.vibe > 50 ? '🙂' : G.vibe > 30 ? '😐' : G.vibe > 15 ? '😬' : '💀';
  if (ui.vibeFace.textContent !== face) { ui.vibeFace.textContent = face; ui.vibeFace.classList.add('bump'); setTimeout(() => ui.vibeFace.classList.remove('bump'), 220); }
  const members = lobbyMembers(), readyN = members.filter(m => m.ready).length;
  ui.readyCount.textContent = G.chatBug > 0 ? EVENTS.chatbug.readyCheck : readyN + ' / ' + needed();
  ui.readyCheck.classList.toggle('all', members.length >= needed() && readyN === members.length);
  ui.readyCheck.disabled = G.rcCooldown > 0 || G.chatBug > 0;
  // the 3-2-1 while everyone holds ready
  const cd = G.state === 'playing' && G.winT > 0 ? Math.ceil(WIN_HOLD - G.winT) : 0;
  if (cd !== G.cdShown) {
    G.cdShown = cd;
    if (cd) { ui.countdown.textContent = cd; ui.countdown.classList.remove('hidden', 'tick'); void ui.countdown.offsetWidth; ui.countdown.classList.add('tick'); Sfx.tone(520 + (WIN_HOLD - cd) * 180, 0.14, 'square', 0.12); }
    else ui.countdown.classList.add('hidden');
  }
  const showBlockers = blockersShown();
  for (let i = 0; i < SLOTS; i++) {
    const S = slotEls[i], id = G.lobby[i], f = id ? G.friends[id] : null;
    const bubKey = f && f.bubbleT > 0 ? f.bubble + '|' + f.bubbleKind : '';
    if (S.bubKey !== bubKey) { S.bubKey = bubKey; if (!bubKey) S.bub.classList.add('hidden'); else { S.bub.textContent = f.bubble; S.bub.className = 'bubble ' + f.bubbleKind; } }
    if (!f) {
      const key = i < needed() ? 'empty' : 'na';
      if (S.key === key) continue;
      S.key = key; S.el.className = 'slot'; S.card.className = 'card empty';
      S.name.textContent = 'EMPTY'; S.state.textContent = 'invite someone'; S.ptId = '';
      continue;
    }
    const I = f.issue;
    const waiting = f.ready && f.waitT > 4;
    const blocker = showBlockers && !f.ready;
    const badge = chemBadge(f);
    const dl = f.afk && I && I.def.type === 'download' ? downloadPct(I) : -1;
    let txt = f.screaming > 0 ? 'SCREAMING' : dl >= 0 ? 'UPDATING ' + dl + '%' : f.afk && I ? 'AFK · ' + I.def.label.toUpperCase() + etaText(f).toUpperCase() : f.broken && I ? I.def.label.toUpperCase() : waiting ? 'READY · WAITING' : f.mood === 'annoyed' ? (f.ready ? 'READY · ANNOYED' : 'ANNOYED') : f.ready ? 'READY' : 'NOT READY';
    if (I && I.def.type === 'deadline') txt += ' · ' + I.def.icon + ' ' + fmtClock(f.deadlineAt);
    if (f.def.codeRed) txt = 'CODE RED · ' + txt;
    const look = f.screaming > 0 ? 'screaming' : f.afk || f.broken ? 'away' : waiting ? 'waiting' : f.mood === 'annoyed' ? 'annoyed' : f.ready ? 'ready' : 'notready';
    const cls = 'card ' + look + (f.def.codeRed ? ' codered' : '') + (blocker ? ' blocker' : '') + (menuTarget === f && menuOpen() ? ' focus' : '');
    const pct = f.def.anger ? f.anger / f.def.anger.max * 100 : f.patience / f.def.patience.max * 100;
    const key = `${f.id}|${cls}|${txt}|${badge}|${Math.round(pct / 3)}`;
    if (S.key === key) continue;
    S.key = key;
    S.el.className = 'slot' + (f.screaming > 0 ? ' screaming' : '');
    S.card.className = cls;
    if (S.ptId !== f.id) { S.ptId = f.id; S.pt.src = portraitOf(f); }
    S.name.textContent = f.name + badge;
    S.state.textContent = txt;
    S.bar.className = 'bar' + (f.def.anger ? ' anger' : pct < 30 ? ' low' : '');
    S.bar.firstElementChild.style.width = Math.round(pct) + '%';
  }
  updateList();
  if (menuOpen()) updateMenu();
  if (G.vote && G.vote.issue && G.state === 'playing') { ui.banner.textContent = tpl(G.vote.issue.def.banner, { s: Math.ceil(G.vote.voteT) }); if (ui.banner.className !== 'bad') ui.banner.className = 'bad'; ui.banner.classList.remove('hidden'); G.bannerT = 0.5; }
  if (G.bannerT > 0) { G.bannerT -= 1 / 60; if (G.bannerT <= 0) ui.banner.classList.add('hidden'); }
}

// ---------------------------------------------------------------------------
// Canvas: the stage (art.js draws, this decides what)
// ---------------------------------------------------------------------------
let dpr = 1, CW = 1, CH = 1, GEO = { baseY: 0, s: 1, horizon: 0 }, bgKey = '';
function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 3);
  const r = ui.stage.getBoundingClientRect();
  CW = Math.max(1, r.width); CH = Math.max(1, r.height);
  for (const cv of [ui.canvas, ui.bg]) { cv.width = Math.round(CW * dpr); cv.height = Math.round(CH * dpr); }
  const cardH = CH < 320 ? 46 : 50;
  const baseY = CH - cardH - 16;
  const s = clamp(Math.min(CW / SLOTS / 124, (baseY - 84) / 186), 0.45, 1.4);
  GEO = { baseY, s, horizon: Math.round(CH * 0.56) };
  ui.slots.style.setProperty('--bubble-y', Math.round(CH - (baseY - 178 * s) + 4) + 'px');
  bgKey = '';
  if (menuOpen()) positionMenu();
}
window.addEventListener('resize', () => setTimeout(resize, 50));
window.addEventListener('orientationchange', () => setTimeout(resize, 250));

function exitFx(slot, f, kind) { if (G.slotFx) G.slotFx[slot] = { id: f.id, kind, t0: G.t }; }
function drawScene() {
  if (G.state === 'title' || !G.lobby.length) return;
  const match = G.state === 'match' || (G.state === 'over' && G.result && G.result.kind === 'win');
  const key = CW + 'x' + CH + '|' + Math.floor(G.clock) + '|' + match;
  if (key !== bgKey) { bgKey = key; bgx.setTransform(dpr, 0, 0, dpr, 0, 0); bgx.clearRect(0, 0, CW, CH); Art.background(bgx, CW, CH, { clock: G.clock, horizon: GEO.horizon, match }); }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, CW, CH);
  updateConfetti();
  const shx = G.shake > 0 ? (Math.random() - 0.5) * G.shake * 8 : 0, shy = G.shake > 0 ? (Math.random() - 0.5) * G.shake * 8 : 0;
  G.shake = Math.max(0, G.shake - 1 / 60 * 1.5);
  const slotW = CW / SLOTS, s = GEO.s, baseY = GEO.baseY + shy;
  const showBlockers = blockersShown(), pulse = G.state === 'playing' && G.winT > 0;
  for (let i = 0; i < SLOTS; i++) {
    const id = G.lobby[i], f = id ? G.friends[id] : null, cx = slotW * (i + 0.5) + shx;
    const state = f ? (f.ready ? 'ready' : showBlockers ? 'blocker' : f.def.codeRed ? 'codered' : 'notready') : (i < needed() ? 'open' : 'off');
    Art.platform(ctx, cx, baseY, s, state, { t: G.t, pulse, focus: !!f && menuTarget === f && menuOpen() });
    if (f) { drawFriend(f, cx, baseY, s); continue; }
    const fx = G.slotFx && G.slotFx[i];
    if (fx && G.t - fx.t0 < 0.7 && G.friends[fx.id]) {
      const k = (G.t - fx.t0) / 0.7, fr = G.friends[fx.id];
      Art.avatar(ctx, fr.def.look, cx, baseY, s, fx.kind === 'kick' ? { t: G.t, phase: fr.phase, kick: k } : { t: G.t, phase: fr.phase, glitch: k });
    }
  }
  drawConfetti();
}
function updateConfetti() {
  const dt = 1 / 60;
  for (const p of G.confetti) { p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; p.vx += Math.sin(G.t * 3 + p.rot) * 20 * dt; }
  G.confetti = G.confetti.filter(p => p.y < CH + 30);
}
function drawConfetti() {
  for (const p of G.confetti) { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.color; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore(); }
}
function poseOf(f) {
  f.blink -= 1 / 60; if (f.blink <= -0.12) f.blink = 2 + Math.random() * 4;
  const I = f.issue, prop = I && I.def.prop;
  const p = {
    t: G.t, phase: f.phase, ready: f.ready, screaming: f.screaming > 0, talking: f.talkT > 0, afk: f.afk, match: G.state === 'match',
    annoyed: f.mood === 'annoyed' && !f.ready, waiting: f.ready && f.waitT > 4 && G.state === 'playing', closed: f.blink < 0,
    spiral: prop === 'spiralEyes', bottle: prop === 'bottle',
    megaphone: !!f.def.outburst && !hasBuff(f, 'muted') && (f.ignoredT > 0 || (f.bubbleT > 0 && f.bubbleKind === 'scream')),
    angerK: f.def.anger ? f.anger / f.def.anger.max : 0,
    download: I && I.def.type === 'download' && f.afk ? 1 - I.remaining / I.total : null,
    icon: I && I.def.type !== 'deadline' && I.def.type !== 'download' ? I.def.icon : null,
  };
  if (f.spawnAt !== undefined && G.t - f.spawnAt < 0.6) p.spawn = (G.t - f.spawnAt) / 0.6;
  return p;
}
function drawFriend(f, cx, baseY, s) { Art.avatar(ctx, f.def.look, cx, baseY, s, poseOf(f)); }

// Title lineup and result lineup
function fitCanvas(cv) {
  const r = cv.getBoundingClientRect(), w = Math.max(1, r.width), h = Math.max(1, r.height);
  const pw = Math.round(w * dpr), ph = Math.round(h * dpr);
  if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
  const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h);
  return { c, w, h };
}
const TITLE_POSES = { shaun: { ready: true }, matt: { ready: true }, justin: { angerK: 0.75 }, andre: { megaphone: true }, nickyb: { spiral: true }, parker: { ready: true, waiting: true }, nickyc: { annoyed: true } };
function drawTitleCrew(t) {
  const { c, w, h } = fitCanvas(ui.titleCrew);
  Art.lineup(c, w, h, ROSTER.map(id => ({ look: FRIENDS[id].look, name: FRIENDS[id].name, platform: TITLE_POSES[id] && TITLE_POSES[id].ready ? 'ready' : 'notready', pose: TITLE_POSES[id] })), { t, labels: true, labelSize: 8 });
}
function resultEntries(r) {
  const ids = ROSTER.concat(Object.keys(r.trail || {}).filter(id => !ROSTER.includes(id) && FRIENDS[id]));
  return ids.map(id => {
    const tr = (r.trail || {})[id] || [], played = tr.includes(SHARE.trail.match), never = tr.length === 1 && tr[0] === SHARE.trail.never;
    return { look: FRIENDS[id].look, name: FRIENDS[id].name, trail: tr, platform: played ? 'ready' : 'notready',
      pose: played ? { match: true, ready: true } : never ? { afk: true, alpha: 0.6 } : r.kind === 'win' ? { ready: false } : { annoyed: true } };
  });
}
function drawResultCrew(r, t) {
  const { c, w, h } = fitCanvas(ui.resultCrew);
  Art.lineup(c, w, h, resultEntries(r), { t, labels: true, labelSize: 8, trailSize: 11 });
}

// Match found: a full-screen splash that drops into the map
let splashT = null;
function showSplash() {
  ui.splash.innerHTML = `<div class="sp-title">${esc(LOBBY_ART.splash)}</div><div class="sp-map">${Art.mapSVG()}<div class="sp-plane">✈️</div></div><div class="sp-drop">${esc(LOBBY_ART.drop)}</div>`;
  ui.splash.classList.remove('hidden');
  clearTimeout(splashT); splashT = setTimeout(() => ui.splash.classList.add('hidden'), 3300);
}

// ---------------------------------------------------------------------------
// Title / boot / loop
// ---------------------------------------------------------------------------
function boot() {
  const n = Daily.todayNumber();
  G.day = n; G.shownDay = n;
  hideScreens();
  G.state = 'title';
  const plan = planEvening(n);
  ui.titleDay.textContent = 'Evening #' + n + (Daily.debug ? ' · debug' : '');
  ui.titleTwist.textContent = plan.golden ? GOLDEN.text : 'Tonight: ' + plan.twist.text;
  ui.titleTwist.classList.toggle('golden', plan.golden);
  ui.titleBest.textContent = bestText(n);
  ui.modeName.textContent = LOBBY_ART.mode; ui.modeSub.textContent = LOBBY_ART.modeSub;
  ui.mapHead.textContent = LOBBY_ART.mapLabel; ui.mapName.textContent = LOBBY_ART.mapName;
  if (!ui.mapImg.firstChild) ui.mapImg.innerHTML = Art.mapSVG();
  ui.title.classList.remove('hidden');
  rotateTitleTip();
  refreshCountdowns();
}
function refreshCountdowns() {
  if (Daily.debug) { ui.titleNext.textContent = 'Debug evening — results are not saved'; ui.resultNext.textContent = 'Debug evening — not saved'; return; }
  const t = 'Same evening for everyone today · next one in ' + Daily.countdownText();
  ui.titleNext.textContent = t;
  ui.resultNext.textContent = t;
}
setInterval(() => {
  if (G.state === 'playing' || G.state === 'match' || G.state === 'paused') return;
  if (!Daily.debug && Daily.dayNumber() !== G.shownDay) { boot(); return; }
  refreshCountdowns();
}, 1000);
let toastT2 = null;
function randomTip() { return TIPS[Math.floor(Math.random() * TIPS.length)]; }
function rotateTitleTip() { if (G.state === 'title') ui.titleTip.textContent = randomTip(); }
setInterval(rotateTitleTip, 6000);
function loadThen(fn) {
  hideScreens(); ui.loading.classList.remove('hidden');
  ui.loadTip.textContent = randomTip(); ui.loadFill.style.width = '0%';
  const t0 = performance.now(), dur = 1400;
  Sfx.tone(440, 0.08, 'triangle', 0.1); Sfx.tone(660, 0.08, 'triangle', 0.1, 0, 0.5); Sfx.tone(880, 0.1, 'triangle', 0.12, 0, 1.0);
  const step = () => { const k = Math.min(1, (performance.now() - t0) / dur); ui.loadFill.style.width = Math.round(k * 100) + '%'; if (k < 1) requestAnimationFrame(step); else { ui.loading.classList.add('hidden'); fn(); } };
  requestAnimationFrame(step);
}
window.addEventListener('pointerdown', e => { if (e.target.closest && e.target.closest('button')) Sfx.tone(1500, 0.03, 'square', 0.05); }, { passive: true });
ui.start.addEventListener('click', e => { e.preventDefault(); Sfx.init(); loadThen(() => startEvening()); });
ui.again.addEventListener('click', e => { e.preventDefault(); Sfx.init(); loadThen(() => startEvening()); });
ui.share.addEventListener('click', e => { e.preventDefault(); if (G.result) shareResult(G.result); });
ui.stats.addEventListener('click', e => { e.preventDefault(); showStats(); });
ui.statsClose.addEventListener('click', e => { e.preventDefault(); ui.statsScreen.classList.add('hidden'); });

// ---------------------------------------------------------------------------
// Pause / quit. Quitting counts as a loss: every run counts.
// ---------------------------------------------------------------------------
function pauseGame() {
  if (G.state !== 'playing') return;
  G.state = 'paused'; closeMenu(); Music.stop();
  ui.pauseScreen.classList.remove('hidden');
}
function resumeGame() {
  if (G.state !== 'paused') return;
  ui.pauseScreen.classList.add('hidden'); G.state = 'playing'; last = performance.now(); Music.start();
}
ui.pauseBtn.addEventListener('click', e => { e.preventDefault(); pauseGame(); });
ui.resume.addEventListener('click', e => { e.preventDefault(); resumeGame(); });
ui.quit.addEventListener('click', e => { e.preventDefault(); if (G.state !== 'paused') return; ui.pauseScreen.classList.add('hidden'); G.state = 'playing'; endEvening('quit'); });
document.addEventListener('visibilitychange', () => { if (document.hidden && !(window.LOBBY && window.LOBBY.noAutoPause)) pauseGame(); });   // noAutoPause: test hook only

// ---------------------------------------------------------------------------
// First-evening guide: one hint at a time from GUIDE in friends.js.
// ---------------------------------------------------------------------------
const Guide = {
  on: false, cur: null, t: 0, done: {},
  init() { this.on = !Store.data.guideDone && Store.stats.evenings === 0; this.cur = null; this.t = 0; this.done = {}; ui.guide.classList.add('hidden'); },
  check(when) {
    const ms = lobbyMembers();
    switch (when) {
      case 'invite': return ms.length < needed() && ROSTER.some(id => ACTIONS.invite.can(G.friends[id]));
      case 'listen': return ms.some(m => m.def.outburst && m.ignoredT > 0);
      case 'anger': return ms.some(m => m.def.anger && m.anger > 55 && !(m.screaming > 0));
      case 'patience': return ms.some(m => m.def.patience && m.patience < 45);
      case 'fix': return ms.some(m => m.issue && m.issue.def.buttons && m.issue.def.buttons.length);
      case 'ready': return ms.length >= needed() && ms.some(m => !m.ready);
    }
    return false;
  },
  update(dt) {
    if (!this.on) return;
    if (this.cur) {
      this.t += dt;
      if ((this.t > 4 && !this.check(this.cur.when)) || this.t > 9) { this.done[this.cur.id] = true; this.cur = null; ui.guide.classList.add('hidden'); }
      return;
    }
    const g = GUIDE.find(x => !this.done[x.id] && this.check(x.when));
    if (g) { this.cur = g; this.t = 0; ui.guide.textContent = g.text; ui.guide.classList.remove('hidden'); }
  },
};

// ---------------------------------------------------------------------------
// Background music: a quiet synth loop that gets faster and tenser as the
// Party Vibe drops, and turns bright during the match. While a friend whose
// anger has `screamMusic: 'metal'` is screaming, it switches to metal.
// ---------------------------------------------------------------------------
const Music = {
  on: false, timer: null, next: 0, step: 0, mode: 'calm', bus: null,
  start() {
    Sfx.init(); if (!Sfx.ctx) return;
    this.on = true; this.next = Sfx.ctx.currentTime + 0.15;
    if (!this.timer) this.timer = setInterval(() => this.pump(), 60);
  },
  stop() { this.on = false; },
  tension() { return G.state === 'match' ? 0 : clamp((55 - G.vibe) / 45, 0, 1); },
  stepLen() { return G.state === 'match' ? 0.17 : 0.3 - 0.09 * this.tension(); },
  metalNow() { return G.state === 'playing' && lobbyMembers().some(m => m.screaming > 0 && m.def.anger && m.def.anger.screamMusic === 'metal' && !hasBuff(m, 'screamHarmless')); },
  pump() {
    const c = Sfx.ctx;
    if (!this.on || !c || c.state !== 'running') { if (c) this.next = c.currentTime + 0.1; return; }
    const mode = this.metalNow() ? 'metal' : 'calm';
    if (mode !== this.mode) { this.mode = mode; this.step = 0; this.next = c.currentTime + 0.03; }   // switch on the spot, from the downbeat
    if (this.next < c.currentTime) this.next = c.currentTime + 0.05;
    while (this.next < c.currentTime + 0.25) {
      const d = this.next - c.currentTime;
      if (this.mode === 'metal') { this.metal(this.step++, d); this.next += 0.075; }
      else { this.note(this.step++, d); this.next += this.stepLen(); }
    }
  },
  // Distortion bus for the guitar: oscillators -> waveshaper -> lowpass -> master.
  guitarBus() {
    if (this.bus) return this.bus;
    const c = Sfx.ctx, sh = c.createWaveShaper(), n = 1024, curve = new Float32Array(n);
    for (let k = 0; k < n; k++) { const x = k * 2 / n - 1; curve[k] = Math.tanh(x * 30); }
    sh.curve = curve; sh.oversample = '2x';
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2800;
    const g = c.createGain(); g.gain.value = 0.07;
    sh.connect(lp); lp.connect(g); g.connect(Sfx.master);
    return (this.bus = sh);
  },
  chord(root, dur, d) {
    const c = Sfx.ctx, t0 = c.currentTime + d, bus = this.guitarBus();
    for (const mul of [1, 1.5, 2]) {
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sawtooth'; o.frequency.setValueAtTime(root * mul, t0); o.detune.setValueAtTime((Math.random() - 0.5) * 14, t0);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.35, t0 + 0.005); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      o.connect(g); g.connect(bus); o.start(t0); o.stop(t0 + dur + 0.02);
    }
  },
  // Sixteenth notes at 200 bpm: chugging E power chords, double kick, snare on 2 and 4.
  metal(i, d) {
    const E = 82.4, riff = [E, E, E, E, E, E, 98, E, E, E, 116.5, 110, E, E, 98, 92.5];
    const s = i % 16, root = riff[s], accent = root !== E || s === 0;
    this.chord(root, accent ? 0.14 : 0.06, d);
    Sfx.tone(70, 0.06, 'sine', 0.16, 38, d);                              // double kick
    if (s === 4 || s === 12) Sfx.noise(0.14, 0.16, 1800, 0.8, d);        // snare
    if (s === 0) Sfx.noise(0.5, 0.05, 6500, 0.6, d);                     // crash
  },
  note(i, d) {
    const match = G.state === 'match', ten = this.tension();
    const prog = match ? [[130.8, 164.8, 196], [98, 123.5, 146.8], [110, 130.8, 164.8], [87.3, 110, 130.8]]
      : [[110, 130.8, 164.8], [87.3, 110, 130.8], [130.8, 164.8, 196], [98, 123.5, 146.8]];
    const s = i % 8, ch = prog[Math.floor(i / 8) % 4];
    if (s === 0 || s === 3 || s === 6) Sfx.tone(ch[0] / 2, 0.22, 'triangle', 0.05, 0, d);
    if (s % 2 === 0) Sfx.tone(ch[(s / 2) % 3] * 2, 0.18, 'sine', match ? 0.03 : 0.018, 0, d);
    if (match || ten > 0.35) Sfx.noise(0.03, 0.01 + 0.02 * ten, 7000, 1.5, d);
    if (ten > 0.7 && s % 4 === 0) Sfx.tone(55, 0.25, 'sine', 0.08, 45, d);
  },
};

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  tick(dt);
  if (G.state !== 'title') { renderHud(); drawScene(); }
  if (!ui.title.classList.contains('hidden')) drawTitleCrew(now / 1000);
  if (!ui.result.classList.contains('hidden') && G.result) drawResultCrew(G.result, now / 1000);
  requestAnimationFrame(frame);
}
resize(); boot();
requestAnimationFrame(frame);

window.LOBBY = { G, startEvening, endEvening, Store, boot, shareTextFor, planEvening, unlock, triggerIssue, ACTIONS, runIssueButton, shareCanvas, resultEntries, positionMenu, runSig, canRunSig, sigHint, pauseGame, resumeGame, Guide, Music, bestText, step(ms) { tick(ms / 1000); renderHud(); drawScene(); } };
})();
