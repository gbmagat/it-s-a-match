import { useEffect, useRef, useState } from 'react'

// Birth-date calendar in the site's style. Opens on a grid of years (birth
// dates are years back), then months, then days. Value is 'MM/DD/YYYY'.
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const FIRST_YEAR = 1930

const pad = (n) => String(n).padStart(2, '0')

export function parseDate(s) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s ?? '')
  if (!m) return null
  const [mm, dd, yyyy] = [+m[1], +m[2], +m[3]]
  const d = new Date(yyyy, mm - 1, dd)
  return d.getMonth() === mm - 1 && d.getDate() === dd ? { y: yyyy, m: mm - 1, d: dd } : null
}

function Chevron({ dir }) {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true">
      <path d={dir === 'left' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function DatePicker({ value, onPick, onClose, anchor, className = '', style }) {
  const now = new Date()
  const today = { y: now.getFullYear(), m: now.getMonth(), d: now.getDate() }
  const picked = parseDate(value)
  const [view, setView] = useState(picked ? 'days' : 'years')
  const [y, setY] = useState(picked ? picked.y : today.y - 20)
  const [m, setM] = useState(picked ? picked.m : 0)
  const root = useRef(null)

  // Close on a click or focus outside the calendar and its field, or on Escape.
  useEffect(() => {
    const outside = (e) => {
      if (!root.current?.contains(e.target) && !anchor?.current?.contains(e.target)) onClose()
    }
    const esc = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('pointerdown', outside)
    document.addEventListener('focusin', outside)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('focusin', outside)
      document.removeEventListener('keydown', esc)
    }
  }, [anchor, onClose])

  const future = (yy, mm = 0, dd = 1) => yy > today.y || (yy === today.y && (mm > today.m || (mm === today.m && dd > today.d)))
  const pageStart = FIRST_YEAR + Math.floor((y - FIRST_YEAR) / 12) * 12

  let title
  let prev
  let next
  let canPrev = true
  let canNext = true
  let grid
  if (view === 'years') {
    title = `${pageStart} – ${pageStart + 11}`
    prev = () => setY(y - 12)
    next = () => setY(y + 12)
    canPrev = pageStart > FIRST_YEAR
    canNext = pageStart + 12 <= today.y
    grid = (
      <div className="cal-grid cal-grid-wide">
        {Array.from({ length: 12 }, (_, i) => pageStart + i).map((yy) => (
          <button
            key={yy} type="button" className={`cal-cell cal-wide ${picked?.y === yy ? 'is-selected' : ''}`}
            disabled={yy > today.y} onClick={() => { setY(yy); setView('months') }}
          >
            {yy}
          </button>
        ))}
      </div>
    )
  } else if (view === 'months') {
    title = String(y)
    prev = () => setY(y - 1)
    next = () => setY(y + 1)
    canPrev = y > FIRST_YEAR
    canNext = y < today.y
    grid = (
      <div className="cal-grid cal-grid-wide">
        {MONTHS.map((name, mm) => (
          <button
            key={name} type="button" className={`cal-cell cal-wide ${picked?.y === y && picked?.m === mm ? 'is-selected' : ''}`}
            disabled={future(y, mm)} onClick={() => { setM(mm); setView('days') }}
          >
            {name.slice(0, 3)}
          </button>
        ))}
      </div>
    )
  } else {
    title = `${MONTHS[m]} ${y}`
    prev = () => (m === 0 ? (setM(11), setY(y - 1)) : setM(m - 1))
    next = () => (m === 11 ? (setM(0), setY(y + 1)) : setM(m + 1))
    canPrev = y > FIRST_YEAR || m > 0
    canNext = future(y, m + 1) === false
    const first = new Date(y, m, 1).getDay()
    const count = new Date(y, m + 1, 0).getDate()
    grid = (
      <div className="cal-grid cal-grid-days">
        {DAYS.map((d) => <span key={d} className="cal-dow" aria-hidden="true">{d}</span>)}
        {Array.from({ length: first }, (_, i) => <span key={`b${i}`} />)}
        {Array.from({ length: count }, (_, i) => i + 1).map((dd) => {
          const selected = picked?.y === y && picked?.m === m && picked?.d === dd
          const isToday = today.y === y && today.m === m && today.d === dd
          return (
            <button
              key={dd} type="button"
              className={`cal-cell ${selected ? 'is-selected' : ''} ${isToday ? 'is-today' : ''}`}
              aria-label={`${MONTHS[m]} ${dd}, ${y}`} aria-pressed={selected}
              disabled={future(y, m, dd)}
              onClick={() => onPick(`${pad(m + 1)}/${pad(dd)}/${y}`)}
            >
              {dd}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div ref={root} className={`cal ${className}`} style={style} role="dialog" aria-label="Choose your birth date">
      <div className="cal-head">
        <button type="button" className="cal-arrow" onClick={prev} disabled={!canPrev} aria-label="Previous">
          <Chevron dir="left" />
        </button>
        <button
          type="button" className="cal-title" disabled={view === 'years'}
          onClick={() => setView(view === 'days' ? 'months' : 'years')}
          aria-label={view === 'days' ? 'Choose month' : 'Choose year'}
        >
          {title}
        </button>
        <button type="button" className="cal-arrow" onClick={next} disabled={!canNext} aria-label="Next">
          <Chevron dir="right" />
        </button>
      </div>
      {grid}
    </div>
  )
}
