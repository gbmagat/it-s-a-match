import { useRef, useState } from 'react'
import { Block, CONTENT, Layer, Lift, Shell, Zone, useIsMobile } from '../Stage.jsx'
import { SIGNUP } from '../design.js'
import { TEXTS, TextLayer } from '../TextLayer.jsx'
import { DatePicker, parseDate } from './DatePicker.jsx'

// Box positions come from the PDF; the card and boxes are artwork (signup-card),
// the labels are real text, the inputs sit on the boxes.
function boxStyle(r) {
  return { left: r.x, top: r.y, width: r.w, height: r.h }
}

// Formats typed digits as MM/DD/YYYY.
function maskDate(raw) {
  const d = raw.replace(/\D/g, '').slice(0, 8)
  if (d.length <= 2) return d
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`
}

function validDate(s) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s)
  if (!m) return false
  const [mm, dd, yyyy] = [+m[1], +m[2], +m[3]]
  const date = new Date(yyyy, mm - 1, dd)
  return date.getMonth() === mm - 1 && date.getDate() === dd && yyyy > 1900 && date < new Date()
}

// Age today, from the birth date (user request 2026-10-25: the age fills in
// from the birth date). A year older on the birthday itself; someone born on
// 29 February turns a year older on 1 March in other years.
export function ageOn(birth, today = new Date()) {
  const [m, d] = [today.getMonth(), today.getDate()]
  const hadBirthday = m > birth.m || (m === birth.m && d >= birth.d)
  return today.getFullYear() - birth.y - (hadBirthday ? 0 : 1)
}

// The age for a complete, valid birth date ('' while it's incomplete).
const ageFor = (birthDate) => (validDate(birthDate) ? String(ageOn(parseDate(birthDate))) : '')

export function SignUp({ nav, initial, notice, onSubmit }) {
  const mobile = useIsMobile()
  const [form, setForm] = useState(() => initial ?? { firstName: '', birthDate: '', bio: '' })
  const age = ageFor(form.birthDate) // never typed, so it always matches the birth date
  const [error, setError] = useState(notice ?? '') // e.g. the server lost the sign-up (App.jsx)
  const [calendar, setCalendar] = useState(false)
  const [busy, setBusy] = useState(false)
  const dateField = useRef(null)
  const openCalendar = () => setCalendar(true)
  const pickDate = (v) => {
    setForm((f) => ({ ...f, birthDate: v }))
    setError('')
    setCalendar(false)
  }
  const set = (k) => (e) => {
    const v = k === 'birthDate' ? maskDate(e.target.value) : e.target.value
    setForm((f) => ({ ...f, [k]: v }))
    setError('')
  }

  async function submit(e) {
    e?.preventDefault()
    if (busy) return
    const f = { ...form, firstName: form.firstName.trim(), bio: form.bio.trim(), age }
    if (!f.firstName || !f.birthDate || !f.bio) return setError('Please fill in every field.')
    if (!validDate(f.birthDate)) return setError('Please enter your birth date as MM/DD/YYYY.')
    if (+age < 18) return setError('You must be 18 or older to join.')
    if (+age > 120) return setError('Please check your birth date.')
    setBusy(true)
    try {
      await onSubmit(f) // saved to the database
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  if (mobile) {
    // Same card, labels and boxes as the PDF, laid out as a phone form.
    return (
      <Shell nav={nav}>
        <form className="m-signup" onSubmit={submit} noValidate>
          <label className="m-label">
            your first name
            <input className="m-field" aria-label="your first name" value={form.firstName} onChange={set('firstName')} autoComplete="given-name" maxLength={40} />
          </label>
          <div className="m-row">
            <label className="m-label">
              birth date
              {/* read-only on phones: tapping opens the calendar instead of the keyboard */}
              <input
                ref={dateField} className="m-field m-date" aria-label="birth date (MM/DD/YYYY)" value={form.birthDate}
                placeholder="MM/DD/YYYY" readOnly onFocus={openCalendar} onClick={openCalendar}
              />
            </label>
            <label className="m-label m-age">
              age
              <input className="m-field field-age" aria-label="age (from your birth date)" value={age} readOnly tabIndex={-1} />
            </label>
            {calendar && (
              <DatePicker className="cal-phone" value={form.birthDate} anchor={dateField} onPick={pickDate} onClose={() => setCalendar(false)} />
            )}
          </div>
          <label className="m-label">
            tell me something about yourself
            <textarea className="m-field m-bio" aria-label="tell me something about yourself" value={form.bio} onChange={set('bio')} maxLength={300} />
          </label>
          <button type="submit" className="m-signup-btn" aria-label="sign up">sign up</button>
        </form>
        <p className="m-error" role="alert">{error}</p>
      </Shell>
    )
  }

  // The sign-up card, as in the PDF, scaled with the window.
  return (
    <Shell nav={nav}>
      <Block region={CONTENT}>
        <Layer name="signup-card" />
        <TextLayer items={TEXTS.signup.filter((t) => t.text !== 'sign up')} />
        <form className="signup" onSubmit={submit} noValidate>
          <input
            className="field" style={boxStyle(SIGNUP.firstName)} value={form.firstName} onChange={set('firstName')}
            aria-label="your first name" autoComplete="given-name" maxLength={40} autoFocus
          />
          <input
            ref={dateField} className="field" style={boxStyle(SIGNUP.birthDate)} value={form.birthDate} onChange={set('birthDate')}
            aria-label="birth date (MM/DD/YYYY)" placeholder="MM/DD/YYYY" inputMode="numeric" autoComplete="bday"
            onFocus={openCalendar} onClick={openCalendar}
          />
          <input
            className="field field-age" style={boxStyle(SIGNUP.age)} value={age} readOnly tabIndex={-1}
            aria-label="age (from your birth date)"
          />
          <textarea
            className="field field-bio" style={boxStyle(SIGNUP.bio)} value={form.bio} onChange={set('bio')}
            aria-label="tell me something about yourself" maxLength={300}
          />
          <button type="submit" hidden />
        </form>
        {calendar && (
          <DatePicker
            className="cal-desktop" style={{ left: SIGNUP.birthDate.x, top: SIGNUP.birthDate.y + SIGNUP.birthDate.h + 10 }}
            value={form.birthDate} anchor={dateField} onPick={pickDate} onClose={() => setCalendar(false)}
          />
        )}
        <Lift origin={[SIGNUP.submit.x + SIGNUP.submit.w / 2, SIGNUP.submit.y + SIGNUP.submit.h / 2]}>
          <Layer name="signup-button" />
          <TextLayer items={TEXTS.signup.filter((t) => t.text === 'sign up')} />
          <Zone rect={SIGNUP.submit} label="sign up" tone="light" onClick={submit} />
        </Lift>
        {error && <p className="form-error" role="alert" style={{ top: SIGNUP.errorY }}>{error}</p>}
      </Block>
    </Shell>
  )
}
