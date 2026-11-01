import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { LayerImg, Shell } from '../Stage.jsx'
import { TIMING, typingDelay } from '../design.js'
import { buildSteps } from '../content/chatScript.js'

// progress: { cursor, sub, messages: [{ who: 'match' | 'me', text }], picks: [{ id, option }] }
function reducer(state, action) {
  switch (action.type) {
    case 'typing':
      return { ...state, typing: true }
    case 'bubble': {
      const messages = [...state.messages, { who: 'match', text: action.text }]
      // The last bubble of a turn moves on to the next step.
      return action.last
        ? { ...state, typing: false, cursor: state.cursor + 1, sub: 0, messages }
        : { ...state, typing: false, sub: state.sub + 1, messages }
    }
    case 'reply':
      return {
        ...state,
        cursor: state.cursor + 1,
        sub: 0,
        messages: [...state.messages, ...action.bubbles.map((text) => ({ who: 'me', text }))],
        picks: [...state.picks, { id: action.id, option: action.option }],
      }
    default:
      return state
  }
}

// Reply buttons. If they fit on one line they follow the PDF (p10): each sized
// to its text, the last one filling the rest. If they don't fit, they stack as
// equal full-width buttons instead of a ragged second row.
function Replies({ options, onPick }) {
  const row = useRef(null)
  const [stacked, setStacked] = useState(false)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const parent = row.current?.parentElement
    if (!parent) return
    const ro = new ResizeObserver(() => setWidth(parent.clientWidth))
    ro.observe(parent)
    return () => ro.disconnect()
  }, [])
  useLayoutEffect(() => setStacked(false), [width]) // the chat box resized: try one line again
  useLayoutEffect(() => {
    const el = row.current
    if (!el || stacked) return
    const tops = new Set([...el.children].map((c) => c.offsetTop))
    if (tops.size > 1) setStacked(true)
  })
  return (
    <div ref={row} className={`replies ${stacked ? 'stacked' : ''}`}>
      {options.map((bubbles, i) => (
        <button key={i} type="button" className="reply-pill" onClick={() => onPick(i)}>
          {bubbles.map((t, j) => <span key={j}>{t}</span>)}
        </button>
      ))}
    </div>
  )
}

// Vertical gap above a bubble, from the spacing in the PDF (p9/p10).
function gapAbove(prev, who) {
  if (!prev) return 0
  if (prev === who) return 10
  return who === 'me' ? 1.9 : 19.3
}

export function Chat({ nav, match, lang, style, progress, onProgress, onComplete, onFinished, demo }) {
  const steps = useMemo(() => buildSteps(lang, style), [lang, style])
  const [state, setState] = useState(() => ({
    cursor: 0, sub: 0, messages: [], picks: [], ...(demo ?? progress), typing: demo?.typing ?? false,
  }))
  const latest = useRef(state)
  const save = useRef(onProgress)
  save.current = onProgress
  // Apply a step and save it right away, so a refresh never loses the last bubble or reply.
  const dispatch = useCallback((action) => {
    const next = reducer(latest.current, action)
    latest.current = next
    setState(next)
    if (!demo && action.type !== 'typing') {
      const { cursor, sub, messages, picks } = next
      save.current?.({ cursor, sub, messages, picks })
    }
  }, [demo])
  const complete = useRef(onComplete)
  complete.current = onComplete
  const finish = useRef(onFinished)
  finish.current = onFinished
  const step = steps[state.cursor]

  // Play the match's bubbles: pause, "typing…", bubble, repeat.
  useEffect(() => {
    if (demo) return
    if (!step) {
      // Conversation over. It counts as finished right away, so leaving during
      // the pause can't lose it; the last bubble stays on screen, then back.
      complete.current?.()
      const t = setTimeout(() => finish.current(latest.current.picks), TIMING.endOfChat)
      return () => clearTimeout(t)
    }
    if (step.type !== 'match') return
    const text = step.bubbles[state.sub]
    const last = state.sub >= step.bubbles.length - 1
    let typingTimer
    const lead = setTimeout(() => {
      dispatch({ type: 'typing' })
      typingTimer = setTimeout(() => dispatch({ type: 'bubble', text, last }), typingDelay(text))
    }, state.sub === 0 ? TIMING.afterReply : TIMING.betweenBubbles)
    return () => {
      clearTimeout(lead)
      clearTimeout(typingTimer)
    }
  }, [state.cursor, state.sub, step, demo, dispatch])

  const scroller = useRef(null)
  useLayoutEffect(() => {
    const el = scroller.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: state.messages.length > 1 ? 'smooth' : 'auto' })
  }, [state.messages.length, state.typing])

  const options = !demo?.hideOptions && step?.type === 'reply' && !state.typing ? step.options : null

  let prev = null
  const bubbles = state.messages.map((m, i) => {
    const el = (
      <div key={i} className={`bubble bubble-${m.who}`} style={{ marginTop: `calc(var(--u) * ${gapAbove(prev, m.who)}px)` }}>
        {m.text}
      </div>
    )
    prev = m.who
    return el
  })

  const messages = (
    <div className="chat-scroll" ref={scroller} aria-live="polite">
      {bubbles}
      {state.typing && (
        <div className="bubble bubble-match typing" style={{ marginTop: `calc(var(--u) * ${gapAbove(prev, 'match')}px)` }} aria-label="typing">
          <span /><span /><span />
        </div>
      )}
    </div>
  )

  const input = options ? (
    <Replies
      key={step.id}
      options={options}
      onPick={(i) => dispatch({ type: 'reply', id: step.id, option: i, bubbles: options[i] })}
    />
  ) : (
    <div className="idle-bar" aria-hidden="true">
      <span className="idle-aa">Aa</span>
    </div>
  )

  // The PDF's chat box (p9/p10), stretched to fill the window under the header.
  // All inner sizes are the PDF's, scaled with the window (styles.css, "Chat").
  return (
    <Shell nav={nav} fill>
      <div className="chat">
        <div className="chat-head">
          <LayerImg className="chat-avatar" name="chat-avatar" />
          <div className="chat-title">{`Match  ${match}`}</div>
          <LayerImg className="chat-phone" name="icon-phone" />
          <LayerImg className="chat-video" name="icon-video" />
        </div>
        {messages}
        <div className={`chat-foot ${options ? 'has-replies' : ''}`}>
          <LayerImg className="chat-camera" name="icon-camera" />
          <div className="chat-input">{input}</div>
          <LayerImg className="chat-send" name="icon-send" />
        </div>
      </div>
    </Shell>
  )
}
