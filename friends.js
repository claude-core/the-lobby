'use strict';
// friends.js — ALL friend content lives here: names, looks, lines, timing,
// issues, fixes, chaos, chemistry, events, tips, achievements, voices, twists,
// result and action text, and every joke the game tells. game.js only reads it.
//
// Units: "minutes" are in-game minutes (the evening runs 9:00pm–1:00am, 240
// minutes ≈ 3 real minutes, so 20 in-game minutes ≈ 15 real seconds).
// "seconds" are real seconds. Online windows are minutes after 9:00pm.
//
// Issue types the engine understands:
//   afk        away in the lobby for `minutes`; not ready; patience paused
//   download   like afk, but shows a progress bar for a `sizeGB` download
//   disconnect drops out of the party and offline for `minutes`; must be re-invited
//   fixable    stuck not-ready until a button fixes it (after `seconds`), or until
//              `minutes` pass (then says lines.timeout)
//   deadline   announces a leave time `minutes` ahead; leaves for the evening then
//   late       (before coming online) pushes their arrival back `minutes`
//   slowready  readies `readyMul`× slower and sometimes wanders off. A Ping
//              shortens it by `pingMinutes` and says `pingLine` / `pingResult`.
//   soju       randomly readies / un-readies
//   vote       must be answered within `seconds`; `banner` shows the countdown ({s}).
//              On timeout, lines.timeout plays and then one of:
//              timeout.unreadyAll (everyone un-readies), timeout.sulk [min] (goes
//              AFK), timeout.disconnect [min] (restarts the game, must be re-invited)
//   sneak      (before coming online) looks Offline but is in another party; tap to
//              catch. `hint` is the button subtitle.
//   stranger   invites FRIENDS[`stranger`] into a free slot (lines.full if none)
// `atJoin: true` fires the issue the moment the friend joins the lobby.
// `prop` draws something on the friend while the issue lasts: 'spiralEyes' | 'bottle'.
// (Every AFK friend turns into a faded ghost with the issue's icon over his head.)
// `achievementOnEnd` unlocks when the issue finishes while the friend is in the lobby.
// Buttons: kind 'shorten' | 'lengthen' | 'restart' | 'resolve' | 'postpone' | 'fix' |
//   'catch' | 'answer'. `once: true` works one time. `achievement: id` unlocks it.
//   `anger: n` adds anger to the friend.
// `worse: { call: minutes, line, achievement }` makes a Call extend the issue.
//
// Lines every friend has: join ready idle leave ping text call wait unready annoyed,
// plus startled (an outburst made them un-ready) and shushed (a scream did).
//
// Signature actions (`actions`): each friend's own moves, shown above Ping/Text/Call.
//   label, hint, cooldown (real seconds), once (one use per evening),
//   oncePerIssue (one use per problem), where: 'lobby' (default) | 'offline' | 'any'
//   needs: { friend: id in the lobby, issue: id active, issueType: type active,
//            late: id, calm (not mid-outburst), notReady, notAway, timed (away on a timer) }
//   needText: the subtitle while `needs` aren't met
//   line: what the friend says. speaker: [who, line] for someone else.
//   result: shown in the menu. {name} is the friend, {real} his real ETA.
//   self: { patience, anger, angerMul, readyNow, hold (extra seconds he stays ready),
//           annoyed, comeOnline, endIssue, shortenPct, reveal, delayOutburst (seconds), checkSneak }
//   all: { patience, vibe } for everyone else in the lobby
//   others: { id: { patience, anger, line, outburst, buff } }
//   buff: { <kind>: value, seconds | minutes, onEnd: { outburst: power, line, achievement } }
//     kinds: drainMul, angerRiseMul, screamHarmless, muted, noOutburst, sober, yellProof,
//            promise { line } (he leaves if anyone yells), bet { vibe, lose, win, achievement }
//   later: { issue, in: [min, max] } schedules one of his issues
//   risk: { chance, in: [min, max], line, goneStatus } he may leave for the night later
//   coin: { chance, win: {...}, lose: {...} } each side takes line/self/all/result
//   backfire: { issues: [...], patience, line } costs patience if one of those issues hits
//   miss: result when checkSneak finds nothing

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
    goneStatus: 'Offline · see you next month',
    lines: {
      join: ['hey', 'oh hey guys', 'long time'],
      ready: ['ready', 'ok im in'],
      idle: ['how have you guys been', 'is this the new map', 'my settings reset lol'],
      leave: ['ok gotta go, see you guys', 'alright peace'],
      ping: ['yeah im here'], text: ['haha ok'], call: ['why are you calling me'],
      wait: ['are we going?'], unready: ['one sec'], annoyed: ['ok maybe next month'],
      startled: ['oh. wow. ok'], shushed: ['is it always like this'],
      gone: 'Shaun has left. See you next month.',
      appearBanner: 'SHAUN IS ONLINE FOR THE FIRST TIME IN {days} DAYS',
      appearNotice: 'Shaun is online for the first time in {days} days.',
      matchBanner: 'PLAYED WITH SHAUN 👑',
    },
    actions: [
      { id: 'hishaun', label: 'Get Matt to say Hi Shaun', hint: 'big patience boost', needs: { friend: 'matt' }, needText: 'needs Matt in the lobby', cooldown: 40,
        speaker: ['matt', 'Hi Shaun'], line: 'hi matt', self: { patience: 40 }, result: 'Shaun feels welcome. Matt has never been more useful.' },
      { id: 'nochange', label: '"Nothing\'s changed, I promise"', hint: 'slower drain · risky', once: true,
        line: 'oh nice. same as always then', buff: { drainMul: 0.55, seconds: 25 },
        backfire: { issues: ['update', 'settings'], patience: -30, line: 'you said NOTHING changed' },
        result: 'He believes you. For now.' },
    ],
    issues: [
      { id: 'settings', label: 'Settings reset', icon: '⚙️', type: 'afk', minutes: [4, 7], weight: 1,
        lines: { start: ['my settings reset lol. one sec'], end: ['ok fixed'] }, buttons: [] },
      { id: 'update', label: '47 GB update', icon: '⬇️', type: 'download', sizeGB: 47, atJoin: true, minutes: [9, 14], weight: 2,
        achievementOnEnd: 'update',
        lines: { start: ['oh it wants a 47 GB update', 'update required. 47 GB. one sec'], end: ['ok updated. wait. my settings reset lol'] },
        buttons: [
          { id: 'netflix', label: 'Tell him to pause Netflix', kind: 'shorten', minutes: 5, once: true, result: 'Download speed doubled. His roommate is furious.', line: 'oh that was it lol' },
          { id: 'router', label: 'Tell him to restart the router', kind: 'restart', once: true, result: 'The download restarted at 0%.', line: 'uh. it says 0% now' },
        ] },
    ],
  },

  // Matt is the easy one, on purpose. He only ever says four things:
  // "Tooney", "Tooney time", "Hi Shaun" and "Need more soju".
  matt: {
    name: 'Matt', chaos: 1,
    look: { skin: 'fair', hair: 'medium', hairColor: '#d1542a', shirt: '#3b7dd8', pants: '#34495e', freckles: true },
    online: { window: [0, 15] },
    readyTime: [3, 6], readyHold: [24, 38],
    patience: { max: 100, drain: 0.7 },
    joinDelay: [2, 4],
    lines: {
      join: ['Tooney', 'Tooney time'],
      ready: ['Tooney time', 'Tooney'],
      idle: ['Tooney', 'Tooney time'],
      leave: ['Tooney'],
      ping: ['Tooney'], text: ['Tooney'], call: ['Tooney time'],
      wait: ['Tooney', 'Tooney time'],
      unready: ['Need more soju'],
      annoyed: ['Tooney time'],
      startled: ['Tooney'], shushed: ['Tooney'],
      greetCodeRed: 'Hi Shaun',
      matchFound: 'Tooney time',
    },
    actions: [
      { id: 'tooney', label: '"Tooney?"', hint: 'everyone +patience', cooldown: 45, line: 'Tooney', all: { patience: 8, vibe: 4 },
        result: 'Everyone feels a little better. Nobody knows why.' },
      { id: 'soju', label: 'Hand him a soju', hint: 'ready now · soju later', cooldown: 60, needs: { notAway: true }, needText: 'he is away',
        line: 'Need more soju', self: { readyNow: true, hold: 20 }, later: { issue: 'soju', in: [10, 25] },
        result: 'Matt is ready. Matt will be very ready later.' },
    ],
    issues: [
      { id: 'tooney', label: 'Tooney run', icon: '🥤', type: 'afk', minutes: [3, 5], weight: 6,
        lines: { start: ['Tooney'], end: ['Tooney time'] }, buttons: [] },
      { id: 'soju', label: 'Too much Soju', icon: '🍶', type: 'soju', minutes: [40, 70], weight: 1, prop: 'bottle',
        lines: { start: ['Need more soju'], during: ['Need more soju', 'Tooney', 'Tooney time', 'Hi Shaun'], end: ['Tooney'] },
        buttons: [{ id: 'water', label: 'Drink some water, Matt', kind: 'resolve', achievement: 'water', result: 'He drank the water. Tooney restored.', line: 'Tooney' }],
        worse: { call: 15, line: 'Need more soju' } },
    ],
  },

  justin: {
    name: 'Justin', chaos: 3,
    look: { skin: 'medium', hair: 'short', hairColor: '#2a1c14', shirt: '#e74c3c', pants: '#1f2a44' },
    online: { window: [0, 0] },                             // already there. always there.
    readyTime: [2, 4], readyHold: [12, 19],
    patience: null,                                         // ANGER meter instead of patience
    anger: { max: 100, rise: 2.4, screamSeconds: 7, calm: 40, afkRise: 1.2, screamMusic: 'metal' },   // the music turns to metal while he screams
    joinDelay: [0, 1],
    neverLeaves: true,
    issuesPerEvening: [1, 2],
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
      startled: ['WHY IS HE YELLING', 'WHAT'], shushed: ['...'],
      afterScream: ['im fine.', 'im calm. IM CALM.'],
      kicked: 'SOMEBODY PLEASE PLAY GAMES WITH ME',
      kickedResult: 'Kick failed. He was back before the button finished animating.',
      calmed: ['...fine', 'ok. ok. im calm.', 'im not even mad'],
      afkRant: ['{name} HAS BEEN AFK FOR {min} MINUTES', 'IS {name} EVEN HERE', '{name}. {name}. {name}.'],
      caughtSneak: 'YOU PLAYED WITHOUT ME??',
    },
    actions: [
      { id: 'drop', label: 'Let him pick the drop', hint: 'anger halved · Andre hates it', cooldown: 40,
        line: 'FINALLY. WE DROP WHERE I SAY.', self: { angerMul: 0.5 }, others: { andre: { patience: -15, line: 'what. no. THE DAM.' } },
        result: 'Justin is calmer. Andre is not.' },
      { id: 'ptt', label: 'Put him on push-to-talk', hint: 'screams are harmless · anger rises faster', cooldown: 60,
        line: 'WHY IS MY MIC OFF', buff: { screamHarmless: true, angerRiseMul: 1.5, seconds: 30 },
        result: 'Nobody can hear him scream. He is screaming anyway.' },
    ],
    issues: [
      { id: 'vote', label: 'Wants a different game', icon: '🗳️', type: 'vote', seconds: 12, weight: 2,
        banner: 'MODE VOTE · answer Justin · {s}s', timeout: { unreadyAll: true }, vibe: 10, timeoutBanner: 'VOTE TIMED OUT · EVERYONE UN-READY',
        lines: { start: ['I want to play a different game. VOTE.', 'can we play literally anything else. VOTE NOW.'], timeout: ['NOBODY ANSWERED. EVERYONE UNREADY.'] },
        buttons: [
          { id: 'yes', label: 'Fine, one match of that', kind: 'answer', achievement: 'vote', result: 'He got his one match. Everyone stays ready.', line: 'YES. ONE MATCH. LETS GO.' },
          { id: 'no', label: 'No. SQUADS.', kind: 'answer', achievement: 'vote', anger: 15, result: 'Vote closed. He is sulking, but ready.', line: 'fine. SQUADS. whatever.' },
        ] },
      { id: 'mic', label: 'Mic broke', icon: '🎙️', type: 'fixable', minutes: [20, 30], weight: 1,
        lines: { start: ['[TEXT CHAT] MY MIC BROKE', '[TEXT CHAT] CAN ANYONE HEAR ME. TYPING IN CAPS SO YOU CAN HEAR ME.'], fixed: ['CAN YOU HEAR ME NOW. GOOD. READY.'], timeout: ['IT WORKS. NOBODY HELPED. READY.'] },
        buttons: [{ id: 'replug', label: 'Unplug it and plug it back in', kind: 'fix', seconds: 4, result: 'It worked. Everyone can hear him again. Was that the goal?', line: '[TEXT CHAT] UNPLUGGING' }] },
      { id: 'random', label: 'Invited a random', icon: '🎲', type: 'stranger', stranger: 'random', weight: 1,
        notice: '{host} invited a random to fill the slot.',
        lines: { start: ['I INVITED A RANDOM. HES GOOD.', 'filled the slot. you guys were taking too long'], full: ['lobby is full? FINE. NO RANDOM.'] },
        buttons: [] },
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
    issuesPerEvening: [1, 2],
    lines: {
      join: ['BOYYYSSSSS', 'boys. BOYS.'],
      ready: ['LETS GO BOYS', 'ready, listen to me when we drop'],
      idle: ['I lit him for 17', 'LISTEN TO ME', 'we land hot tonight', 'BOYYYSSSSS'],
      leave: ['im out boys', 'wife says hi. im out.'],
      ping: ['im here im here'], text: ['im chill. YOURE not chill.'], call: ['BOYS whats up'],
      wait: ['boys im ready. BOYS.', 'what are we doing', 'LISTEN TO ME. ready up.'],
      unready: ['im getting a drink, un-ready', 'un-readying until you listen'],
      annoyed: ['this is why we never play', 'im about to hop off boys'],
      startled: ['BOYS?', 'who is yelling. besides me.'], shushed: ['...BOYS'],
      outburst: ['LISTEN TO ME', 'I LIT HIM FOR 17 AND NOBODY PUSHED', 'BOYS. BOYS. BOYS.'],
      ignored: ["YOU'RE NOT LISTENING", 'NOBODY LISTENS TO ME'],
      listened: ['thank you. finally.', 'ok. ok. we land hot.'],
    },
    // Every one of these is about whether anyone is listening to him.
    actions: [
      { id: 'mute', label: 'Mute Andre', hint: 'outbursts do nothing · he will notice', cooldown: 60,
        buff: { muted: true, seconds: 25, onEnd: { outburst: 2, line: 'WAS I MUTED??', achievement: 'muted' } },
        result: 'Blissful quiet. This will cost you later.' },
      { id: 'callouts', label: 'Let him make the callouts', hint: 'no outbursts · Justin gets angrier', cooldown: 60,
        line: 'FINALLY. LISTEN TO ME. THE DAM.', buff: { noOutburst: true, minutes: 30 },
        others: { justin: { line: 'since when does ANDRE call it', buff: { angerRiseMul: 1.5, minutes: 30 } } },
        result: 'Andre is in charge now. Justin is furious about it.' },
      { id: 'seventeen', label: 'Ask about the 17', hint: 'delays his next outburst', needs: { calm: true }, needText: 'too late, he is yelling', cooldown: 45,
        line: 'SEVENTEEN. he was one shot. ONE.', self: { delayOutburst: 20, patience: 8 },
        result: 'He told the whole story. His next outburst is a while off.' },
    ],
    issues: [
      { id: 'dogs', label: 'The dogs peed', icon: '🐕', type: 'afk', minutes: [12, 22], weight: 1,
        lines: { start: ['the dogs peed. brb', 'DOGS. hold on boys'], end: ['ok. pee handled. BOYS.'] },
        buttons: [], worse: { call: 5, line: 'IM CLEANING PEE RIGHT NOW' } },
      { id: 'movie', label: 'Movie night', icon: '🎬', type: 'deadline', minutes: [60, 110], weight: 1, goneStatus: 'Watching a movie',
        lines: { start: ['wife wants to watch a movie at {time}. one match boys.'], leave: ['movie time. im out boys.'] },
        buttons: [{ id: 'promise', label: 'Promise just one match', kind: 'postpone', minutes: 15, once: true, result: 'Pushed back 15 minutes. It will not be just one match.', line: 'ok ONE match. ONE.' }] },
      // Everything new with Andre is about nobody listening to him.
      { id: 'plan', label: 'Drop plan', icon: '🗺️', type: 'vote', seconds: 10, weight: 2,
        banner: 'ANDRE HAS A PLAN · tap Andre · {s}s', timeout: { sulk: [6, 10] }, vibe: 8, timeoutBanner: 'NOBODY LISTENED TO THE PLAN',
        lines: { start: ['LISTEN. WE LAND AT THE DAM. SAY IT BACK.', 'BOYS. THE PLAN. LISTEN TO THE PLAN.'], timeout: ['FINE. LAND WHEREVER. IM GETTING A SNACK.'], end: ['im back. it was the dam. it was always the dam.'] },
        buttons: [{ id: 'repeat', label: '"The dam. Got it."', kind: 'answer', achievement: 'dam', result: 'He repeated the plan twice more anyway. But he is ready.', line: 'THANK YOU. THE DAM.' }] },
      { id: 'story', label: 'The 17 story', icon: '💀', type: 'fixable', minutes: [14, 22], weight: 2,
        lines: { start: ['nobody asked how many I lit him for. not readying until someone asks.'], fixed: ['SEVENTEEN. thank you. ready.'], timeout: ['fine. it was 17. nobody cares. ready.'] },
        buttons: [{ id: 'ask', label: 'Ask how many he lit him for', kind: 'fix', seconds: 3, result: 'It was 17. It is always 17.', line: 'SEVENTEEN.' }] },
      { id: 'mutecheck', label: 'Thinks he is muted', icon: '🔇', type: 'vote', seconds: 8, weight: 1,
        banner: 'ANDRE THINKS HE IS MUTED · tap Andre · {s}s', timeout: { disconnect: [5, 9] }, vibe: 6, timeoutBanner: 'ANDRE RESTARTED HIS GAME',
        lines: { start: ['CAN YOU HEAR ME? HELLO? BOYS?', 'is my mic on? NOBODY IS ANSWERING. IS MY MIC ON?'], timeout: ['NOBODY ANSWERED. RESTARTING MY GAME.'] },
        buttons: [{ id: 'hear', label: '"We can hear you, Andre"', kind: 'answer', result: 'He can be heard. He has always been heard.', line: 'oh. good. LISTEN TO ME THEN.' }] },
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
      startled: ['huh'], shushed: ['jeez'],
    },
    actions: [
      { id: 'rain', label: '"Tee time got rained out"', hint: 'cancels his deadline · he might check', needs: { issue: 'tee' }, needText: 'only when he has tee time', once: true,
        line: 'oh nice. ok more games then', self: { endIssue: true },
        risk: { chance: 0.5, in: [20, 50], line: 'its literally sunny. im out.', goneStatus: 'Asleep (it was sunny)' },
        result: 'Tee time is cancelled. The forecast says otherwise.' },
      { id: 'taxes', label: 'Offer to do his taxes', hint: 'he comes online now · annoyed', where: 'offline', needs: { late: 'taxes' }, needText: 'only while he is doing taxes', once: true,
        line: 'ok fine. dont look at the crypto section', self: { comeOnline: true, annoyed: 1 },
        result: 'He is coming online. You have seen his finances.' },
      { id: 'talk', label: 'Talk him through it', hint: 'normal ready speed for a bit', needs: { issue: 'baked' }, needText: 'only when he is baked', cooldown: 60,
        line: 'ok. ok. press the button. which button', buff: { sober: true, seconds: 20 },
        result: 'You walked him to the ready button like a lost tourist.' },
    ],
    issues: [
      { id: 'taxes', label: 'Doing taxes', icon: '📄', type: 'late', minutes: [25, 50], weight: 2,
        lines: { start: ['doing taxes. on in a bit'], end: ['taxes done. im on.'] },
        buttons: [{ id: 'hype', label: 'Hype him up', kind: 'shorten', minutes: 12, once: true, result: 'He typed faster. Slightly.', line: 'ok ok im going as fast as i can' }] },
      { id: 'baked', label: 'Baked off weed gummies', icon: '🌀', type: 'slowready', minutes: [50, 90], readyMul: 3, weight: 2, prop: 'spiralEyes',
        pingMinutes: 4, pingLine: 'huh? oh. yeah.', pingResult: 'The ping got through the haze a little.',
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
      startled: ['bro what'], shushed: ['bro'],
    },
    actions: [
      { id: 'eta', label: 'Ask for an ETA', hint: 'see how long he will really be', where: 'any', needs: { timed: true }, needText: 'only when he is away', cooldown: 10,
        line: 'like 5 min', self: { reveal: true }, result: 'He says 5 minutes. It will be {real}.' },
      { id: 'bet', label: 'Bet him $5 he won\'t be ready in a minute', hint: 'ready now · costly if he flakes', cooldown: 60, needs: { notReady: true, notAway: true }, needText: 'he is ready, or away',
        line: 'bet. watch this', self: { readyNow: true, hold: 25 },
        buff: { bet: { vibe: 10, lose: 'ok i lost. i owe you 5. i dont have 5', win: 'pay up', achievement: 'bet' }, seconds: 30 },
        result: 'He readied out of pure spite.' },
      { id: 'pic', label: 'Send him a pic of the lobby', hint: 'guilt · shortens his AFK', needs: { issueType: 'afk' }, needText: 'only when he is AFK', oncePerIssue: true,
        line: 'ok ok im hurrying', self: { shortenPct: 0.4 }, result: 'Four people staring at an empty slot. He felt that.' },
    ],
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
        lines: { start: ['bro my controller died'], fixed: ['ok its charging. ready.'], timeout: ['found a cable. ready.'] },
        buttons: [{ id: 'plug', label: 'Plug it in', kind: 'fix', seconds: 5, result: 'He found the cable under the couch.', line: 'ok plugging it in one sec' }] },
      { id: 'wifi', label: 'Wi-Fi went out', icon: '📶', type: 'disconnect', minutes: [6, 12], weight: 2,
        lines: { start: ['wifis out brb'], end: ['wifis back'] }, buttons: [] },
      { id: 'bnc', label: 'BNC issues', icon: '⛓️', type: 'afk', minutes: [10, 35], weight: 2,
        lines: { start: ['bnc. brb.', 'ball and chain. hold on.'], end: ['ok im back'] },
        buttons: [], worse: { call: 30, achievement: 'bnccall', line: 'bro you called during the bnc talk. im in trouble.' } },
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
      startled: ['why is everyone yelling'], shushed: ['this. this is why.'],
      caught: ['...ok fine i was in another party', 'it was ONE game with my cousin'],
    },
    actions: [
      { id: 'profile', label: 'Check his profile', hint: 'catch him early', where: 'offline', cooldown: 15,
        self: { checkSneak: true }, result: 'Caught. He was in another party.', miss: 'He really is offline. Weird.' },
      { id: 'quiet', label: '"Everyone keep it down"', hint: 'shields him · Andre takes it personally', cooldown: 50,
        line: 'thank you', buff: { yellProof: true, seconds: 30 }, others: { andre: { line: 'NOBODY TELLS ME TO KEEP IT DOWN', outburst: true } },
        result: 'Nicky C is shielded. Andre is already yelling about it.' },
      { id: 'promise', label: 'Promise no yelling', hint: 'big patience · he leaves if anyone yells', cooldown: 60,
        line: 'ok. you promised.', self: { patience: 40 }, buff: { promise: { line: 'you PROMISED. im done.' }, seconds: 30 },
        result: 'You promised. Look around the lobby. Good luck.' },
    ],
    issues: [
      { id: 'sneak', label: 'In another party', icon: '🕵️', type: 'sneak', minutes: [20, 45], weight: 1, hint: 'something is off about that "Offline"',
        suspicionMinutes: 10,                                // his "Offline" only looks suspicious after this long
        lines: { start: [], end: ['hey just got on'] },
        buttons: [{ id: 'catch', label: 'Catch him', kind: 'catch', result: 'Caught. He joined with his camera off.', line: '...ok fine i was in another party' }] },
      { id: 'chores', label: 'Chores', icon: '🧹', type: 'afk', minutes: [12, 24], weight: 2,
        labels: ['vacuuming the ceiling', 'helping his sister move for the 10th time this year', 'walking his neighbor\'s goldfish'],
        lines: { start: ['brb, {label}'], end: ['ok done'] },
        buttons: [{ id: 'guilt', label: 'Guilt trip', kind: 'shorten', minutes: 6, once: true, result: 'He felt bad enough to hurry.', line: 'ok ok im almost done' }] },
    ],
  },

  // Not a friend. Justin invites him. Never in the friends list.
  random: {
    name: 'xX_Gamer_Xx', chaos: 4, stranger: true,
    look: { skin: 'brown', hair: 'short', hairColor: '#222', shirt: '#5c6370', pants: '#222', cap: '#c0392b' },
    online: { window: [9999, 9999] },
    readyTime: [5, 12], readyHold: [10, 16],
    patience: { max: 100, drain: 1.5 },
    joinDelay: [0, 0],
    achievementOnKick: 'random',
    lines: {
      join: ['*heavy breathing*', 'yo whats up'],
      ready: ['rdy', 'ready'],
      idle: [],
      leave: ['*left the party*'],
      ping: ['?'], text: ['who is this'], call: ['how did you get my number'],
      wait: ['we going or what'], unready: ['brb'], annoyed: ['you guys are weird'],
      startled: ['bro'], shushed: ['bro is he ok'],
      kickedResult: '{name} is gone. Nobody will remember him. The lobby is relieved.',
    },
    actions: [
      { id: 'mic', label: '"Do you have a mic?"', hint: 'coin flip', cooldown: 30,
        coin: { chance: 0.5,
          win: { line: 'yeah', self: { readyNow: true, hold: 15 }, result: 'He readied up. Who is this guy.' },
          lose: { line: '*heavy breathing*', all: { patience: -8 }, result: 'He has a mic. He is breathing into it.' } } },
    ],
    issues: [],
  },
};

// ---------------------------------------------------------------------------
// Chemistry: who gets along and who clashes, while both are in the lobby.
// kind 'like' shows 💚 and 'clash' shows ⚡ next to both names.
// Effects on each friend in `targets`: drainMul (patience drain), angerMul
// (anger rise). `vibe` is extra Party Vibe per second. `line` is
// [who, text], said once per evening when the pair first meets.
// ---------------------------------------------------------------------------
const CHEMISTRY = [
  { pair: ['matt', 'shaun'], kind: 'like', targets: ['shaun'], drainMul: 0.55, vibe: 0.15, line: ['matt', 'Hi Shaun'], notice: 'Matt is here. Shaun relaxes.' },
  { pair: ['matt', 'justin'], kind: 'like', targets: ['justin'], angerMul: 0.7, line: ['justin', 'ok. MATT is here. good.'], notice: 'Matt is here. Justin is slightly quieter.' },
  { pair: ['nickyb', 'parker'], kind: 'like', targets: ['nickyb', 'parker'], drainMul: 0.7, line: ['parker', 'NICKY B. seltzer?'], notice: 'Nicky B and Parker are sharing seltzers and gummies.' },
  { pair: ['andre', 'nickyc'], kind: 'clash', targets: ['nickyc'], drainMul: 1.6, line: ['nickyc', 'oh great. andre.'], notice: 'Andre and Nicky C are in the same lobby. Nicky C is tense.' },
  { pair: ['justin', 'nickyc'], kind: 'clash', targets: ['justin'], angerMul: 1.3, line: ['justin', 'oh NOW you play with us?'], notice: 'Justin knows Nicky C plays without him.' },
  { pair: ['shaun', 'parker'], kind: 'clash', targets: ['shaun'], drainMul: 1.35, line: ['shaun', 'is parker afk again'], notice: 'Parker is here. Shaun has seen this before.' },
];

// What the lobby itself shows: the mode card, the map on the big screen and
// the match-found splash.
const LOBBY_ART = {
  mode: 'SQUADS', modeSub: 'NEED 5 READY',
  mapLabel: 'NEXT MAP', mapName: 'THE DAM',
  splash: 'MATCH FOUND', drop: 'DROPPING INTO THE DAM',
};

// Lines the whole lobby cycles through once a match is found.
const MATCH_LINES = [
  ['andre', 'WE LAND HOT'], ['justin', 'LAND WITH ME'], ['matt', 'Tooney'], ['andre', 'I LIT HIM FOR 17'],
  ['justin', 'WHY DID YOU LAND THERE'], ['parker', 'my controller died'], ['andre', 'LISTEN TO ME'], ['matt', 'Tooney time'],
  ['nickyc', 'why is everyone yelling'], ['andre', "YOU'RE NOT LISTENING"], ['justin', 'I HAVE NO SHIELD'], ['nickyb', 'wait what are we playing'],
  ['shaun', 'is this the new map'], ['matt', 'Hi Shaun'], ['andre', 'PUSH PUSH PUSH'], ['justin', 'IM DOWN. IM DOWN.'],
  ['random', '*heavy breathing*'], ['andre', 'gg boys'], ['matt', 'Tooney'],
];

const RESULT_LINES = {
  win: ['MATCH FOUND. It only took the whole evening.', 'The lobby held. Somehow.'],
  vibe: 'Everyone hopped off. gn boys.',
  time: '1am. Everyone has work tomorrow.',
  quit: 'You bailed. The lobby will talk about this.',
  titles: { win: 'MATCH FOUND', vibe: 'GN BOYS', time: "IT'S 1AM", quit: 'BAILED' },
  banners: { vibe: 'Everyone hopped off.', time: "It's 1am.", quit: 'You left the party.' },
};

// Row labels on the result screen and the stats screen.
const RESULT_LABELS = {
  trouble: '🧨 Most trouble', shaun: '👑 Shaun', shaunMatch: 'PLAYED WITH SHAUN', shaunStayed: 'stayed {dur}, then left',
  shaunPopped: 'popped in and left', shaunNever: 'never showed',
  parker: '🚽 Parker AFK', andre: '📢 Andre: "LISTEN TO ME"', justin: '😤 Justin screamed', unreadies: '🔴 People un-readied',
  leaves: '🚪 Left the party', kicks: '🦶 Kicks', caught: '🕵️ Caught Nicky C', crashed: '💥 Crashed on ready',
  talk: '🎙️ Most talkative', golden: '✨ Golden Evening', twist: '📅 Tonight',
};
const STATS_LABELS = {
  evenings: 'Evenings played', matches: 'Matches started', rate: 'Win rate', longest: 'Longest lobby',
  shaunMatches: 'Matches with Shaun', shaunLongest: 'Longest time keeping Shaun', parkerAfk: 'Parker AFK, all-time',
  andreOutbursts: 'Andre outbursts, all-time', streak: 'Current win streak', bestStreak: 'Best win streak',
};

// Text for the action menu. {name} is the friend, {min} the kick length.
const ACTION_TEXT = {
  invite: { label: 'Invite', hint: 'to the party', result: '{name} invited. Now we wait.' },
  ping: { label: 'Ping', hint: 'free, weak', result: 'Pinged {name}. A grunt was heard.', away: '{name} is away. The ping echoed.' },
  text: { label: 'Text "chillllll"', hint: 'medium · 20s cooldown', result: '{name} read it. Left on read, but read.' },
  call: { label: 'Call', hint: 'strong · annoys everyone else', result: 'Called {name}. Everyone else heard it ring.', away: '{name} picked up, annoyed, and is still away.', worse: 'That made it worse. Everyone else heard it ring too.' },
  calm: { label: 'Calm down, {name}', hint: 'lowers anger', result: '{name} took a breath. One breath.' },
  listen: { label: "I'm listening, {name}", hint: 'ends the outburst', result: '{name} feels heard. For now.' },
  kick: {
    label: 'Kick', hint: 'out for {min} min', notice: '{name} was kicked from the party.',
    result: '{name} is out for {min} minutes. He did nothing wrong. Everyone noticed.',
    relief: '{name} is out for {min} minutes. The lobby exhales.',
    failBanner: '{name} instantly rejoined',
  },
};

// ---------------------------------------------------------------------------
// The week. Each weekday has a theme and a pool of scenarios; the daily seed
// picks one from that day's pool, so everyone plays the same night that day.
// Scenarios only bend numbers. They never add or remove rules.
//
// Scenario fields: id, title, chips (what the player is told), tip,
// lines ({ friend: [first join line tonight] }), visual ({ rain, lightning,
// haze: css color }), mutators.
//
// Mutators the engine understands:
//   { type: 'patience', mul, friend? }          patience drain (one friend, or everyone)
//   { type: 'anger', mul }                       Justin's anger rise
//   { type: 'outburst', mul }                    time between Andre's outbursts (0.7 = more often)
//   { type: 'readySpeed', mul, friend? }         time to ready up (1.5 = slower)
//   { type: 'hold', mul, friend? }               how long people stay ready (1.3 = longer)
//   { type: 'vibeDrain', mul }                   how fast the Party Vibe sinks
//   { type: 'online', friend, window }           when he comes online (minutes after 9pm); friend 'all' for everyone
//   { type: 'onlineShift', minutes, friend? }    comes online this much later (negative = earlier)
//   { type: 'shaun', seconds: [a, b] }           how long Shaun waits for an invite
//   { type: 'weight', friend, issue, mul }       how likely one of his issues is
//   { type: 'skip', friend, issue } or { type: 'skip', issueType }   can't happen tonight
//   { type: 'force', friend, issue, at: [a, b] } guaranteed tonight, around that time (minutes after 9pm)
//   { type: 'issueParam', friend, issue, set }   that issue's numbers tonight (minutes, seconds, readyMul)
//   { type: 'extraIssues', friend, n }           n more issues than usual
//   { type: 'sneak', chance, suspicionMinutes }  sneaking odds, and how long his "Offline" looks innocent
//   { type: 'event', event, chance }             odds of maintenance, crash, chatbug or doublexp
//   { type: 'chemistry', pair, kind, targets, drainMul, angerMul, vibe, line, notice }   tonight only; replaces the same pair
//   { type: 'onCatch', vibe, patience }          extra reward for catching a sneaker
//   { type: 'annoyed', friend, n }               starts the night already annoyed
// Any mutator can also take a condition:
//   until: 'caught:<id>' | 'clock:<minutes>'     stops once that happens
//   from: 'clock:<minutes>'                      starts at that time
//   while: 'together:<id>,<id>'                  only while both are in the lobby
// ---------------------------------------------------------------------------
const WEEK = [   // index = day of the week, 0 = Sunday
  { day: 'Sunday', theme: 'Chores and family', emoji: '🧺', pool: ['dogs', 'chores', 'scaries', 'movie'] },
  { day: 'Monday', theme: 'Work tomorrow', emoji: '💼', pool: ['worktomorrow', 'coffee', 'chill', 'taxes-done'] },
  { day: 'Tuesday', theme: 'Patch day', emoji: '🛠️', pool: ['patch', 'shaun-maybe', 'parker-ontime', 'random'] },
  { day: 'Wednesday', theme: 'Ranked night', emoji: '🏆', pool: ['ranked', 'plan', 'vote', 'tryhard'] },
  { day: 'Thursday', theme: 'Thirsty Thursday', emoji: '🍻', pool: ['soju', 'gummies', 'seltzers', 'happyhour'] },
  { day: 'Friday', theme: "Everyone's out", emoji: '🌃', pool: ['offline', 'wife-away', 'bnc', 'datenight'] },
  { day: 'Saturday', theme: 'Big night', emoji: '🎉', pool: ['bignight', 'power', 'reunion', 'tournament'] },
];

const SCENARIOS = [
  // ---- Sunday: chores and family
  { id: 'dogs', title: "Andre's dogs have been weird all day.",
    chips: ['🐕 The dogs will pee. Guaranteed.', '⏱️ Clean-up takes longer', '😤 Andre is on edge'],
    tip: 'Tip: Calling Andre while he cleans pee adds 5 minutes. It always adds 5 minutes.',
    lines: { andre: ['the dogs are acting WEIRD boys'] },
    mutators: [
      { type: 'force', friend: 'andre', issue: 'dogs', at: [35, 90] },
      { type: 'issueParam', friend: 'andre', issue: 'dogs', set: { minutes: [16, 26] } },
      { type: 'patience', friend: 'andre', mul: 1.15 },
    ] },
  { id: 'chores', title: 'Nicky C has chores. So many chores.',
    chips: ['🧹 Nicky C will vanish for chores', '⏱️ Chores take longer', '🕵️ Less sneaking. No time.'],
    tip: 'Tip: The guilt trip works on chores. It does not work on the goldfish.',
    lines: { nickyc: ['hey. i have like 4 chores left'] },
    mutators: [
      { type: 'force', friend: 'nickyc', issue: 'chores', at: [30, 80] },
      { type: 'issueParam', friend: 'nickyc', issue: 'chores', set: { minutes: [18, 30] } },
      { type: 'sneak', chance: 0.2 },
    ] },
  { id: 'scaries', title: 'Sunday scaries.',
    chips: ['😰 Everyone drains faster', '📉 The vibe sinks faster', '⛳ Nicky B probably has tee time'],
    tip: 'Tip: Nobody wants Monday. Everybody wants one more game.',
    lines: { nickyb: ['work tomorrow. ugh. one game.'] },
    mutators: [
      { type: 'patience', mul: 1.15 },
      { type: 'vibeDrain', mul: 1.15 },
      { type: 'weight', friend: 'nickyb', issue: 'tee', mul: 5 },
    ] },
  { id: 'movie', title: 'Andre promised his wife a movie.',
    chips: ['🎬 Andre has a movie deadline', '⏰ And it comes early', '📢 He yells more before he goes'],
    tip: 'Tip: "Promise just one match" buys 15 minutes. Spend them wisely.',
    lines: { andre: ['ONE match boys. movie night.'] },
    mutators: [
      { type: 'force', friend: 'andre', issue: 'movie', at: [20, 45] },
      { type: 'issueParam', friend: 'andre', issue: 'movie', set: { minutes: [50, 80] } },
      { type: 'outburst', mul: 0.8 },
    ] },

  // ---- Monday: work tomorrow
  { id: 'worktomorrow', title: 'Everyone has work tomorrow.',
    chips: ['💼 Patience drains faster', '⏳ Nobody stays ready long', '⛳ Early tee time and movie night are likely'],
    tip: 'Tip: On Mondays, "one game" means it.',
    lines: { parker: ['i have a 7am. one game.'] },
    mutators: [
      { type: 'patience', mul: 1.3 },
      { type: 'hold', mul: 0.85 },
      { type: 'weight', friend: 'nickyb', issue: 'tee', mul: 6 },
      { type: 'issueParam', friend: 'nickyb', issue: 'tee', set: { minutes: [40, 70] } },
      { type: 'weight', friend: 'andre', issue: 'movie', mul: 4 },
      { type: 'issueParam', friend: 'andre', issue: 'movie', set: { minutes: [35, 60] } },
    ] },
  { id: 'coffee', title: 'Justin had a coffee at 8pm.',
    chips: ["☕ Justin's anger rises 40% faster", '⚡ He readies instantly'],
    tip: 'Tip: Calm Justin early. Coffee does not wear off.',
    lines: { justin: ['I HAD A COFFEE. LETS GO.'] },
    mutators: [
      { type: 'anger', mul: 1.4 },
      { type: 'readySpeed', friend: 'justin', mul: 0.6 },
    ] },
  { id: 'chill', title: 'Chill night. Allegedly.',
    chips: ['😌 Everyone is more patient', '📢 Fewer outbursts', '🔇 Party chat will probably bug out'],
    tip: 'Tip: A chill night is just a loud night that has not started yet.',
    lines: { andre: ['im chill tonight boys. CHILL.'] },
    mutators: [
      { type: 'patience', mul: 0.85 },
      { type: 'outburst', mul: 1.3 },
      { type: 'event', event: 'chatbug', chance: 0.6 },
    ] },
  { id: 'taxes-done', title: 'Nicky B says his taxes are done. Says.',
    chips: ["📄 Nicky B probably won't do taxes", '⏱️ If he does, it takes forever'],
    tip: 'Tip: "Hype him up" knocks 12 minutes off taxes. Use it early.',
    lines: { nickyb: ['taxes are done. dont ask.'] },
    mutators: [
      { type: 'weight', friend: 'nickyb', issue: 'taxes', mul: 0.4 },
      { type: 'issueParam', friend: 'nickyb', issue: 'taxes', set: { minutes: [45, 70] } },
    ] },

  // ---- Tuesday: patch day
  { id: 'patch', title: 'Patch Tuesday. Everyone is updating.',
    chips: ["⬇️ Shaun's update is almost certain", '🛠️ Server maintenance is likely', '🔇 Chat might bug out'],
    tip: 'Tip: Never tell Shaun to restart the router. Especially on Patch Tuesday.',
    lines: { justin: ['WHY IS THERE ANOTHER UPDATE'] },
    mutators: [
      { type: 'weight', friend: 'shaun', issue: 'update', mul: 20 },
      { type: 'event', event: 'maintenance', chance: 0.7 },
      { type: 'event', event: 'chatbug', chance: 0.4 },
    ] },
  { id: 'shaun-maybe', title: 'Shaun said he might hop on.',
    chips: ['👑 Shaun shows up early', '⏳ He waits longer for an invite', '💚 Matt keeps him extra calm'],
    tip: 'Tip: Get Matt in the lobby before Shaun shows up.',
    lines: { shaun: ['i said i might. here i am.'] },
    mutators: [
      { type: 'online', friend: 'shaun', window: [15, 70] },
      { type: 'shaun', seconds: [70, 90] },
      { type: 'chemistry', pair: ['matt', 'shaun'], kind: 'like', targets: ['shaun'], drainMul: 0.4, vibe: 0.25, line: ['matt', 'Hi Shaun'], notice: 'Matt is here. Shaun is very relaxed.' },
    ] },
  { id: 'parker-ontime', title: "Parker swears he's on time tonight.",
    chips: ['⏰ Parker is on early', '🚽 He makes up for it with extra problems'],
    tip: 'Tip: Parker on time is still Parker.',
    lines: { parker: ['TOLD YOU. ON TIME.'] },
    mutators: [
      { type: 'online', friend: 'parker', window: [3, 12] },
      { type: 'extraIssues', friend: 'parker', n: 1 },
    ] },
  { id: 'random', title: 'Justin has been talking to randoms.',
    chips: ['🎲 Justin will probably invite a random', '😤 Justin is a little angrier'],
    tip: "Tip: Justin's random counts as a fifth. Until he breathes into the mic.",
    lines: { justin: ['i met a guy. hes good.'] },
    mutators: [
      { type: 'weight', friend: 'justin', issue: 'random', mul: 6 },
      { type: 'anger', mul: 1.1 },
    ] },

  // ---- Wednesday: ranked night
  { id: 'ranked', title: 'Ranked night. Everyone is tense.',
    chips: ['😤 Everyone drains faster', '🔥 Justin angers faster', '✅ Once ready, people stay ready longer'],
    tip: 'Tip: On ranked night, a ready lobby stays ready. Getting there is the hard part.',
    lines: { andre: ['RANKED. LISTEN TO ME.'] },
    mutators: [
      { type: 'patience', mul: 1.25 },
      { type: 'anger', mul: 1.2 },
      { type: 'hold', mul: 1.15 },
    ] },
  { id: 'plan', title: 'Andre watched a strategy video.',
    chips: ['🗺️ Andre will have a drop plan', '📢 More outbursts', '⚡ He readies fast'],
    tip: 'Tip: It is always the dam.',
    lines: { andre: ['I WATCHED A VIDEO. I HAVE A PLAN.'] },
    mutators: [
      { type: 'weight', friend: 'andre', issue: 'plan', mul: 5 },
      { type: 'outburst', mul: 0.75 },
      { type: 'readySpeed', friend: 'andre', mul: 0.7 },
    ] },
  { id: 'vote', title: 'Justin wants to play a different game.',
    chips: ['🗳️ Justin will call a vote', '⏱️ You get less time to answer', '😤 He is a little angrier'],
    tip: 'Tip: Answer the vote. Any answer. Just answer it.',
    lines: { justin: ['we are playing something else tonight. maybe.'] },
    mutators: [
      { type: 'force', friend: 'justin', issue: 'vote', at: [25, 60] },
      { type: 'issueParam', friend: 'justin', issue: 'vote', set: { seconds: 9 } },
      { type: 'anger', mul: 1.1 },
    ] },
  { id: 'tryhard', title: 'Andre and Justin are both in tryhard mode.',
    chips: ['⚡ Andre and Justin clash all night', '✅ Everyone stays ready longer'],
    tip: 'Tip: Two tryhards, one lobby. Keep them both busy.',
    lines: { justin: ['TRYHARD MODE. NO TALKING.'] },
    mutators: [
      { type: 'chemistry', pair: ['andre', 'justin'], kind: 'clash', targets: ['andre', 'justin'], drainMul: 1.3, angerMul: 1.25, line: ['andre', 'JUSTIN. LISTEN TO ME.'], notice: 'Andre and Justin are both tryharding. This will be loud.' },
      { type: 'hold', mul: 1.2 },
    ] },

  // ---- Thursday: thirsty Thursday
  { id: 'soju', title: 'Matt brought the Soju.',
    chips: ['🍶 Matt will get into the soju', '⏳ Matt stays ready less'],
    tip: 'Tip: Water. Get Matt water.',
    lines: { matt: ['Need more soju'] },
    mutators: [
      { type: 'force', friend: 'matt', issue: 'soju', at: [35, 80] },
      { type: 'hold', friend: 'matt', mul: 0.8 },
    ] },
  { id: 'gummies', title: 'Nicky B found the gummies.',
    chips: ['🌀 Nicky B is baked by 10:15', '🐢 He readies 4x slower', '💚 Parker is having a great time with him'],
    tip: 'Tip: The gummies kick in around 10:15.',
    lines: { nickyb: ['found these in my car lol'] },
    visual: { haze: 'rgba(170,90,255,0.16)' },
    mutators: [
      { type: 'force', friend: 'nickyb', issue: 'baked', at: [75, 75] },
      { type: 'issueParam', friend: 'nickyb', issue: 'baked', set: { readyMul: 4, minutes: [70, 110] } },
      { type: 'chemistry', pair: ['nickyb', 'parker'], kind: 'like', targets: ['nickyb', 'parker'], drainMul: 0.6, vibe: 0.2, line: ['parker', 'NICKY B. you good bro?'], notice: 'Nicky B and Parker are on the same wavelength tonight.' },
    ] },
  { id: 'seltzers', title: 'Parker is on a seltzer run. Again.',
    chips: ["🛒 Parker's seltzer run is guaranteed", '⏱️ It takes even longer', "⏰ But he's on early"],
    tip: 'Tip: Venmo him. Do not ask for one.',
    lines: { parker: ['quick seltzer run first'] },
    mutators: [
      { type: 'online', friend: 'parker', window: [5, 20] },
      { type: 'force', friend: 'parker', issue: 'seltzers', at: [20, 50] },
      { type: 'issueParam', friend: 'parker', issue: 'seltzers', set: { minutes: [25, 30] } },
    ] },
  { id: 'happyhour', title: 'Happy hour ran long.',
    chips: ['🍻 Everyone shows up 20 minutes late', "😌 But they're more patient", '🐢 And slower to ready'],
    tip: 'Tip: Happy hour people are patient people. Slow, but patient.',
    lines: { andre: ['BOYS. happy hour. BOYS.'] },
    visual: { haze: 'rgba(255,170,60,0.12)' },
    mutators: [
      { type: 'onlineShift', minutes: 20 },
      { type: 'patience', mul: 0.9 },
      { type: 'outburst', mul: 0.85 },
      { type: 'readySpeed', mul: 1.2 },
    ] },

  // ---- Friday: everyone's out
  { id: 'offline', title: 'Nicky C is "offline".',
    chips: ['🕵️ Nicky C is definitely sneaking', '😤 Justin is angrier until you catch him', '🎉 Catching him lifts the vibe'],
    tip: 'Tip: Nicky C is not offline. Check his profile.',
    lines: { andre: ['IS NICKY C IN ANOTHER PARTY'] },
    mutators: [
      { type: 'sneak', chance: 1, suspicionMinutes: 25 },
      { type: 'anger', mul: 1.3, until: 'caught:nickyc' },
      { type: 'onCatch', vibe: 15, patience: 10 },
    ] },
  { id: 'wife-away', title: "Andre's wife is out of town.",
    chips: ['🎬 No movie deadline for Andre', "😌 He's more patient", '📢 And louder'],
    tip: 'Tip: No wife, no movie, no limits. Say "I\'m listening" a lot.',
    lines: { andre: ['wife is gone. ALL NIGHT BOYS.'] },
    mutators: [
      { type: 'skip', friend: 'andre', issue: 'movie' },
      { type: 'patience', friend: 'andre', mul: 0.75 },
      { type: 'outburst', mul: 0.8 },
    ] },
  { id: 'bnc', title: "Parker's BNC is home.",
    chips: ['⛓️ Parker will probably have BNC issues', '⏱️ Long ones'],
    tip: "Tip: BNC issues can't be fixed. They can be made worse. Don't call.",
    lines: { parker: ['shes home. this could go either way.'] },
    mutators: [
      { type: 'weight', friend: 'parker', issue: 'bnc', mul: 6 },
      { type: 'issueParam', friend: 'parker', issue: 'bnc', set: { minutes: [20, 40] } },
    ] },
  { id: 'datenight', title: "It's date night for half the lobby.",
    chips: ['🌹 Andre and Parker show up late', '🎬 Movie night is likely', '⏳ Nobody stays ready long'],
    tip: 'Tip: Fill the lobby with whoever is home. The romantics come later.',
    lines: { parker: ['ok dinner is over. im here.'] },
    mutators: [
      { type: 'onlineShift', friend: 'andre', minutes: 30 },
      { type: 'onlineShift', friend: 'parker', minutes: 30 },
      { type: 'weight', friend: 'andre', issue: 'movie', mul: 4 },
      { type: 'hold', mul: 0.9 },
    ] },

  // ---- Saturday: big night
  { id: 'bignight', title: 'Saturday. Everyone is on.',
    chips: ['🎉 Everyone comes online early', '📢 Andre is louder', '⭐ Double XP is likely'],
    tip: 'Tip: Everyone is on. That is the problem.',
    lines: { andre: ['SATURDAY BOYS'] },
    mutators: [
      { type: 'onlineShift', minutes: -20 },
      { type: 'outburst', mul: 0.8 },
      { type: 'vibeDrain', mul: 0.9 },
      { type: 'event', event: 'doublexp', chance: 0.6 },
    ] },
  { id: 'power', title: "There's a storm by Parker's place.",
    chips: ["⛈️ Parker's power will probably go out", '📶 His Wi-Fi is shaky too'],
    tip: 'Tip: When the lights flicker at Parker\'s, invite someone else.',
    lines: { parker: ['lights are flickering lol'] },
    visual: { rain: true, lightning: true },
    mutators: [
      { type: 'weight', friend: 'parker', issue: 'power', mul: 6 },
      { type: 'weight', friend: 'parker', issue: 'wifi', mul: 3 },
    ] },
  { id: 'reunion', title: 'Shaun is back for the weekend.',
    chips: ['👑 Shaun shows up early', '⏳ He waits longer for an invite', "😌 He's more patient than usual"],
    tip: 'Tip: Shaun is back. Do not blow it. Again.',
    lines: { shaun: ['im back for the weekend'] },
    mutators: [
      { type: 'online', friend: 'shaun', window: [10, 60] },
      { type: 'shaun', seconds: [90, 120] },
      { type: 'patience', friend: 'shaun', mul: 0.75 },
    ] },
  { id: 'tournament', title: "There's a tournament with a cash prize.",
    chips: ['💰 Everyone readies faster', '✅ And stays ready longer', '😤 Justin angers faster'],
    tip: 'Tip: Money makes everyone ready. Money makes Justin loud.',
    lines: { justin: ['CASH PRIZE. READY UP.'] },
    mutators: [
      { type: 'patience', mul: 0.9 },
      { type: 'anger', mul: 1.25 },
      { type: 'hold', mul: 1.3 },
      { type: 'readySpeed', mul: 0.85 },
    ] },
];

const GOLDEN = {
  chance: 0.05,                           // about 1 in 20 evenings, on any day
  text: '✨ GOLDEN EVENING ✨ Everyone is on. Everyone is happy. Even Shaun.',
  notice: 'Golden Evening: everyone is on and in a good mood.',
  chips: ['✨ Everyone is online from 9pm', '😌 Everyone is extra patient', '👑 Shaun waits a long time'],
  mutators: [
    { type: 'online', friend: 'all', window: [0, 0] },
    { type: 'skip', issueType: 'sneak' }, { type: 'skip', issueType: 'late' },
    { type: 'patience', mul: 0.55 }, { type: 'anger', mul: 0.6 }, { type: 'outburst', mul: 1.7 },
    { type: 'shaun', seconds: [120, 150] },
    { type: 'event', event: 'chatbug', chance: 0 },
  ],
};

const EVENTS = {
  maintenance: { chance: 0.25, window: [50, 190], minutes: 10, banner: 'SERVER MAINTENANCE', notice: 'Servers down for maintenance. Everyone dropped to the friends list.', back: 'Servers are back. Re-invite everyone.' },
  crash: { chance: 0.08, minutes: 5, banner: 'GAME CRASHED ON READY', notice: 'The game crashed the moment everyone readied up. Classic.' },
  chatbug: { chance: 0.2, window: [40, 180], minutes: 14, banner: 'PARTY CHAT BUGGED', notice: 'Party chat is bugged. Nobody can hear anybody. Ready Check is down.', back: 'Party chat is back. Everyone talks at once.', muffled: '🔇 . . .', readyCheck: 'CHAT BUGGED' },
  doublexp: { chance: 0.2, window: [30, 170], minutes: 30, patienceMul: 0.6, banner: 'DOUBLE XP · 30 MINUTES', notice: 'Double XP for 30 minutes. Everyone is suddenly patient.', back: 'Double XP is over. So is the patience.' },
};

// Lines for the share card. `trail` is the emoji each friend collects
// through the night (issues add their own icon).
const SHARE = {
  title: '🛋️ THE LOBBY #{day}',
  win: '⏳ Lobby {lobby} · 🎮 Match {match}',
  loseVibe: '💀 Everyone hopped off. gn boys.',
  loseTime: '🕐 1am. Everyone has work tomorrow.',
  loseQuit: '🏃 Bailed on the lobby.',
  lobbyOnly: '⏳ Lobby {lobby}',
  shaunMatch: '👑 PLAYED WITH SHAUN',
  shaunLeft: '👋 Shaun popped in for {min} and left',
  shaunNever: '👻 Shaun never showed',
  caught: '🕵️ Caught Nicky C',
  tooney: '✅ TOONEY TIME',
  golden: '✨ Golden Evening',
  trail: { match: '✅', leave: '🚪', kicked: '🦶', gone: '🌙', shaunLeft: '👋', outburst: '📢', scream: '😤', caught: '🕵️', never: '💤', quiet: '🙂' },
};

// ---------------------------------------------------------------------------
// Voices: each friend's chat blip (pitch in Hz, oscillator type).
// ---------------------------------------------------------------------------
const VOICES = {
  shaun:  { pitch: 520, type: 'sine' },
  matt:   { pitch: 620, type: 'triangle' },
  justin: { pitch: 190, type: 'sawtooth' },
  andre:  { pitch: 300, type: 'square' },
  nickyb: { pitch: 380, type: 'triangle' },
  parker: { pitch: 460, type: 'square' },
  nickyc: { pitch: 560, type: 'sine' },
  random: { pitch: 240, type: 'sawtooth' },
};

// ---------------------------------------------------------------------------
// Loading-screen tips.
// ---------------------------------------------------------------------------
const TIPS = [
  'Tip: Parker will be on in 5. He will not.',
  'Tip: Nicky C is not offline.',
  'Tip: Justin will never leave.',
  "Tip: Saying 'I'm listening' is faster than arguing with Andre.",
  "Tip: Shaun only shows up once. Don't blow it.",
  "Tip: It's always Tooney time.",
  'Tip: Calling someone in the bathroom does not get them out of the bathroom.',
  'Tip: Kicking Justin has never worked. Try it anyway.',
  "Tip: Andre's wife is not watching the movie alone. He is watching the movie.",
  'Tip: Nicky B did not do his taxes. He is looking at his taxes.',
  'Tip: The gummies kick in around 10:15.',
  'Tip: When Shaun says "one sec", you have one sec.',
  'Tip: Matt readies up faster than anyone. Appreciate Matt.',
  'Tip: "Venmo him" is cheaper than "grab me one too".',
  "Tip: A ready check does not make people ready. It makes people aware.",
  'Tip: Restart Party fixes the game and breaks the mood.',
  'Tip: Texting "chillllll" has a 20-second cooldown. Justin does not.',
  'Tip: If the vibe is red, someone is about to say "gn boys".',
  "Tip: BNC issues cannot be fixed. BNC issues can be made worse. Don't call.",
  'Tip: Nobody has ever played just one match.',
  'Tip: The match is 6 minutes. The lobby is your life now.',
  'Tip: Matt calms everyone down. Nobody knows how. Tooney.',
  'Tip: Andre and Nicky C should not be in the same lobby.',
  'Tip: Kicking someone who is AFK cheers everyone else up.',
  "Tip: Justin's randoms count as a fifth. They also leave.",
  'Tip: Never tell Shaun to restart the router.',
  'Tip: It is always the dam.',
  'Tip: Muting Andre is a loan, not a gift.',
  'Tip: Never promise Nicky C anything while Justin is in the lobby.',
  'Tip: Parker says 5 minutes. Ask for an ETA anyway.',
];

// ---------------------------------------------------------------------------
// First-evening guide: one hint at a time, each shown once, only on a
// player's very first evening. `when` is a condition the engine checks.
// ---------------------------------------------------------------------------
const GUIDE = [
  { id: 'listen', when: 'listen', text: '👉 Andre is yelling. Tap him and say "I\'m listening" before he blows up.' },
  { id: 'anger', when: 'anger', text: "👉 Justin's red ANGER bar is filling. Tap him and calm him down." },
  { id: 'fix', when: 'fix', text: '👉 Someone has a problem. Tap them for the yellow fix buttons.' },
  { id: 'patience', when: 'patience', text: '👉 A green PATIENCE bar is low. Tap that friend and text them.' },
  { id: 'invite', when: 'invite', text: '👈 Tap INVITE next to anyone who is Online.' },
  { id: 'ready', when: 'ready', text: '👉 Get all 5 READY at once for 3 seconds. The yellow ring shows who is holding things up.' },
];

// ---------------------------------------------------------------------------
// Achievements. `when` is a condition the engine knows how to check at the
// end of an evening (or the moment it happens).
// ---------------------------------------------------------------------------
const ACHIEVEMENTS = [
  { id: 'crash', title: 'Got everyone ready. Server went down.', when: 'crash' },
  { id: 'lotr', title: 'Spent longer in lobby than a Lord of the Rings extended edition', when: 'lobby228' },
  { id: 'caught', title: 'Caught Nicky C', when: 'caught' },
  { id: 'justin', title: 'Survived Justin', when: 'screams3win' },
  { id: 'shaun10', title: 'Kept Shaun for 10 in-game minutes', when: 'shaun10' },
  { id: 'shaunmatch', title: 'Played a match with Shaun', when: 'shaunmatch' },
  { id: 'golden', title: 'Golden Evening', when: 'golden' },
  { id: 'parkerontime', title: 'Parker showed up on time', when: 'parkerontime' },
  { id: 'kickjustin', title: 'Tried to kick Justin. Bold.', when: 'kickjustin' },
  { id: 'bnccall', title: 'Called Parker during BNC issues', when: 'bnccall' },
  { id: 'listener', title: 'Said "I\'m listening" five times in one night', when: 'listened5' },
  { id: 'allseven', title: 'Had all seven in the lobby at some point', when: 'allseven' },
  { id: 'vote', title: 'Answered the vote in time', when: 'vote' },
  { id: 'early', title: 'Match before 9:30pm. Who are these people?', when: 'early' },
  { id: 'lastcall', title: 'Match after 12:45am', when: 'lastcall' },
  { id: 'water', title: 'Got Matt to drink water', when: 'water' },
  { id: 'restart3', title: 'Restarted the party three times', when: 'restart3' },
  { id: 'noactions', title: 'Won without pinging, texting or calling anyone', when: 'noactions' },
  { id: 'dam', title: '"The dam. Got it."', when: 'plan' },
  { id: 'random', title: 'Kicked the random Justin invited', when: 'kickrandom' },
  { id: 'update', title: 'Waited out a 47 GB update with Shaun', when: 'update' },
  { id: 'muted', title: 'Muted Andre. He noticed.', when: 'muted' },
  { id: 'bet', title: 'Lost $5 to Parker', when: 'bet' },
];
