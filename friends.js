'use strict';
// friends.js — ALL friend content lives here: names, looks, lines, timing,
// issues, fixes and chaos ratings. Edit this file to add jokes; game.js only
// reads it.
//
// Units: "minutes" are in-game minutes (the evening runs 9:00pm–1:00am, 240
// minutes ≈ 3 real minutes, so 20 in-game minutes ≈ 15 real seconds).
// "seconds" are real seconds. Online windows are minutes after 9:00pm.
//
// Issue types the engine understands:
//   afk        away in the lobby for `minutes`; not ready; patience paused
//   disconnect drops out of the party and offline for `minutes`; must be re-invited
//   fixable    stuck not-ready until a button fixes it (after `fixSeconds`)
//   deadline   announces a leave time `minutes` ahead; leaves for the evening then
//   late       (before coming online) pushes their arrival back `minutes`
//   slowready  readies `readyMul`× slower and sometimes wanders off
//   soju       randomly readies / un-readies with slurred lines
//   vote       starts a mode vote; un-readies everyone unless answered in `seconds`
//   sneak      (before coming online) looks Offline but is in another party; tap to catch
// Buttons: kind 'shorten' | 'lengthen' | 'resolve' | 'postpone' | 'fix' | 'catch' | 'answer'
// `worse: { call: minutes }` makes a Call extend the issue. `once: true` buttons work one time.

const ROSTER = ['shaun', 'matt', 'justin', 'andre', 'nickyb', 'parker', 'nickyc'];

// Editable skin tones (hex). Use these names in a friend's look.skin.
const SKIN = {
  fair: '#f6dcc3',
  light: '#f1c9a5',
  tan: '#dba877',
  medium: '#b8845c',
  brown: '#8c5a3c',
};

const FRIENDS = {
  shaun: {
    name: 'Shaun', chaos: 2,
    look: { skin: 'light', hair: 'medium', hairColor: '#e8c860', shirt: '#9b59b6', pants: '#2c3e50' },
    online: { window: [30, 190], once: true },            // appears exactly once per evening
    daysAway: [25, 40],
    windowSeconds: [45, 60],                               // how long he stays online if not kept happy
    readyTime: [6, 12], readyHold: [14, 20],
    patience: { max: 100, drain: 3.2 },                    // CODE RED: fastest drain of anyone
    sensitive: { outburst: 2, scream: 2 },                 // every lobby issue hits him hardest
    joinDelay: [2, 4],
    codeRed: true,
    lines: {
      join: ['hey', 'oh hey guys', 'long time'],
      ready: ['ready', 'ok im in'],
      idle: ['how have you guys been', 'is this the new map', 'my settings reset lol'],
      leave: ['ok gotta go, see you guys', 'alright peace'],
      ping: ['yeah im here'], text: ['haha ok'], call: ['why are you calling me'],
      wait: ['are we going?'], unready: ['one sec'], annoyed: ['ok maybe next month'],
      appear: 'oh hey, it let me log in',
      gone: 'Shaun has left. See you next month.',
    },
    issues: [
      { id: 'settings', label: 'Settings reset', icon: '⚙️', type: 'afk', minutes: [4, 7], weight: 1,
        lines: { start: ['my settings reset lol. one sec'], end: ['ok fixed'] }, buttons: [] },
    ],
  },

  matt: {
    name: 'Matt', chaos: 1,
    look: { skin: 'fair', hair: 'medium', hairColor: '#d1542a', shirt: '#3b7dd8', pants: '#34495e', freckles: true },
    online: { window: [0, 15] },
    readyTime: [3, 6], readyHold: [24, 38],
    patience: { max: 100, drain: 0.7 },
    joinDelay: [2, 4],
    lines: {
      join: ['Tooney', 'tooney time boys'],
      ready: ['Tooney time', 'Tooney'],
      idle: ['Tooney', 'Hi Shaun', 'tooney?'],
      leave: ['tooney out'],
      ping: ['Tooney'], text: ['tooney 👍'], call: ['Tooney time?'],
      wait: ['tooney?', 'we playing or', 'tooney... time?'],
      unready: ['grabbing a drink, un-ready', 'brb tooney'],
      annoyed: ['ok this is taking a while', 'tooney time is passing'],
      hiShaun: 'Hi Shaun',
      matchFound: 'TOONEY TIME',
    },
    issues: [
      { id: 'tooney', label: 'Tooney run', icon: '🥤', type: 'afk', minutes: [3, 5], weight: 6,
        lines: { start: ['getting a tooney brb'], end: ['tooney acquired'] }, buttons: [] },
      { id: 'soju', label: 'Too much Soju', icon: '🍶', type: 'soju', minutes: [40, 70], weight: 1,
        lines: { start: ['tooooooney', 'boys i had the soju'], during: ['tooooney tiiime', 'im reddy. ready. redy.', 'hi shaun (shaun isnt here)'], end: ['ok. water. im good. tooney.'] },
        buttons: [{ id: 'water', label: 'Drink some water, Matt', kind: 'resolve', result: 'He drank the water. Tooney restored.', line: 'water. yes. tooney.' }],
        worse: { call: 15, line: 'WHY IS THE PHONE SO LOUD' } },
    ],
  },

  justin: {
    name: 'Justin', chaos: 3,
    look: { skin: 'medium', hair: 'short', hairColor: '#2a1c14', shirt: '#e74c3c', pants: '#1f2a44' },
    online: { window: [0, 0] },                             // already there. always there.
    readyTime: [2, 4], readyHold: [12, 19],
    patience: null,                                         // ANGER meter instead of patience
    anger: { max: 100, rise: 2.4, screamSeconds: 7, calm: 40, afkRise: 1.2 },
    joinDelay: [0, 1],
    neverLeaves: true,
    lines: {
      join: ['FINALLY', 'ok ok ok lets go'],
      ready: ['READY', 'im ready im ready'],
      idle: ['are we playing or not', 'ready up', 'somebody invite shaun', 'why is nobody ready'],
      leave: [],
      ping: ['IM RIGHT HERE'], text: ['dont tell me to chill'], call: ['WHAT'],
      scream: ['IF YOU WANT TO GET SCREAMING WITH ME, THEN GET SCREAMING', 'SOMEBODY PLEASE PLAY GAMES WITH ME', 'READY UP. READY. UP.'],
      wait: ['WHY ARE WE WAITING', 'READY UP. NOW.', 'WHO IS NOT READY'],
      unready: ['FINE. NOT READY THEN.', 'im unreadying until people ready'],
      annoyed: ['I HAVE BEEN READY FOR AN HOUR', 'SOMEBODY DO SOMETHING'],
      kicked: 'SOMEBODY PLEASE PLAY GAMES WITH ME',
      calmed: ['...fine', 'ok. ok. im calm.', 'im not even mad'],
      afkRant: ['{name} HAS BEEN AFK FOR {min} MINUTES', 'IS {name} EVEN HERE', '{name}. {name}. {name}.'],
      caughtNickyC: 'YOU PLAYED WITHOUT ME??',
      voteWin: 'ok. SQUADS. fine.',
      voteLose: 'NOBODY ANSWERED. EVERYONE UNREADY.',
    },
    issues: [
      { id: 'vote', label: 'Wants a different game', icon: '🗳️', type: 'vote', seconds: 12, weight: 1,
        lines: { start: ['I want to play a different game. VOTE.', 'can we play literally anything else. VOTE NOW.'] },
        buttons: [
          { id: 'yes', label: 'Fine, one match of that', kind: 'answer', result: 'He got his one match. Everyone stays ready.', line: 'YES. ONE MATCH. LETS GO.' },
          { id: 'no', label: 'No. SQUADS.', kind: 'answer', result: 'Vote closed. He is sulking, but ready.', line: 'fine. SQUADS. whatever.' },
        ] },
    ],
  },

  andre: {
    name: 'Andre', chaos: 3,
    look: { skin: 'tan', hair: 'short', hairColor: '#1b1b1b', shirt: '#27ae60', pants: '#2c3e50' },
    online: { window: [8, 35] },
    readyTime: [4, 9], readyHold: [14, 22],
    patience: { max: 100, drain: 1.2 },
    outburst: { every: [13, 24], ignoreSeconds: 6 },
    joinDelay: [2, 5],
    lines: {
      join: ['BOYYYSSSSS', 'boys. BOYS.'],
      ready: ['LETS GO BOYS', 'ready, listen to me when we drop'],
      idle: ['I lit him for 17', 'LISTEN TO ME', 'we land hot tonight', 'BOYYYSSSSS'],
      leave: ['im out boys', 'wife says hi. im out.'],
      ping: ['im here im here'], text: ['im chill. YOURE not chill.'], call: ['BOYS whats up'],
      wait: ['boys im ready. BOYS.', 'what are we doing', 'LISTEN TO ME. ready up.'],
      unready: ['im getting a drink, un-ready', 'un-readying until you listen'],
      annoyed: ['this is why we never play', 'im about to hop off boys'],
      outburst: ['LISTEN TO ME', 'I LIT HIM FOR 17 AND NOBODY PUSHED', 'BOYS. BOYS. BOYS.'],
      ignored: ["YOU'RE NOT LISTENING", 'NOBODY LISTENS TO ME'],
      listened: ['thank you. finally.', 'ok. ok. we land hot.'],
    },
    issues: [
      { id: 'dogs', label: 'The dogs peed', icon: '🐕', type: 'afk', minutes: [12, 22], weight: 1,
        lines: { start: ['the dogs peed. brb', 'DOGS. hold on boys'], end: ['ok. pee handled. BOYS.'] },
        buttons: [], worse: { call: 5, line: 'IM CLEANING PEE RIGHT NOW' } },
      { id: 'movie', label: 'Movie night', icon: '🎬', type: 'deadline', minutes: [60, 110], weight: 1, goneStatus: 'Watching a movie',
        lines: { start: ['wife wants to watch a movie at {time}. one match boys.'], leave: ['movie time. im out boys.'] },
        buttons: [{ id: 'promise', label: 'Promise just one match', kind: 'postpone', minutes: 15, once: true, result: 'Pushed back 15 minutes. It will not be just one match.', line: 'ok ONE match. ONE.' }] },
    ],
  },

  nickyb: {
    name: 'Nicky B', chaos: 3,
    look: { skin: 'light', hair: 'short', hairColor: '#1b1b1b', shirt: '#f39c12', pants: '#2c3e50' },
    online: { window: [40, 100] },
    readyTime: [5, 10], readyHold: [22, 34],
    patience: { max: 100, drain: 0.9 },
    joinDelay: [3, 6],
    lines: {
      join: ['yo', 'sup'],
      ready: ['ready', 'ok go'],
      idle: ['one sec', 'who has the 12 pack'],
      leave: ['tee time tomorrow. night.'],
      ping: ['yeah'], text: ['lol chill'], call: ['hello?'],
      wait: ['we playing?'], unready: ['hold on, un-ready'], annoyed: ['im about to go to bed'],
    },
    issues: [
      { id: 'taxes', label: 'Doing taxes', icon: '📄', type: 'late', minutes: [25, 50], weight: 2,
        lines: { start: ['doing taxes. on in a bit'], end: ['taxes done. im on.'] },
        buttons: [{ id: 'hype', label: 'Hype him up', kind: 'shorten', minutes: 12, once: true, result: 'He typed faster. Slightly.', line: 'ok ok im going as fast as i can' }] },
      { id: 'baked', label: 'Baked off weed gummies', icon: '🌀', type: 'slowready', minutes: [50, 90], readyMul: 3, weight: 2,
        lines: { start: ['those gummies were strong lol'], during: ['wait what are we playing', 'are we in a party rn', 'did someone say ready'], wander: ['wait i forgot i was in here'], end: ['ok im back. kind of.'] },
        buttons: [{ id: 'ping', label: 'Ping him again', kind: 'shorten', minutes: 8, result: 'Ping landed somewhere in there.', line: 'huh? oh. yeah.' }],
        worse: { call: 20, line: 'why is my phone... oh.' } },
      { id: 'tee', label: 'Tee time tomorrow', icon: '⛳', type: 'deadline', minutes: [90, 140], weight: 1, goneStatus: 'Asleep (tee time)',
        lines: { start: ['tee time at 7am. im off at {time}.'], leave: ['tee time. night boys.'] },
        buttons: [{ id: 'one', label: 'Just one game bro', kind: 'postpone', minutes: 15, once: true, result: 'One game. He has heard that before.', line: 'fine. one.' }] },
    ],
  },

  parker: {
    name: 'Parker', chaos: 5,
    look: { skin: 'fair', hair: 'medium', hairColor: '#7a4b2a', shirt: '#8e44ad', pants: '#34495e' },
    online: { window: [25, 80] },
    readyTime: [8, 16], readyHold: [12, 20],
    patience: { max: 100, drain: 1.1 },
    joinDelay: [4, 9],
    issuesPerEvening: [3, 4],
    lines: {
      join: ['im here im here', 'sorry sorry'],
      ready: ['ok ready', 'ready ready ready'],
      idle: ['one sec', 'hold on'],
      leave: ['gotta go', 'brb'],
      ping: ['ya ya'], text: ['bro im literally ready'], call: ['dude im in the bathroom'],
      wait: ['im ready im ready'], unready: ['one sec, un-ready'], annoyed: ['bro'],
    },
    issues: [
      { id: 'diarrhea', label: 'Diarrhea', icon: '🚽', type: 'afk', minutes: [10, 25], weight: 2,
        lines: { start: ['brb. dont ask.', 'bathroom. emergency.'], end: ['ok. im good. dont ask.'] }, buttons: [] },
      { id: 'seltzers', label: 'Seltzer run', icon: '🛒', type: 'afk', minutes: [20, 20], weight: 2,
        lines: { start: ['going to get seltzers brb 20 min'], end: ['got the seltzers'] },
        buttons: [
          { id: 'venmo', label: 'Venmo him', kind: 'shorten', minutes: 10, once: true, result: 'He skipped the self-checkout line.', line: 'ok sick, hurrying' },
          { id: 'one', label: 'Grab me one too', kind: 'lengthen', minutes: 10, once: true, result: 'Now he is at a second store.', line: 'ok they didnt have it, going somewhere else' },
        ] },
      { id: 'controller', label: 'Controller died', icon: '🔋', type: 'fixable', minutes: [60, 60], weight: 2,
        lines: { start: ['bro my controller died'], fixed: ['ok its charging. ready.'] },
        buttons: [{ id: 'plug', label: 'Plug it in', kind: 'fix', seconds: 5, result: 'He found the cable under the couch.', line: 'ok plugging it in one sec' }] },
      { id: 'wifi', label: 'Wi-Fi went out', icon: '📶', type: 'disconnect', minutes: [6, 12], weight: 2,
        lines: { start: ['wifis out brb'], end: ['wifis back'] }, buttons: [] },
      { id: 'bnc', label: 'BNC issues', icon: '⛓️', type: 'afk', minutes: [10, 35], weight: 2,
        lines: { start: ['bnc. brb.', 'ball and chain. hold on.'], end: ['ok im back'] },
        buttons: [], worse: { call: 30, line: 'bro you called during the bnc talk. im in trouble.' } },
      { id: 'power', label: 'Power went out', icon: '🔌', type: 'disconnect', minutes: [25, 40], weight: 1,
        lines: { start: ['power went out'], end: ['powers back'] }, buttons: [] },
    ],
  },

  nickyc: {
    name: 'Nicky C', chaos: 4,
    look: { skin: 'light', hair: 'short', hairColor: '#6b4423', shirt: '#1abc9c', pants: '#2c3e50' },
    online: { window: [15, 60] },
    readyTime: [4, 8], readyHold: [17, 26],
    patience: { max: 100, drain: 1.6 },
    sensitive: { outburst: 2.5, scream: 2.5 },             // Andre and Justin wear him out fast
    joinDelay: [2, 5],
    sneakChance: 0.75,
    lines: {
      join: ['hey', 'ok im on'],
      ready: ['ready', 'fine, ready'],
      idle: ['why is everyone yelling', 'can we just play', 'im not offline'],
      leave: ['im done', 'this is why i play with other people'],
      ping: ['what'], text: ['im chill'], call: ['stop calling me'],
      wait: ['can we just go'], unready: ['im not ready until people stop yelling'], annoyed: ['im about to leave'],
      caught: ['...ok fine i was in another party', 'it was ONE game with my cousin'],
    },
    issues: [
      { id: 'sneak', label: 'In another party', icon: '🕵️', type: 'sneak', minutes: [20, 45], weight: 1,
        lines: { start: [], end: ['hey just got on'] },
        buttons: [{ id: 'catch', label: 'Catch him', kind: 'catch', result: 'Caught. He joined with his camera off.', line: '...ok fine i was in another party' }] },
      { id: 'chores', label: 'Chores', icon: '🧹', type: 'afk', minutes: [12, 24], weight: 2,
        labels: ['vacuuming the ceiling', 'helping his sister move for the 10th time this year', 'walking his neighbor\'s goldfish'],
        lines: { start: ['brb, {label}'], end: ['ok done'] },
        buttons: [{ id: 'guilt', label: 'Guilt trip', kind: 'shorten', minutes: 6, once: true, result: 'He felt bad enough to hurry.', line: 'ok ok im almost done' }] },
    ],
  },
};

// Lines the whole lobby cycles through once a match is found.
const MATCH_LINES = [
  ['andre', 'WE LAND HOT'], ['justin', 'LAND WITH ME'], ['matt', 'tooney'], ['andre', 'I LIT HIM FOR 17'],
  ['justin', 'WHY DID YOU LAND THERE'], ['parker', 'my controller died'], ['andre', 'LISTEN TO ME'], ['matt', 'tooney time'],
  ['nickyc', 'why is everyone yelling'], ['andre', "YOU'RE NOT LISTENING"], ['justin', 'I HAVE NO SHIELD'], ['nickyb', 'wait what are we playing'],
  ['shaun', 'is this the new map'], ['matt', 'Hi Shaun'], ['andre', 'PUSH PUSH PUSH'], ['justin', 'IM DOWN. IM DOWN.'],
  ['andre', 'gg boys'], ['matt', 'gg'],
];

const RESULT_LINES = {
  win: ['MATCH FOUND. It only took the whole evening.', 'The lobby held. Somehow.'],
  vibe: 'Everyone hopped off. gn boys.',
  time: '1am. Everyone has work tomorrow.',
};
