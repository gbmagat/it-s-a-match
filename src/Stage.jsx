import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import manifest from './assets-manifest.json'
import { useAsset } from './assets.js'
import { CANVAS, HEADER_H } from './design.js'

// Responsive layout. Sizes come from the 1440x1024 design, multiplied by a
// unit `u` that follows the window: u = min(width / 1440, height / 1024),
// kept between 0.55 and 1.35. The header, the chat box, the terms panel and
// the thank-you page stretch with the window; designed scenes (landing, card
// shuffle, matches, Text Style cards, sign-up card) scale and stay centred.
// Phones (< 720px wide), portrait tablets and very short windows get a
// one-column "compact" arrangement instead.

const GeometryContext = createContext(null)
const U_MIN = 0.55
const U_MAX = 1.35

function measure() {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const compact = vw < 720 || vh < 520 || (vw < 1000 && vh >= vw * 1.2)
  const u = compact ? U_MIN : Math.min(U_MAX, Math.max(U_MIN, Math.min(vw / CANVAS.w, vh / CANVAS.h)))
  return { vw, vh, u, compact }
}

export const useGeometry = () => useContext(GeometryContext)
export const useIsMobile = () => useContext(GeometryContext).compact

export function GeometryProvider({ children }) {
  const [g, setG] = useState(measure)
  useEffect(() => {
    const onResize = () => setG(measure())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  useLayoutEffect(() => {
    document.documentElement.style.setProperty('--u', String(g.u))
    document.documentElement.classList.toggle('is-compact', g.compact)
  }, [g])
  return <GeometryContext.Provider value={g}>{children}</GeometryContext.Provider>
}

// An image from memory (see assets.js), drawn together with the rest of the
// page rather than popping in a frame later.
export function Img({ src, className, style }) {
  return <img className={className} src={useAsset(src)} alt="" draggable={false} decoding="sync" style={style} />
}

// A piece of PDF artwork at its design position (inside a Block).
export function Layer({ name, className = '', style }) {
  const l = manifest.layers[name]
  return <Img className={`layer ${className}`} src={l.src} style={{ left: l.x, top: l.y, width: l.w, height: l.h, ...style }} />
}

// A layer's image on its own, sized by CSS.
export function LayerImg({ name, className }) {
  return <Img className={className} src={manifest.layers[name].src} />
}

// ---- Backgrounds (kept mounted while pages change on top) ----

function PuzzleBackground() {
  const tile = useAsset(manifest.plates['puzzle-tile'])
  return <div className="bg-layer bg-puzzle" aria-hidden="true" style={{ backgroundImage: `url(${tile})` }} />
}

// The photo as placed in the PDF (18% over cream), centred, and enlarged if
// needed so it always covers the window. Phones: simply cover.
function PhotoBackground({ name }) {
  const g = useGeometry()
  const p = manifest.photos[name]
  if (g.compact) {
    return (
      <div className="bg-layer bg-cream" aria-hidden="true">
        <Img className="bg-cover" src={p.src} style={{ opacity: p.opacity }} />
      </div>
    )
  }
  const k = Math.max(g.u, g.vw / p.w, g.vh / (p.y + p.h))
  return (
    <div className="bg-layer bg-cream" aria-hidden="true">
      <Img
        className="bg-photo"
        src={p.src}
        style={{ left: g.vw / 2 + (p.x - CANVAS.w / 2) * k, top: p.y * k, width: p.w * k, height: p.h * k, opacity: p.opacity }}
      />
    </div>
  )
}

// bg: 'puzzle' or a photo ('photo-hands', 'photo-picnic').
export function Backdrop({ bg }) {
  return bg.startsWith('photo-') ? <PhotoBackground name={bg} /> : <PuzzleBackground />
}

// ---- Page shell: header + content ----

// Door with an arrow leaving it: log out.
function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 4H6.5A2.5 2.5 0 0 0 4 6.5v11A2.5 2.5 0 0 0 6.5 20H10" />
      <path d="M15 8l4 4-4 4" />
      <path d="M19 12H9.5" />
    </svg>
  )
}

function SiteHeader({ nav }) {
  const stop = (fn) => (e) => {
    e.stopPropagation()
    fn?.()
  }
  const brand = (
    <>
      <Img className="brand-logo" src={manifest.layers.logo.src} />
      <span className="brand-text">it’s a match</span>
    </>
  )
  return (
    <header className="site-header">
      <Img className="site-header-bg" src={manifest.plates['header-bar']} />
      {nav ? (
        <button type="button" className="brand" onClick={stop(nav.onHome)} aria-label="home">{brand}</button>
      ) : (
        <span className="brand">{brand}</span>
      )}
      {nav && (
        <nav className="site-nav">
          <button type="button" onClick={stop(nav.onMyMatch)}>my match</button>
          <button type="button" onClick={stop(nav.onHome)}>home</button>
          {nav.onLogout && (
            <button type="button" className="nav-icon" onClick={stop(nav.onLogout)} aria-label="Log out" title="Log out">
              <LogoutIcon />
            </button>
          )}
        </nav>
      )}
    </header>
  )
}

// fill: the content takes the whole space under the header (chat, terms).
export function Shell({ nav, children, onClick, fill = false, className = '' }) {
  return (
    <div className={`shell ${className}`} onClick={onClick}>
      <SiteHeader nav={nav} />
      <main className={`page ${fill ? 'page-fill' : ''}`}>{children}</main>
    </div>
  )
}

// The design canvas below the header, for scenes laid out as in the PDF.
export const CONTENT = { x: 0, y: HEADER_H, w: CANVAS.w, h: CANVAS.h - HEADER_H }

// Shows a region of the design canvas (design px) at scale u, shrunk to fit
// the available width (and, if given, a share of the window height).
// Children use design coordinates. The canvas is cut off just below the
// region (plus `bleed` design px for artwork that spills past it), so the
// unused canvas underneath never makes the page scroll.
export function Block({ region, maxVh, bleed = 0, children }) {
  const g = useGeometry()
  const wrap = useRef(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = wrap.current
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    setWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [])
  const cap = g.compact ? 0.8 : g.u // compact: as large as the width allows
  // Desktop scenes always fit under the header, so they never scroll.
  const fitH = maxVh ? (g.vh * maxVh) / region.h : g.compact ? Infinity : (g.vh - HEADER_H * g.u) / region.h
  const k = Math.max(0, Math.min(cap, width / region.w, fitH))
  return (
    <div ref={wrap} className="block-wrap">
      <div className="block" style={{ width: region.w * k, height: region.h * k }}>
        <div
          className="block-inner"
          style={{ height: region.y + region.h + bleed, transform: `scale(${k}) translate(${-region.x}px, ${-region.y}px)` }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}

// A control's artwork, text and click area, moved together by the hover /
// press animations (styles.css, "Hover and press"). origin: its centre, design px.
export function Lift({ origin, className = '', children }) {
  return (
    <div className={`lift ${className}`} style={{ transformOrigin: `${origin[0]}px ${origin[1]}px` }}>
      {children}
    </div>
  )
}

// Invisible button over a control that's drawn in the artwork.
export function Zone({ rect, label, onClick, tone = 'light', disabled }) {
  return (
    <button
      type="button"
      className={`zone zone-${tone}`}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation()
        onClick?.(e)
      }}
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h, borderRadius: rect.r ?? 6 }}
    />
  )
}
