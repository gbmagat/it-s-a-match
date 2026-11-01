// What happens when the server no longer has this browser's sign-up (a test
// entry deleted in the admin panel, or the table emptied before real data):
//   1. on load, the site starts over on the landing page, like a new participant;
//   2. choosing a match, or 3. saving a finished chat, goes back to the sign-up
//      page with a line saying why.
// It uses a made-up sign-up the server has never seen, so it adds nothing to
// the database (safe on the live site too). For 2 and 3 the check on load is
// answered "still there", as if the sign-up vanished after the page loaded.
//   node tools/signup-gone-test.mjs [base-url] [width] [height]
import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { chromium } from 'playwright-core'

const base = process.argv[2] ?? 'http://localhost:5173'
const [vw, vh] = [Number(process.argv[3] ?? 1366), Number(process.argv[4] ?? 650)]
const KEY = 'itsamatch.session.v1'
const NOTICE = 'We couldn’t find your sign-up. Please sign up again.'

const executablePath = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync)
const browser = await chromium.launch({ executablePath })
const fail = (msg) => { console.error('FAIL:', msg); process.exitCode = 1 }

// A browser that signed up as a test run, with a token the server never
// issued, and got as far as `screen`.
const stale = (patch) => ({
  screen: 'hub', profile: { signedUp: true }, token: randomBytes(32).toString('hex'), code: 'P-999', test: true,
  match: 'A', done: [], savedCompleted: 0, chat: null, startedAt: null, finishedAt: null, ...patch,
})

async function open(session, { stillThereOnLoad = false } = {}) {
  const context = await browser.newContext({ viewport: { width: vw, height: vh }, isMobile: vw < 700, hasTouch: vw < 700 })
  const page = await context.newPage()
  page.on('pageerror', (e) => fail(`page error: ${e}`))
  if (stillThereOnLoad) await page.route('**/api/me', (route) => route.fulfill({ json: { ok: true } }))
  await page.goto(base)
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [KEY, JSON.stringify(session)])
  await page.reload()
  return { page, close: () => context.close() }
}

const stored = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), KEY)

function checkForgotten(s, when) {
  if (s?.token) fail(`${when}: the old sign-up was kept`)
  if (!s?.test) fail(`${when}: the ?test mark was lost`)
}

async function expectSignUpAgain(page, when) {
  const shown = await page.getByRole('alert').filter({ hasText: NOTICE }).waitFor({ timeout: 6000 }).then(() => true, () => false)
  if (!shown) return fail(`${when}: no "${NOTICE}" on the sign-up page`)
  if (!(await page.getByLabel('your first name').count())) fail(`${when}: not on the sign-up page`)
  checkForgotten(await stored(page), when)
  console.log(`${when}: back to the sign-up page, saying why`)
}

// 1. On load
{
  const { page, close } = await open(stale({ screen: 'hub', done: [1], savedCompleted: 1 }))
  const restarted = await page.getByLabel('get started').waitFor({ timeout: 6000 }).then(() => true, () => false)
  if (!restarted) fail('on load: did not start over on the landing page')
  else {
    checkForgotten(await stored(page), 'on load')
    console.log('on load: started over on the landing page')
  }
  await close()
}

// 2. Choosing a match
{
  const { page, close } = await open(stale({ screen: 'choose', match: null }), { stillThereOnLoad: true })
  await page.getByRole('button', { name: 'Match A' }).last().click()
  await expectSignUpAgain(page, 'choosing a match')
  await close()
}

// 3. Saving a finished chat (Text Style A done, not yet confirmed by the server)
{
  const { page, close } = await open(stale({ screen: 'hub', done: [0], savedCompleted: 0 }), { stillThereOnLoad: true })
  await expectSignUpAgain(page, 'saving a finished chat')
  await close()
}

await browser.close()
console.log(process.exitCode ? 'SIGN-UP-GONE TEST FAILED' : 'SIGN-UP-GONE TEST PASSED')
