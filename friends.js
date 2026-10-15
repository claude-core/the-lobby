'use strict';
// friends.js — ALL friend content lives here: names, looks, lines, timing,
// issues and fixes. Edit this file to add jokes; game.js only reads it.
//
// Timing units: "game minutes" are in-game minutes after 9:00pm (the evening
// runs 9:00pm–1:00am, 240 game minutes ≈ 3 real minutes). "seconds" are real.

// Who is in the game right now. Phase 1 ships with three; phase 2 enables all.
const ROSTER = ['matt', 'justin', 'andre'];

// Editable skin tones (hex). Use these names in a friend's look.skin.
const SKIN = {
  fair: '#f6dcc3',
  light: '#f1c9a5',
  tan: '#dba877',
  brown: '#b57a50',
};

const FRIENDS = {
  shaun: {
    name: 'Shaun', chaos: 2,
    look: { skin: 'light', hair: 'medium', hairColor: '#e8c860', shirt: '#9b59b6', pants: '#2c3e50' },
    online: { window: [30, 200], once: true },         // appears exactly once, seeded (phase 2)
    readyTime: [6, 12],
    patience: { max: 100, drain: 3.2 },                 // CODE RED: fastest drain in the lobby
    joinDelay: [2, 4],
    lines: {
      join: ['hey', 'oh hey guys', 'long time'],
      ready: ['ready', 'ok im in'],
      idle: ['how have you guys been', 'is this the new map', 'my settings reset lol'],
      leave: ['ok gotta go, see you guys', 'alright peace'],
      ping: ['yeah im here'],
      text: ['haha ok'],
      call: ['why are you calling me'],
    },
    issues: [],
  },

  matt: {
    name: 'Matt', chaos: 1,
    look: { skin: 'fair', hair: 'medium', hairColor: '#d1542a', shirt: '#3b7dd8', pants: '#34495e', freckles: true },
    online: { window: [0, 15] },
    readyTime: [3, 6],
    patience: { max: 100, drain: 0.5 },
    joinDelay: [2, 4],
    lines: {
      join: ['Tooney', 'tooney time boys'],
      ready: ['Tooney time', 'Tooney'],
      idle: ['Tooney', 'Hi Shaun', 'tooney?'],
      leave: ['tooney out'],
      ping: ['Tooney'],
      text: ['tooney 👍'],
      call: ['Tooney time?'],
      hiShaun: 'Hi Shaun',
      matchFound: 'TOONEY TIME',
    },
    issues: [],
  },

  justin: {
    name: 'Justin', chaos: 3,
    look: { skin: 'light', hair: 'short', hairColor: '#4a3426', shirt: '#e74c3c', pants: '#1f2a44' },
    online: { window: [0, 0] },                         // already there. always there.
    readyTime: [2, 4],
    patience: null,                                     // no patience bar: an ANGER meter instead
    anger: { max: 100, rise: 1.6, screamSeconds: 7, calm: 40 },
    joinDelay: [0, 1],
    neverLeaves: true,
    lines: {
      join: ['FINALLY', 'ok ok ok lets go'],
      ready: ['READY', 'im ready im ready'],
      idle: ['are we playing or not', 'ready up', 'somebody invite shaun', 'why is nobody ready'],
      leave: [],
      ping: ['IM RIGHT HERE'],
      text: ['dont tell me to chill'],
      call: ['WHAT'],
      scream: ['IF YOU WANT TO GET SCREAMING WITH ME, THEN GET SCREAMING', 'SOMEBODY PLEASE PLAY GAMES WITH ME', 'READY UP. READY. UP.'],
      kicked: 'SOMEBODY PLEASE PLAY GAMES WITH ME',
      calmed: ['...fine', 'ok. ok. im calm.', 'im not even mad'],
    },
    issues: [],
  },

  andre: {
    name: 'Andre', chaos: 3,
    look: { skin: 'tan', hair: 'short', hairColor: '#1b1b1b', shirt: '#27ae60', pants: '#2c3e50' },
    online: { window: [8, 35] },
    readyTime: [4, 9],
    patience: { max: 100, drain: 0.8 },
    joinDelay: [2, 5],
    lines: {
      join: ['BOYYYSSSSS', 'boys. BOYS.'],
      ready: ['LETS GO BOYS', 'ready, listen to me when we drop'],
      idle: ['I lit him for 17', 'LISTEN TO ME', 'we land hot tonight', 'BOYYYSSSSS'],
      leave: ['im out boys', 'wife says hi. im out.'],
      ping: ['im here im here'],
      text: ['im chill. YOURE not chill.'],
      call: ['BOYS whats up'],
      outburst: ['LISTEN TO ME', 'YOU\'RE NOT LISTENING', 'I LIT HIM FOR 17 AND NOBODY PUSHED'],
    },
    issues: [],
  },

  nickyb: {
    name: 'Nicky B', chaos: 3,
    look: { skin: 'light', hair: 'short', hairColor: '#1b1b1b', shirt: '#f39c12', pants: '#2c3e50' },
    online: { window: [40, 110] },
    readyTime: [5, 10],
    patience: { max: 100, drain: 0.7 },
    joinDelay: [3, 6],
    lines: {
      join: ['yo', 'sup'],
      ready: ['ready', 'ok go'],
      idle: ['wait what are we playing', 'one sec', 'who has the 12 pack'],
      leave: ['tee time tomorrow. night.'],
      ping: ['yeah'],
      text: ['lol chill'],
      call: ['hello?'],
    },
    issues: [],
  },

  parker: {
    name: 'Parker', chaos: 5,
    look: { skin: 'fair', hair: 'medium', hairColor: '#7a4b2a', shirt: '#8e44ad', pants: '#34495e' },
    online: { window: [25, 90] },
    readyTime: [8, 16],
    patience: { max: 100, drain: 0.9 },
    joinDelay: [4, 9],
    lines: {
      join: ['im here im here', 'sorry sorry'],
      ready: ['ok ready', 'ready ready ready'],
      idle: ['one sec', 'hold on', 'bro my controller died', 'wifis out brb', 'be right back'],
      leave: ['gotta go, bnc', 'brb'],
      ping: ['ya ya'],
      text: ['bro im literally ready'],
      call: ['dude im in the bathroom'],
    },
    issues: [],
  },

  nickyc: {
    name: 'Nicky C', chaos: 4,
    look: { skin: 'light', hair: 'short', hairColor: '#6b4423', shirt: '#1abc9c', pants: '#2c3e50' },
    online: { window: [15, 60] },
    readyTime: [4, 8],
    patience: { max: 100, drain: 1.4 },
    joinDelay: [2, 5],
    lines: {
      join: ['hey', 'ok im on'],
      ready: ['ready', 'fine, ready'],
      idle: ['why is everyone yelling', 'can we just play', 'im not offline'],
      leave: ['im done', 'this is why i play with other people'],
      ping: ['what'],
      text: ['im chill'],
      call: ['stop calling me'],
    },
    issues: [],
  },
};

// Lines the whole lobby cycles through once a match is found (phase 1 match screen).
const MATCH_LINES = [
  ['andre', 'WE LAND HOT'], ['justin', 'LAND WITH ME'], ['matt', 'tooney'], ['andre', 'I LIT HIM FOR 17'],
  ['justin', 'WHY DID YOU LAND THERE'], ['andre', 'LISTEN TO ME'], ['matt', 'tooney time'], ['andre', 'YOU\'RE NOT LISTENING'],
  ['justin', 'I HAVE NO SHIELD'], ['matt', 'Hi Shaun'], ['andre', 'PUSH PUSH PUSH'], ['justin', 'IM DOWN. IM DOWN.'],
  ['andre', 'gg boys'], ['matt', 'gg'],
];

// Result-screen flavor for phase 1.
const RESULT_LINES = {
  win: ['MATCH FOUND. It only took the whole evening.', 'The lobby held. Somehow.'],
  vibe: 'Everyone hopped off. gn boys.',
  time: '1am. Everyone has work tomorrow.',
};
