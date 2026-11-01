import { useCallback, useEffect, useState } from 'react'
import { Backdrop, GeometryProvider } from './Stage.jsx'
import { preloadAssets } from './assets.js'
import { LABELS, MATCH_LANGUAGE, clearSession, freshSession, loadSession, resumeScreen, saveSession, styleFor } from './session.js'
import { checkSignUp, chooseMatch, saveProgress, signUp } from './api.js'
import { readPreview } from './preview.js'
import { Choose, Done, Found, Hub, ItsAMatch, Landing, Swipe, Terms } from './screens/Screens.jsx'
import { SignUp } from './screens/SignUp.jsx'
import { Chat } from './screens/Chat.jsx'
import { LogoutDialog } from './screens/LogoutDialog.jsx'

// Background behind each screen (puzzle by default); it stays mounted across pages.
const BACKDROP = { swipe: 'photo-hands', found: 'photo-hands', choose: 'photo-picnic' }

// ?reset clears this browser's progress (for piloting on one computer).
// ?test marks this browser's sign-up as a test run (not counted for balancing).
function initialSession() {
  const params = new URLSearchParams(window.location.search)
  let s = loadSession()
  if (params.has('reset')) {
    clearSession()
    s = freshSession()
  }
  // Progress from before the database existed can't be continued.
  if (s.profile && !s.token) s = freshSession()
  if (params.has('test')) s = { ...s, test: true }
  if (params.has('reset') || params.has('test')) {
    params.delete('reset')
    params.delete('test')
    const q = params.toString()
    window.history.replaceState(null, '', window.location.pathname + (q ? `?${q}` : ''))
    saveSession(s)
  }
  return s
}

export default function App() {
  const [preview] = useState(readPreview)
  const [session, setSession] = useState(() => preview?.session ?? initialSession())
  const [askLogout, setAskLogout] = useState(preview?.name === 'logout')

  useEffect(() => {
    preloadAssets()
  }, [])

  // Every change is saved immediately, so a refresh resumes exactly here.
  const update = useCallback(
    (patch) =>
      setSession((s) => {
        const next = { ...s, ...(typeof patch === 'function' ? patch(s) : patch) }
        if (!preview) saveSession(next)
        return next
      }),
    [preview],
  )
  // Forgets this browser's sign-up and starts over (a researcher's ?test run
  // stays a test run). With `onlyIf`: only while that's still the sign-up in use.
  const startOver = useCallback(
    (patch, onlyIf) =>
      setSession((s) => {
        if (onlyIf && s.token !== onlyIf) return s
        const fresh = { ...freshSession(), test: s.test, ...patch }
        if (!preview) saveSession(fresh)
        return fresh
      }),
    [preview],
  )
  // The server no longer has this sign-up (a test entry deleted in the admin
  // panel, or the table emptied before real data), so nothing more can be
  // saved for it: back to the sign-up page, saying why.
  const signUpGone = useCallback(
    (gone) => startOver({ screen: 'signup', notice: 'We couldn’t find your sign-up. Please sign up again.' }, gone),
    [startOver],
  )

  const { token, savedCompleted = 0 } = session
  // Is this browser's sign-up still on the server? Checked when the page loads
  // (and once after signing up); if it's gone, start over like a new participant.
  useEffect(() => {
    if (preview || !token) return
    checkSignUp(token).catch((err) => err.status === 401 && startOver({ screen: 'landing' }, token))
  }, [preview, token, startOver])

  // Finished chats are sent to the server until it confirms them: a request
  // that fails or is cut off is retried (after 2 s, slowing to every 30 s),
  // and again after a reload, so the admin panel never shows a participant
  // who finished as unfinished. If the server no longer has the sign-up,
  // retrying can't help.
  const doneOrder = session.done.map((slot) => LABELS[slot]).join('') // e.g. 'BAC'
  useEffect(() => {
    if (preview || !token || doneOrder.length <= savedCompleted) return
    let stopped = false
    let timer
    const attempt = (wait) =>
      saveProgress(token, doneOrder).then(
        () => !stopped && update((s) => ({ savedCompleted: Math.max(s.savedCompleted ?? 0, doneOrder.length) })),
        (err) => {
          if (stopped) return
          if (err.status === 401) signUpGone(token)
          else timer = setTimeout(() => attempt(Math.min(wait * 2, 30000)), wait)
        },
      )
    attempt(2000)
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [preview, token, doneOrder, savedCompleted, update, signUpGone])

  const go = (screen) => update({ screen })
  const nav = {
    onHome: () => go('landing'),
    // "my match" = the Text Style A/B/C page once a match is chosen (an open chat resumes from there).
    onMyMatch: () => {
      if (session.done.length >= 3) go('done')
      else if (session.match) go('hub')
      else if (session.profile) go(resumeScreen(session))
    },
    // Once signed up: asks first (LogoutDialog), then ends this browser's session.
    onLogout: session.profile ? () => setAskLogout(true) : undefined,
  }
  function logout() {
    setAskLogout(false)
    startOver({ screen: 'landing' })
  }
  const freeze = Boolean(preview)

  let screen
  switch (session.screen) {
    case 'terms':
      screen = <Terms nav={nav} />
      break
    case 'signup':
      screen = (
        <SignUp
          nav={nav}
          notice={session.notice}
          onSubmit={async (profile) => {
            if (preview) return update({ profile: { signedUp: true }, screen: 'swipe' })
            const { token, code } = await signUp(profile, session.test)
            update((s) => ({
              profile: { signedUp: true }, token, code, notice: null, startedAt: s.startedAt ?? new Date().toISOString(), screen: 'swipe',
            }))
          }}
        />
      )
      break
    case 'swipe':
      screen = <Swipe nav={nav} freeze={freeze} onDone={() => go('found')} />
      break
    case 'found':
      screen = <Found nav={nav} freeze={freeze} onDone={() => go('choose')} />
      break
    case 'choose':
      screen = (
        <Choose
          nav={nav}
          onChoose={async (match) => {
            if (session.match) return go('itsamatch')
            if (preview) return update({ match, screen: 'itsamatch' })
            try {
              const saved = await chooseMatch(session.token, match)
              update({ match: saved.match, screen: 'itsamatch' })
            } catch (err) {
              if (err.status === 401) return signUpGone(session.token)
              throw err // shown on the page
            }
          }}
        />
      )
      break
    case 'itsamatch':
      screen = <ItsAMatch nav={nav} match={session.match} freeze={freeze} onDone={() => go('hub')} />
      break
    case 'hub':
      screen = (
        <Hub
          nav={nav}
          match={session.match}
          done={session.done}
          onOpen={(slot) => update((s) => ({ screen: 'chat', chat: s.chat?.slot === slot ? s.chat : { slot } }))}
        />
      )
      break
    case 'chat': {
      const slot = session.chat?.slot ?? [0, 1, 2].find((i) => !session.done.includes(i))
      const demo = preview?.chat
      // The last bubble is on screen: the chat counts as finished from now on
      // (the effect above sends it to the server), even if the participant
      // leaves during the pause before the site goes back by itself.
      const complete = () =>
        update((s) => {
          if (s.done.includes(slot)) return {}
          const done = [...s.done, slot]
          return done.length >= 3 ? { done, finishedAt: new Date().toISOString() } : { done }
        })
      screen = (
        <Chat
          key={`${session.match}-${slot}`}
          nav={nav}
          match={session.match}
          lang={demo?.lang ?? MATCH_LANGUAGE[session.match]}
          style={demo?.style ?? styleFor(slot)}
          demo={demo?.demo}
          progress={session.chat?.cursor !== undefined ? session.chat : undefined}
          onProgress={(p) => update((s) => ({ chat: { ...p, slot } }))}
          onComplete={complete}
          onFinished={() => update((s) => ({ chat: null, screen: s.done.length >= 3 ? 'done' : 'hub' }))}
        />
      )
      break
    }
    case 'done':
      screen = <Done nav={nav} />
      break
    default:
      screen = <Landing onStart={() => go(resumeScreen(session))} onPrivacy={() => go('terms')} />
  }

  return (
    <GeometryProvider>
      <Backdrop bg={BACKDROP[session.screen] ?? 'puzzle'} />
      {screen}
      {askLogout && <LogoutDialog onStay={() => setAskLogout(false)} onLogout={logout} />}
    </GeometryProvider>
  )
}
