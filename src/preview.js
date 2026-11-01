// Development only: open any screen in a fixed state with ?preview=<name>, so
// it can be compared against the matching page of the design PDF.
//   landing, terms, signup, swipe, found, choose, itsamatch-a,
//   itsamatch-b, hub-a, hub-b, hub-progress, chat-p9, chat-p10, done, logout
import { freshSession } from './session.js'

const P9 = [
  { who: 'match', text: 'Good evening!' },
  { who: 'me', text: 'Hey, good evening :)' },
]
const P10 = [...P9, { who: 'match', text: 'How was your day?' }]

const CHAT_DEMOS = {
  // PDF p9: after the first exchange, match typing (English, formal).
  'chat-p9': { lang: 'en', style: 'formal', demo: { messages: P9, cursor: 2, sub: 0, typing: true, hideOptions: true } },
  // PDF p10: reply choices for "How was your day?".
  'chat-p10': { lang: 'en', style: 'formal', demo: { messages: P10, cursor: 3, sub: 0 } },
}

export function readPreview() {
  if (!import.meta.env.DEV) return null
  const name = new URLSearchParams(window.location.search).get('preview')
  if (!name) return null
  const base = {
    ...freshSession(),
    profile: { firstName: 'Sam', birthDate: '01/01/2004', age: '21', bio: 'hello' },
    code: 'P-7K2Q',
    match: 'A',
  }
  const fixtures = {
    landing: { screen: 'landing' },
    terms: { screen: 'terms' },
    signup: { screen: 'signup', profile: null },
    swipe: { screen: 'swipe' },
    found: { screen: 'found' },
    choose: { screen: 'choose', match: null },
    'itsamatch-a': { screen: 'itsamatch', match: 'A' },
    'itsamatch-b': { screen: 'itsamatch', match: 'B' },
    'hub-a': { screen: 'hub', match: 'A' },
    'hub-b': { screen: 'hub', match: 'B' },
    'hub-progress': { screen: 'hub', match: 'A', done: [1] }, // B finished first
    'chat-p9': { screen: 'chat' },
    'chat-p10': { screen: 'chat' },
    done: { screen: 'done', done: [1, 0, 2] },
    logout: { screen: 'hub', match: 'A' }, // with the log-out question open
  }
  if (!fixtures[name]) return null
  return {
    name,
    session: { ...base, ...fixtures[name] },
    chat: CHAT_DEMOS[name] ?? null,
  }
}
