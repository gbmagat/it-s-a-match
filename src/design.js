// Geometry measured from the Canva design PDF ("it's match.pdf"), in design
// pixels on the 1440 x 1024 canvas. Artwork comes from tools/build_assets.py;
// everything here positions the HTML on top of it. (Sizes of the fluid parts,
// header and chat box, are in styles.css.)

export const CANVAS = { w: 1440, h: 1024 }
export const HEADER_H = 102.4

export const COLORS = {
  wine: '#7c0a22',
  wineBubble: '#7b0b23',
  rose: '#af6777',
  cream: '#f6f1e7',
  text: '#3b3737',
}

export const LANDING = {
  getStarted: { x: 106.8, y: 749.5, w: 337.7, h: 82.4, r: 8 },
  privacy: { x: 997, y: 904, w: 133, h: 33, r: 4 },
}

// Inner edge of each sign-up box (the 3px cream outline is drawn in the plate).
export const SIGNUP = {
  firstName: { x: 436.2, y: 307.0, w: 571.1, h: 60.1 },
  birthDate: { x: 436.2, y: 438.2, w: 283.8, h: 60.1 },
  age: { x: 732.4, y: 438.2, w: 274.8, h: 60.1 },
  bio: { x: 436.2, y: 585.7, w: 571.1, h: 164.7 },
  submit: { x: 747.1, y: 785.0, w: 260.2, h: 63.5, r: 10 },
  errorY: 905,
}

export const CHOOSE = {
  A: { button: { x: 345.3, y: 695.2, w: 317.2, h: 85.6, r: 8 }, avatar: { x: 312.9, y: 254.4, w: 382, h: 382 } },
  B: { button: { x: 777.6, y: 695.2, w: 317.2, h: 85.6, r: 8 }, avatar: { x: 745.3, y: 254.4, w: 382, h: 382 } },
}

export const HUB_CARDS = [
  { x: 175.6, y: 461.9, w: 334.9, h: 370.3 },
  { x: 552.5, y: 461.9, w: 335.0, h: 370.3 },
  { x: 929.5, y: 461.9, w: 334.9, h: 370.3 },
]
export const HUB_CARD_RADIUS = 32.5 // measured from the PDF cards

// Development only: ?fast runs every timer at 10x speed (for testing the flow).
const SPEED = import.meta.env.DEV && new URLSearchParams(window.location.search).has('fast') ? 0.1 : 1

const RAW_TIMING = {
  swipe: 8000,       // "finding a match" card shuffle (slowed from 4.6 s at the team's request, 2026-10-25), then "you found a match"
  found: 2600,       // heart badge hold
  itsAMatch: 2800,   // "it's a match!" hold
  afterReply: 450,   // pause before the match starts typing
  betweenBubbles: 350,
  endOfChat: 2200,   // last bubble stays on screen, then back to the Text Style page
}
export const TIMING = Object.fromEntries(Object.entries(RAW_TIMING).map(([k, v]) => [k, v * SPEED]))

// How long the match "types" before a bubble appears.
export function typingDelay(text) {
  if ([...text].length <= 2) return 800 * SPEED
  return Math.min(2600, 800 + text.length * 28) * SPEED
}
