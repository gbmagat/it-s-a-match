import { useEffect, useRef, useState } from 'react'
import { Block, CONTENT, Layer, Lift, Shell, Zone, useGeometry, useIsMobile } from '../Stage.jsx'
import { CHOOSE, HUB_CARDS, HUB_CARD_RADIUS, LANDING, TIMING } from '../design.js'
import { LABELS } from '../session.js'
import { TEXTS, TextLayer } from '../TextLayer.jsx'

// Every screen is responsive (see Stage.jsx). Designed scenes are a Block of
// the PDF canvas, scaled with the window; on narrow screens (compact) they are
// rearranged into one column.

const GET_STARTED = TEXTS.landing.filter((t) => t.text === 'get started')
const PRIVACY = TEXTS.landing.filter((t) => t.text === 'Privacy Policy.' || t.rect)
const LANDING_REST = TEXTS.landing.filter((t) => !GET_STARTED.includes(t) && !PRIVACY.includes(t))

function useAutoAdvance(ms, onDone, enabled = true) {
  const done = useRef(onDone)
  done.current = onDone
  useEffect(() => {
    if (!enabled) return
    const t = setTimeout(() => done.current(), ms)
    return () => clearTimeout(t)
  }, [ms, enabled])
}

// Regions of the design canvas shown on narrow screens (design px).
const C_REGION = {
  landing: { x: 98, y: 232, w: 832, h: 606 },
  swipe: { x: 236, y: 190, w: 954, h: 720 },
  found: { x: 335, y: 182, w: 726, h: 724 },
  chooseA: { x: 220, y: 176, w: 568, h: 612 },
  chooseB: { x: 652, y: 176, w: 568, h: 612 },
  chooseAB: { x: 220, y: 176, w: 1000, h: 612 }, // landscape: side by side, as in the PDF
  itsAMatch: { x: 350, y: 245, w: 740, h: 590 },
  hub: { x: 165, y: 210, w: 1110, h: 632 },
}

function GetStarted({ onStart }) {
  return (
    <Lift origin={[275.5, 790.5]}>
      <Layer name="landing-button" />
      <TextLayer items={GET_STARTED} />
      <Zone rect={LANDING.getStarted} label="get started" onClick={onStart} />
    </Lift>
  )
}

// p1
export function Landing({ onStart, onPrivacy }) {
  if (useIsMobile()) {
    return (
      <Shell>
        <Block region={C_REGION.landing} maxVh={0.62} bleed={24 /* the button's hover shadow */}>
          <TextLayer items={LANDING_REST.filter((t) => t.y < 900)} />
          <GetStarted onStart={onStart} />
        </Block>
        <p className="m-legal">
          By getting started, you agree to our terms, see how we use your data in our{' '}
          <button type="button" className="m-link" onClick={onPrivacy}>Privacy Policy</button>.
        </p>
      </Shell>
    )
  }
  return (
    <Shell>
      <Block region={CONTENT}>
        <TextLayer items={LANDING_REST} />
        <GetStarted onStart={onStart} />
        <Lift className="lift-link" origin={[1063, 920]}>
          <TextLayer items={PRIVACY} />
          <Zone rect={LANDING.privacy} label="Privacy Policy" onClick={onPrivacy} />
        </Lift>
      </Block>
    </Shell>
  )
}

// p2: the research team's Privacy Policy (sent 2026-10-24). The white panel
// stretches with the window; the text scrolls inside it if it doesn't fit.
export function Terms({ nav }) {
  return (
    <Shell nav={nav} fill>
      <div className="panel terms">
        <h1 className="terms-title"><span className="grad-text">Privacy Policy</span></h1>
        <p className="terms-p terms-p1">
          All information collected during this experiment will remain strictly confidential. Your name and personal
          identifiers will not be linked to your responses. Data will be assigned a random participant ID number and will
          be stored securely on a password-protected server accessible only to the primary research team. The findings of
          this study may be published in scientific journals or presented at conferences, but we will share data only in an
          aggregate, anonymized format.
        </p>
        <h2 className="terms-sub"><span className="grad-text">Voluntary Participation</span></h2>
        <p className="terms-p">
          Your participation in this research is completely voluntary. You may choose not to take part at all. If you decide
          to participate, you may stop at any point during the experiment or decline to answer any specific question without
          giving a reason and without any penalty or loss of benefits to which you are otherwise entitled. If you choose to
          withdraw, any data collected from you up to that point will be permanently deleted.
        </p>
        <p className="terms-sign"><span className="grad-text">love &amp; light, the researchers</span></p>
      </div>
    </Shell>
  )
}

// Which card a name belongs to: the center card is the side cards at 1.46x,
// so its names are the larger ones; side cards split left/right of centre.
function cardOf(t) {
  if (t.size > 45 || (t.text.startsWith('Angeles') && t.size > 25)) return 'center'
  return t.xs[0] < 720 ? 'left' : 'right'
}

// In the PDF the right card's name is hidden behind the front card, and is a
// copy of "Person A"; the shuffle shows it, so it gets its own name.
const swipeText = (t) => (cardOf(t) === 'right' && t.text === 'Person A' ? { ...t, text: 'Person C' } : t)

function SwipeCards({ freeze }) {
  const card = (side) => (
    <div className={`sw-card sw-${side}`}>
      <Layer name={`card-${side}`} />
      <TextLayer items={TEXTS.swipe.filter((t) => cardOf(t) === side).map(swipeText)} />
    </div>
  )
  return (
    <div className={`swipe ${freeze ? 'frozen' : 'playing'}`} style={{ '--swipe-dur': `${TIMING.swipe}ms` }}>
      {/* drawn under the photo in the PDF, so it shows through at 82% */}
      <Layer name="swipe-dots" style={{ opacity: 0.82 }} />
      <Layer name="swipe-dots-top" />
      {card('right')}
      {card('left')}
      <Layer name="swipe-glow" className="sw-glow" />
      {card('center')}
    </div>
  )
}

// p4: cards shuffle on their own, then "you found a match"
export function Swipe({ nav, onDone, freeze }) {
  useAutoAdvance(TIMING.swipe, onDone, !freeze)
  const compact = useIsMobile()
  return (
    <Shell nav={nav}>
      {/* the halftone dots reach y 958, below the cards: keep them */}
      <Block region={compact ? C_REGION.swipe : CONTENT} maxVh={compact ? 0.66 : undefined} bleed={compact ? 50 : 0}>
        <SwipeCards freeze={freeze} />
      </Block>
    </Shell>
  )
}

// p5
export function Found({ nav, onDone, freeze }) {
  useAutoAdvance(TIMING.found, onDone, !freeze)
  const compact = useIsMobile()
  return (
    <Shell nav={nav} onClick={freeze ? undefined : onDone}>
      <Block region={compact ? C_REGION.found : CONTENT} maxVh={compact ? 0.6 : undefined}>
        <Layer name="found-heart" className={freeze ? '' : 'pop-in'} />
      </Block>
    </Shell>
  )
}

// One match: glow, avatar, button and label, growing a little on hover.
function MatchChoice({ m, onPick }) {
  const a = CHOOSE[m].avatar
  return (
    <Lift className="lift-soft" origin={[a.x + a.w / 2, a.y + a.h / 2 + 60]}>
      <Layer name={`choose-${m.toLowerCase()}-art`} />
      <TextLayer items={TEXTS.choose.filter((t) => t.text === `Match ${m}`)} />
      <Zone rect={{ ...a, r: a.w / 2 }} label={`Match ${m}`} tone="photo" onClick={onPick} />
      <Zone rect={CHOOSE[m].button} label={`Match ${m}`} tone="dark" onClick={onPick} />
    </Lift>
  )
}

// p6: participant clicks the match the researcher gave them.
export function Choose({ nav, onChoose: save }) {
  const [error, setError] = useState('')
  const busy = useRef(false)
  async function onChoose(m) {
    if (busy.current) return
    busy.current = true
    setError('')
    try {
      await save(m)
    } catch (err) {
      setError(err.message)
      busy.current = false
    }
  }
  const g = useGeometry()
  if (g.compact) {
    // Portrait: Match A above Match B (each half of the PDF composition).
    // Landscape: side by side.
    const pick = (m) => <MatchChoice key={m} m={m} onPick={() => onChoose(m)} />
    return (
      <Shell nav={nav}>
        {g.vw > g.vh ? (
          <Block region={C_REGION.chooseAB} maxVh={0.68}>{['A', 'B'].map(pick)}</Block>
        ) : (
          ['A', 'B'].map((m) => (
            <Block key={m} region={C_REGION[`choose${m}`]} maxVh={0.36}>{pick(m)}</Block>
          ))
        )}
        <div className="m-toast-slot">{error && <div className="m-toast" role="alert">{error}</div>}</div>
      </Shell>
    )
  }
  return (
    <Shell nav={nav}>
      <Block region={CONTENT}>
        {['A', 'B'].map((m) => <MatchChoice key={m} m={m} onPick={() => onChoose(m)} />)}
        {error && <div className="hub-toast choose-error" role="alert">{error}</div>}
      </Block>
    </Shell>
  )
}

// p7 / p11: only the "You + Match / it's a match!" graphic animates in.
export function ItsAMatch({ nav, match, onDone, freeze }) {
  useAutoAdvance(TIMING.itsAMatch, onDone, !freeze)
  const compact = useIsMobile()
  return (
    <Shell nav={nav} onClick={freeze ? undefined : onDone}>
      <Block region={compact ? C_REGION.itsAMatch : CONTENT} maxVh={compact ? 0.6 : undefined}>
        <div className={`match-art ${freeze ? '' : 'match-in'}`}>
          <Layer name={match === 'A' ? 'itsamatch-a-art' : 'itsamatch-b-art'} />
          <TextLayer items={TEXTS[`itsamatch-${match.toLowerCase()}`]} />
        </div>
      </Block>
    </Shell>
  )
}

const inCard = (t, r) => t.xs[0] >= r.x && t.xs[0] <= r.x + r.w && t.y >= r.y && t.y <= r.y + r.h
const hubTitle = (match) => TEXTS[`hub-${match.toLowerCase()}`].filter((t) => !HUB_CARDS.some((r) => inCard(t, r)))

// Text Style cards lift on hover; any one can be opened first. A finished one
// is darkened and can't be opened again.
function HubCards({ match, done, open }) {
  return HUB_CARDS.map((rect, slot) => {
    const box = { left: rect.x, top: rect.y, width: rect.w, height: rect.h, borderRadius: HUB_CARD_RADIUS }
    return (
      <Lift key={slot} origin={[rect.x + rect.w / 2, rect.y + rect.h / 2]}>
        <Layer name={`hub-card-${slot}`} />
        <TextLayer items={TEXTS[`hub-${match.toLowerCase()}`].filter((t) => inCard(t, rect))} />
        {done.includes(slot) ? (
          <div className="card-done" style={box} role="img" aria-label={`Text Style ${LABELS[slot]} (finished)`} />
        ) : (
          <Zone rect={{ ...rect, r: HUB_CARD_RADIUS }} label={`Text Style ${LABELS[slot]}`} tone="dark" onClick={() => open(slot)} />
        )}
      </Lift>
    )
  })
}

// p8 / p12: Text Style A (formal), B (informal), C (colloquial), in any order.
export function Hub({ nav, match, done, onOpen }) {
  const compact = useIsMobile()
  return (
    <Shell nav={nav}>
      <Block region={compact ? C_REGION.hub : CONTENT} maxVh={compact ? 0.6 : undefined}>
        <Layer name={match === 'A' ? 'hub-a-art' : 'hub-b-art'} />
        <TextLayer items={hubTitle(match)} />
        <HubCards match={match} done={done} open={onOpen} />
      </Block>
    </Shell>
  )
}

// Not in the PDF: styled to match. Sizes follow the window.
export function Done({ nav }) {
  return (
    <Shell nav={nav}>
      <div className="done">
        <h1 className="done-title">Thank you!</h1>
        <p className="done-sub">You finished all three chats</p>
        <p className="done-text">Please finish the last part of your form, then let your researcher know you&rsquo;re done.</p>
      </div>
    </Shell>
  )
}
