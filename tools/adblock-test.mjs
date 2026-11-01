// Checks that ad blockers hide nothing on the site. It loads each page, turns
// on every page-wide hiding rule from EasyList and AdGuard Base (the lists
// behind uBlock Origin, AdBlock, Adblock Plus and AdGuard), and lists anything
// that was visible before and isn't after. (2026-10-28: the admin page went
// blank after login because its classes were named .ad-header, .ad-main, ...)
//   node tools/adblock-test.mjs [base-url]
// Against the local test server (npm run build, then the api-memory server)
// it also logs in to /admin with the test password in tools/memory-db/memory.env.
// On the live site it checks the participant pages and the admin login page.
import { existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright-core'

const base = (process.argv[2] ?? 'http://localhost:3001').replace(/\/$/, '')
const LISTS = ['https://easylist.to/easylist/easylist.txt', 'https://filters.adtidy.org/extension/ublock/filters/2.txt']
const local = /^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(base)

const selectors = []
for (const url of LISTS) {
  const text = await (await fetch(url)).text()
  for (const line of text.split('\n')) if (line.startsWith('##') && line.length > 2) selectors.push(line.slice(2).trim())
}
console.log(`${selectors.length} hiding rules from ${LISTS.length} lists`)

const executablePath = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync)
const browser = await chromium.launch({ executablePath })
let failed = false

// Every element that is on screen now, as "tag.class" (or its text).
const visibleNow = (page) => page.evaluate(() => {
  const out = new Set()
  for (const el of document.body.querySelectorAll('*')) {
    if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue
    const r = el.getBoundingClientRect()
    if (r.width < 1 || r.height < 1) continue
    out.add(`${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''}`)
  }
  return [...out]
})

// Adds the rules the way a blocker does; a rule this browser can't read is skipped.
const block = (page) => page.evaluate((sels) => {
  const sheet = new CSSStyleSheet()
  for (const s of sels) { try { sheet.insertRule(`${s}{display:none!important}`, sheet.cssRules.length) } catch { /* not plain CSS */ } }
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet]
  return sheet.cssRules.length
}, selectors)

async function check(page, label) {
  const before = await visibleNow(page)
  const rules = await block(page)
  const after = new Set(await visibleNow(page))
  const hidden = before.filter((e) => !after.has(e))
  console.log(`${label}: ${before.length} kinds of visible parts, ${rules} rules on, ${hidden.length ? 'HIDDEN: ' + hidden.join(', ') : 'nothing hidden'}`)
  if (hidden.length) failed = true
}

for (const [path, label] of [['/', 'landing page'], ['/privacy', 'privacy policy']]) {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } })
  await page.goto(base + path)
  await page.waitForLoadState('networkidle')
  await check(page, label)
  await page.close()
}

{
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } })
  await page.goto(`${base}/admin`)
  await page.getByLabel('Password').waitFor()
  await check(page, 'admin login page')
  if (local) {
    const password = readFileSync(new URL('./memory-db/memory.env', import.meta.url), 'utf8').match(/^ADMIN_PASSWORD=(.*)$/m)[1].trim()
    await page.getByLabel('Password').fill(password)
    await page.getByRole('button', { name: 'Log in' }).click()
    const shown = await page.getByRole('heading', { name: 'Participants', level: 1 }).waitFor({ timeout: 6000 }).then(() => true, () => false)
    const inView = shown && await page.getByRole('heading', { name: 'Participants', level: 1 }).isVisible()
    console.log(`admin after login (rules still on): ${inView ? 'the panel is on screen' : 'NOT VISIBLE'}`)
    if (!inView) failed = true
    const shot = join(tmpdir(), 'adblock-test-admin.png')
    await page.screenshot({ path: shot })
    console.log(`  screenshot: ${shot}`)
  }
  await page.close()
}

await browser.close()
console.log(failed ? 'AD-BLOCK TEST FAILED' : 'AD-BLOCK TEST PASSED')
process.exitCode = failed ? 1 : 0
