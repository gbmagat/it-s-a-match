// Participant progress, kept in this browser so a refresh continues where they
// left off. Sign-ups, participant codes and the order each participant
// chose live in the database (server/); the browser keeps only its token and
// where it is.

const KEY = 'itsamatch.session.v1'

// Text Style A, B, C are always these styles (research paper, Table 1);
// participants open them in any order they like (user decision 2026-10-24).
export const STYLES = ['formal', 'informal', 'colloquial']

export const LABELS = ['A', 'B', 'C']

// Match A = Filipino, Match B = English (research paper, Simulation Design).
export const MATCH_LANGUAGE = { A: 'fil', B: 'en' }

export function freshSession() {
  return {
    screen: 'landing',
    profile: null,      // { signedUp: true } once the sign-up is saved (the details live in the database)
    token: null,        // proves to the server which participant this browser is
    code: null,         // participant code from the server (P-001, ...)
    test: false,        // ?test: a test run, kept out of the study data
    match: null,        // 'A' | 'B'
    done: [],           // Text Styles finished, in the order done (0 = A, 1 = B, 2 = C)
    savedCompleted: 0,  // how many of those the server has confirmed
    chat: null,         // in-progress chat: { slot, cursor, sub, messages }
    notice: null,       // shown on the sign-up page when the server lost the sign-up (App.jsx)
    startedAt: null,
    finishedAt: null,
  }
}

export function loadSession() {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...freshSession(), ...JSON.parse(raw) } : freshSession()
  } catch {
    return freshSession()
  }
}

export function saveSession(session) {
  try {
    localStorage.setItem(KEY, JSON.stringify(session))
  } catch {
    // Private mode or blocked storage: progress just won't survive a refresh.
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(KEY)
  } catch {}
}

export const styleFor = (slot) => STYLES[slot]

// Where "get started" / "my match" should take a returning participant.
export function resumeScreen(session) {
  if (!session.profile) return 'signup'
  if (session.done.length >= 3) return 'done'
  if (!session.match) return 'choose'
  // An open chat, unless it's finished (left during the pause after its last bubble).
  if (session.chat && !session.done.includes(session.chat.slot)) return 'chat'
  return 'hub'
}
