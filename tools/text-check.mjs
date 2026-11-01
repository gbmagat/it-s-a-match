// Lists the words each screen shows as real text (SVG <text> + HTML), on
// desktop and phone, to confirm no words are baked into images.
//   node tools/text-check.mjs [base-url]
import { chromium } from 'playwright-core'
import { existsSync } from 'node:fs'

const base = process.argv[2] ?? 'http://localhost:5173'
const states = ['landing', 'terms', 'signup', 'swipe', 'found', 'choose', 'itsamatch-a', 'itsamatch-b', 'hub-a', 'hub-b', 'chat-p10', 'done']
const executablePath = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync)
const browser = await chromium.launch({ executablePath })
for (const [label, viewport] of [['desktop', { width: 1440, height: 1024 }], ['phone', { width: 390, height: 844 }]]) {
  const page = await browser.newPage({ viewport })
  console.log(`=== ${label}`)
  for (const s of states) {
    await page.goto(`${base}/?preview=${s}`, { waitUntil: 'networkidle' })
    const words = await page.evaluate(() => {
      const seen = new Set()
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      while (walker.nextNode()) {
        const t = walker.currentNode.textContent.replace(/\s+/g, ' ').trim()
        const el = walker.currentNode.parentElement
        if (t && el && !el.closest('script,style') && el.getClientRects().length) seen.add(t)
      }
      return [...seen]
    })
    console.log(`${s.padEnd(12)} ${words.join(' | ')}`)
  }
  await page.close()
}
await browser.close()
