import script from './script.json'

// The conversation as a list of steps for one language + text style:
// turn 1, reply A, turn 2, reply B, ... reply G, turn 8.
// match step:  { type: 'match', bubbles: [text, ...] }
// reply step:  { type: 'reply', id: 'A', options: [[text, ...], ...] }
export function buildSteps(lang, style) {
  const steps = []
  script.turns.forEach((turn, i) => {
    steps.push({ type: 'match', bubbles: turn[lang][style] })
    const reply = script.replies[i]
    if (reply) steps.push({ type: 'reply', id: reply.id, options: reply[lang] })
  })
  return steps
}
