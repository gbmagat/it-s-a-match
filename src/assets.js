import { useRef } from 'react'
import manifest from './assets-manifest.json'

// Every image is fetched once, kept in memory as a blob: URL and decoded up
// front. Pages then draw straight from memory: no request to the server (which
// re-checks each image, Cache-Control: no-cache) and no decoding on a page
// change, the two things that showed as a white flash between pages.

const ready = new Map() // original url -> blob: url
const held = [] // decoded images, kept so they stay decoded

export function asset(url) {
  return ready.get(url) ?? url
}

// The URL to use for an image that is being mounted. It stays the same for the
// life of that element, so an image never swaps source while on screen.
export function useAsset(url) {
  const ref = useRef(null)
  if (!ref.current || ref.current.url !== url) ref.current = { url, src: asset(url) }
  return ref.current.src
}

async function load(url) {
  if (ready.has(url)) return
  try {
    const blob = await (await fetch(url)).blob()
    const local = URL.createObjectURL(blob)
    const img = new Image()
    img.src = local
    await img.decode()
    held.push(img)
    ready.set(url, local)
  } catch {
    // Leave it to the normal URL.
  }
}

// In the order participants meet them, a few at a time.
const ORDER = [
  'header-bar', 'logo', 'puzzle-tile', 'landing-button', 'signup-card', 'signup-button',
  'photo-hands', 'swipe-dots', 'swipe-dots-top', 'card-left', 'card-right', 'card-center', 'swipe-glow', 'found-heart',
  'photo-picnic', 'choose-a-art', 'choose-b-art', 'itsamatch-a-art', 'itsamatch-b-art', 'hub-a-art', 'hub-b-art',
  'hub-card-0', 'hub-card-1', 'hub-card-2', 'chat-avatar', 'icon-phone', 'icon-video', 'icon-camera', 'icon-send',
]

export function preloadAssets() {
  const all = { ...manifest.plates, ...Object.fromEntries(Object.entries(manifest.layers).map(([k, l]) => [k, l.src])),
    ...Object.fromEntries(Object.entries(manifest.photos).map(([k, p]) => [k, p.src])) }
  const names = Object.keys(all)
  names.sort((a, b) => (ORDER.indexOf(a) + 1 || 999) - (ORDER.indexOf(b) + 1 || 999))
  const queue = names.map((n) => all[n])
  const worker = async () => {
    while (queue.length) await load(queue.shift())
  }
  return Promise.all([worker(), worker(), worker(), worker()])
}
