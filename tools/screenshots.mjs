// Screenshot every preview state at the design size (1440x1024), for comparing
// against the PDF with tools/compare.py. Needs the dev server running.
//   node tools/screenshots.mjs <out-dir> [base-url] [width] [height]
import { chromium } from 'playwright-core'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const out = process.argv[2] ?? 'shots'
const base = process.argv[3] ?? 'http://localhost:5173'
const width = Number(process.argv[4] ?? 1440)
const height = Number(process.argv[5] ?? 1024)
const states = [
  'landing', 'terms', 'signup', 'swipe', 'found', 'choose', 'itsamatch-a', 'itsamatch-b',
  'hub-a', 'hub-b', 'hub-progress', 'chat-p9', 'chat-p10', 'done', 'logout',
]

const browsers = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
]
const executablePath = browsers.find(existsSync)
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ executablePath })
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
for (const s of states) {
  await page.goto(`${base}/?preview=${s}`, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(700) // let entrance animations settle
  await page.screenshot({ path: join(out, `${s}.png`) })
  console.log('shot', s)
}
await browser.close()
