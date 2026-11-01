// End-to-end run of one participant, checking the logic:
// sign up -> swipe -> match -> the 3 Text Styles opened out of order -> done.
// The first chat is left for "my match" right after its last bubble (it must
// still count as finished); the second is reloaded half-way.
// Run it on this computer: the dev server (npm run dev) and the API with the
// in-memory test database (see README.md). Its sign-up
// is a test row (?test); on the live site it would still use up the next
// participant code. ?fast (dev server only) runs the timers 10x faster.
//   node tools/flow-test.mjs [A|B] [base-url] [width] [height]
import { chromium } from 'playwright-core'
import { existsSync, readFileSync } from 'node:fs'

const match = process.argv[2] ?? 'A'
const base = process.argv[3] ?? 'http://localhost:5173'
const script = JSON.parse(readFileSync(new URL('../src/content/script.json', import.meta.url), 'utf8'))
const lang = match === 'A' ? 'fil' : 'en'
const firstBubble = Object.fromEntries(['formal', 'informal', 'colloquial'].map((s) => [script.turns[0][lang][s][0], s]))

const executablePath = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync)
const browser = await chromium.launch({ executablePath })
const [vw, vh] = [Number(process.argv[4] ?? 1366), Number(process.argv[5] ?? 650)]
const page = await browser.newPage({ viewport: { width: vw, height: vh }, isMobile: vw < 700, hasTouch: vw < 700 })
const errors = []
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))
const fail = (msg) => { console.error('FAIL:', msg); process.exitCode = 1 }

await page.goto(`${base}/?reset`, { waitUntil: 'networkidle' })
await page.goto(`${base}/?test&fast`, { waitUntil: 'networkidle' })
await page.getByLabel('get started').click()

// Validation: empty form, then under-18.
await page.getByLabel('sign up').click()
if (!(await page.getByRole('alert').textContent()).includes('fill in')) fail('empty form not rejected')
await page.getByLabel('your first name').fill('Test')
// Birth date: typed on desktop (with the MM/DD/YYYY mask), picked from the
// calendar on phones. The age fills in from it and can't be typed.
const dateField = page.getByLabel('birth date (MM/DD/YYYY)')
const ageField = page.getByLabel('age (from your birth date)')
const phone = (await dateField.getAttribute('readonly')) !== null
async function setBirthDate(y, again) {
  await dateField.click()
  if (phone) {
    if (again) {
      await page.getByLabel('Choose month').click()
      await page.getByLabel('Choose year').click()
    }
    await page.getByRole('button', { name: String(y), exact: true }).click()
    await page.getByRole('button', { name: 'Jan', exact: true }).click()
    await page.getByRole('button', { name: `January 15, ${y}` }).click()
  } else {
    if (!(await page.locator('.cal').count())) fail('calendar did not open on desktop')
    await dateField.fill(`0115${y}`)
    await page.keyboard.press('Escape')
  }
}
const now = new Date()
const ageFrom = (y) => now.getFullYear() - y - (now.getMonth() > 0 || now.getDate() >= 15 ? 0 : 1) // born 15 January
await setBirthDate(now.getFullYear() - 17)
if ((await ageField.inputValue()) !== String(ageFrom(now.getFullYear() - 17))) fail(`age not filled in: "${await ageField.inputValue()}"`)
if ((await ageField.getAttribute('readonly')) === null) fail('age can be typed')
await page.getByLabel('tell me something about yourself').fill('testing the flow')
await page.getByLabel('sign up').click()
if (!(await page.getByRole('alert').textContent()).includes('18')) fail('under-18 not rejected')
if (!phone && (await dateField.inputValue()) !== `01/15/${now.getFullYear() - 17}`) fail('date mask')
await setBirthDate(now.getFullYear() - 22, true)
if ((await ageField.inputValue()) !== String(ageFrom(now.getFullYear() - 22))) fail(`age not recalculated: "${await ageField.inputValue()}"`)
await page.getByLabel('sign up').click()

// Swipe + found play on their own, then the choice.
await page.getByRole('button', { name: `Match ${match}` }).last().click({ timeout: 20000 }) // after the 8 s shuffle
await page.getByLabel('Text Style A').waitFor({ timeout: 10000 })

// Clicks "my match" the moment a chat's last bubble appears, inside the pause
// before the site goes back by itself. The chat must still count as finished
// (it used to be lost if another Text Style was opened next).
async function leaveDuringEndPause(label, style) {
  const bubbles = script.turns.flatMap((turn) => turn[lang][style])
  await page.evaluate(([count, last]) => new Promise((resolve) => {
    const check = () => {
      const shown = document.querySelectorAll('.bubble-match:not(.typing)')
      if (shown.length < count || shown[shown.length - 1].textContent !== last) return
      observer.disconnect()
      const myMatch = [...document.querySelectorAll('.site-nav button')].find((b) => b.textContent === 'my match')
      myMatch.click()
      resolve()
    }
    const observer = new MutationObserver(check)
    observer.observe(document.body, { childList: true, subtree: true })
    check()
  }), [bubbles.length, bubbles.at(-1)])
  const counted = await page.getByLabel(`Text Style ${label} (finished)`).waitFor({ timeout: 5000 }).then(() => true, () => false)
  if (counted) console.log(`  left during the pause after the last bubble: Text Style ${label} still counted as finished`)
  else fail(`left during the pause after the last bubble: Text Style ${label} was not counted as finished`)
}

// Text Style A = formal, B = informal, C = colloquial (Table 1); any can be
// opened first, so the run opens them out of order.
const STYLE_OF = { A: 'formal', B: 'informal', C: 'colloquial' }
const openOrder = match === 'A' ? ['C', 'A', 'B'] : ['B', 'C', 'A']
const seenStyles = []
for (let n = 0; n < 3; n++) {
  const label = openOrder[n]
  await page.getByRole('button', { name: `Text Style ${label}`, exact: true }).click()
  await page.locator('.chat-title, .m-chat-title').first().waitFor()
  const first = await page.locator('.bubble-match:not(.typing)').first().textContent({ timeout: 10000 })
  const style = firstBubble[first]
  if (!style) fail(`first bubble "${first}" is not a ${lang} turn-1 line`)
  if (style !== STYLE_OF[label]) fail(`Text Style ${label} opened ${style}, expected ${STYLE_OF[label]}`)
  seenStyles.push(style)
  let replies = 0
  for (;;) {
    // Next: reply buttons, or the chat ends and the site goes back by itself.
    const next = await Promise.race([
      page.locator('.reply-pill').first().waitFor({ timeout: 15000 }).then(() => 'reply', () => 'timeout'),
      page.locator('.chat-scroll').waitFor({ state: 'detached', timeout: 15000 }).then(() => 'ended', () => 'timeout'),
    ])
    if (next === 'timeout') fail('chat stalled')
    if (next !== 'reply') {
      const where = n < 2 ? page.getByRole('button', { name: `Text Style ${openOrder[n + 1]}`, exact: true }) : page.locator('.done-title')
      await where.waitFor({ timeout: 10000 })
      break
    }
    const options = await page.locator('.reply-pill').count()
    await page.locator('.reply-pill').nth(replies % options).click()
    replies++
    // First chat: leave for "my match" during the pause after its last bubble.
    if (n === 0 && replies === 7) {
      await leaveDuringEndPause(label, style)
      break
    }
    // Refresh in the middle of the second chat: it should pick up where it was.
    if (n === 1 && replies === 3) {
      const before = await page.locator('.bubble:not(.typing)').count()
      await page.reload({ waitUntil: 'networkidle' })
      const after = await page.locator('.bubble:not(.typing)').count()
      if (after < before) fail(`refresh lost messages (${before} -> ${after})`)
      console.log(`  refresh mid-chat kept ${after}/${before} bubbles`)
    }
  }
  const bubbles = await page.evaluate(() => JSON.parse(localStorage.getItem('itsamatch.session.v1')))
  console.log(`Text Style ${label}: style=${style} replies=${replies} done=${bubbles.done.map((i) => 'ABC'[i]).join('')}`)
  if (replies !== 7) fail(`expected 7 replies, got ${replies}`)
  // A finished card is darkened and can't be opened again.
  if (n < 2) {
    if (!(await page.getByLabel(`Text Style ${label} (finished)`).count())) fail(`Text Style ${label} not shown as finished`)
    if (await page.getByRole('button', { name: `Text Style ${label}`, exact: true }).count()) fail(`finished Text Style ${label} can still be opened`)
  }
}

await page.locator('.done-title').waitFor({ timeout: 10000 })
// The server must have all 3 finished chats (savedCompleted = what it confirmed).
await page
  .waitForFunction(() => JSON.parse(localStorage.getItem('itsamatch.session.v1')).savedCompleted === 3, null, { timeout: 15000 })
  .catch(() => fail('the server never confirmed 3 finished chats'))
const s = await page.evaluate(() => JSON.parse(localStorage.getItem('itsamatch.session.v1')))
if (new Set(seenStyles).size !== 3) fail(`styles repeated: ${seenStyles}`)
const doneOrder = s.done.map((i) => 'ABC'[i]).join('')
if (doneOrder !== openOrder.join('')) fail(`recorded order ${doneOrder}, opened ${openOrder.join('')}`)
console.log('done screen shown; code', s.code, 'order done', doneOrder, 'styles', seenStyles.join(' > '), 'profile kept:', JSON.stringify(s.profile))
if (errors.length) fail('console errors:\n' + errors.join('\n'))
await browser.close()
console.log(process.exitCode ? 'FLOW TEST FAILED' : 'FLOW TEST PASSED')
