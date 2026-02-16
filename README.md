# Six Shot Showdown

A turn-based 3D mini-game where the player competes against a CPU by launching a ball into scored hole rows. Higher score after three rounds wins.

## Game Overview

- Title: **Six Shot Showdown**
- Type: Turn-based 3D skill game
- Match length: 3 rounds (player throw + CPU throw each round)
- Objective: Finish with a higher total score than the CPU

## Rules

1. Each match has 3 rounds.
2. In every round:
- Player throws once.
- CPU throws once.
3. Scoring per throw:
- Ball lands in a hole row `1-6` -> score equals that row number.
- Miss -> score `0`.
4. End of match:
- Highest total score wins.
- Equal totals result in a draw.

## Hole Layout

- Row 1 contains 1 hole.
- Row 2 contains 2 holes.
- Row 3 contains 3 holes.
- Row 4 contains 4 holes.
- Row 5 contains 5 holes.
- Row 6 contains 6 holes.

The CPU is tuned to be competitive and often targets high-value zones.

## Controls

### Mobile (primary)

- Drag/flick upward to throw.
- Longer drag = more power.
- Slight left/right drag = horizontal aim.

### Desktop (fallback)

- `Space`: throw
- `Left/Right`: aim adjust
- `Up/Down`: power adjust
- `F`: fullscreen toggle

## Match Flow

- Splash screen appears briefly on load.
- Start match from the menu.
- Play 3 rounds.
- Result screen shows winner and persistent stats.

## Stats and Progression

Saved in `localStorage`:

- `winsTotal`
- `lossesTotal`
- `winStreak`
- `bestStreak`
- `totalPoints`

## Audio Triggers

- Throw sound: on impulse launch
- Rolling sound: while ball is moving
- Hole sound: successful score
- Miss sound: no score after settle
- Win/Lose/Draw sounds: after match result

## Tech Stack

- **Rendering:** [Three.js](https://threejs.org/)
- **Physics:** [cannon-es](https://github.com/pmndrs/cannon-es)
- **Input:** Pointer events (`pointerdown`, `pointermove`, `pointerup`)
- **Persistence:** Browser `localStorage`
- **Build/Run:** No bundler required (ES modules loaded in browser)

## Project Files

- `index.html` - UI structure and styles
- `main.js` - game logic, rendering, physics, state flow
- `66S-favicon.png` - favicon

## Run Locally

From project root:

```bash
python3 -m http.server 4173
```

Open:

- `http://127.0.0.1:4173`

## Credits

Mini game series by **Saw Aye Chan**.
