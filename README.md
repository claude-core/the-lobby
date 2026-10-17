# The Lobby

A comedy game about trying to get your friend group into a match. Seven
friends, five slots, one evening. Landscape, iPhone Safari, no build step.

Shares its foundation with [Last Cans](https://github.com/claude-core/last-cans):
`base.js` holds the seeded RNG, the daily rule, the store, share and audio helpers.
All friend content lives in `friends.js`. Everything drawn on canvas (friends,
props, the lobby stage, lineups, the share card) lives in `art.js`; `game.js`
runs the evening and decides what to draw.

Each weekday has a theme and a pool of scenarios in `friends.js` (`WEEK`,
`SCENARIOS`). A scenario is a list of number-only mutators; the daily seed
picks one from that weekday's pool.

Debug: `?day=N` plays any evening without saving. `?night=<scenario id>`
plays one scenario without saving.
