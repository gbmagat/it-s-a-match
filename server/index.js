// API server for the study site: saves sign-ups to MySQL, records each
// participant's match and the Text Styles they finished (in the order they
// chose), and serves the
// admin panel's data (one shared password). In production it also serves the
// built site from dist/.
//   npm run server     (development, restarts on changes)
//   npm start          (production, after npm run build)
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import express from 'express'
import mysql from 'mysql2/promise'

const env = process.env
const PORT = Number(env.PORT ?? 3001)
// Only reachable through the web server in front of it (nginx etc., which adds HTTPS).
const HOST = env.HOST ?? '127.0.0.1'
const ADMIN_PASSWORD = env.ADMIN_PASSWORD ?? ''
if (ADMIN_PASSWORD.length < 8) {
  console.error('Set ADMIN_PASSWORD (8+ characters) in .env')
  process.exit(1)
}

const pool = mysql.createPool({
  host: env.DB_HOST ?? '127.0.0.1',
  port: Number(env.DB_PORT ?? 3306),
  database: env.DB_NAME,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  connectionLimit: 10,
  timezone: 'Z',
  dateStrings: ['DATE'],
})
pool.pool.on('connection', (c) => c.query("SET time_zone = '+00:00'"))

// Text Style A, B, C (research paper, Table 1; same as src/session.js).
const STYLE = { A: 'formal', B: 'informal', C: 'colloquial' }
const LANGUAGE = { A: 'Filipino', B: 'English' }

const sha256 = (s) => createHash('sha256').update(s).digest('hex')
const app = express()
app.disable('x-powered-by')
// Behind a web server on the same machine: take the visitor's IP and https from
// its X-Forwarded-* headers (for the admin login limit and the Secure cookie).
app.set('trust proxy', env.TRUST_PROXY ?? 'loopback')
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'same-origin')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('X-Robots-Tag', 'noindex, nofollow') // a study site: keep it out of search results
  // API answers (participant and admin data) must never be kept by a cache, such
  // as a "cache everything" rule on the Cloudflare domain the site is published under.
  if (/^\/api(\/|$)/.test(req.path)) res.setHeader('Cache-Control', 'no-store')
  next()
})
// One address for the site: pages opened on www.itsamatch.online move on to
// itsamatch.online, because the browser keeps a participant's progress per
// address. API calls aren't moved, so a page already open on www keeps working.
// (The Host header, not req.hostname, which a visitor could set with X-Forwarded-Host.)
app.use((req, res, next) => {
  const host = String(req.headers.host ?? '').toLowerCase()
  if (host.startsWith('www.') && (req.method === 'GET' || req.method === 'HEAD') && !/^\/api(\/|$)/.test(req.path)) {
    return res.redirect(301, `https://${host.slice(4)}${req.originalUrl}`)
  }
  next()
})
app.use(express.json({ limit: '20kb' }))

class BadRequest extends Error {}
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next)

// ---------------- Participants ----------------

function validSignup(b) {
  const firstName = String(b.firstName ?? '').trim()
  const bio = String(b.bio ?? '').trim()
  const age = Number(b.age)
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(b.birthDate ?? ''))
  if (!firstName || firstName.length > 60) throw new BadRequest('first name')
  if (!bio || bio.length > 400) throw new BadRequest('bio')
  if (!Number.isInteger(age) || age < 18 || age > 120) throw new BadRequest('age')
  if (!m) throw new BadRequest('birth date')
  const [mm, dd, yyyy] = [+m[1], +m[2], +m[3]]
  const d = new Date(Date.UTC(yyyy, mm - 1, dd))
  if (d.getUTCMonth() !== mm - 1 || d.getUTCDate() !== dd || yyyy < 1900 || d > new Date()) throw new BadRequest('birth date')
  // The age must match the birth date (the site works it out on the
  // participant's own date, which can be a day either side of the server's).
  const ageAt = (t) => t.getUTCFullYear() - yyyy - (t.getUTCMonth() + 1 < mm || (t.getUTCMonth() + 1 === mm && t.getUTCDate() < dd) ? 1 : 0)
  if (![-1, 0, 1].some((days) => ageAt(new Date(Date.now() + days * 86400000)) === age)) throw new BadRequest('age')
  return { firstName, bio, age, birthDate: `${yyyy}-${m[1]}-${m[2]}`, test: Boolean(b.test) }
}

app.post('/api/signup', wrap(async (req, res) => {
  const p = validSignup(req.body ?? {})
  const token = randomBytes(32).toString('hex')
  const [r] = await pool.execute(
    'INSERT INTO participants (token_hash, first_name, birth_date, age, bio, is_test) VALUES (?, ?, ?, ?, ?, ?)',
    [sha256(token), p.firstName, p.birthDate, p.age, p.bio, p.test ? 1 : 0],
  )
  const code = `P-${String(r.insertId).padStart(3, '0')}`
  await pool.execute('UPDATE participants SET code = ? WHERE id = ?', [code, r.insertId])
  res.json({ token, code })
}))

// The participant's browser proves who it is with the token from sign-up.
async function participant(req) {
  const token = String(req.get('x-participant') ?? '')
  if (!/^[0-9a-f]{64}$/.test(token)) return null
  const [rows] = await pool.execute('SELECT * FROM participants WHERE token_hash = ?', [sha256(token)])
  return rows[0] ?? null
}

// Whether this browser's sign-up still exists (a test entry can be deleted,
// or the table emptied before real data); the site starts over if not.
app.get('/api/me', wrap(async (req, res) => {
  if (!(await participant(req))) return res.status(401).json({ error: 'Unknown participant.' })
  res.json({ ok: true })
}))

// Match A or B, as the researcher told the participant. Set once.
app.post('/api/match', wrap(async (req, res) => {
  const me = await participant(req)
  if (!me) return res.status(401).json({ error: 'Unknown participant.' })
  if (me.match_letter) return res.json({ match: me.match_letter })
  const match = req.body?.match
  if (match !== 'A' && match !== 'B') throw new BadRequest('match')
  await pool.execute('UPDATE participants SET match_letter = ?, matched_at = UTC_TIMESTAMP() WHERE id = ? AND match_letter IS NULL', [match, me.id])
  const [[row]] = await pool.execute('SELECT match_letter FROM participants WHERE id = ?', [me.id])
  res.json({ match: row.match_letter })
}))

// The Text Styles finished, in the order done ('B', then 'BA', then 'BAC').
// Only ever extends what's stored, so a late or repeated request can't undo it.
app.post('/api/progress', wrap(async (req, res) => {
  const me = await participant(req)
  if (!me) return res.status(401).json({ error: 'Unknown participant.' })
  const done = String(req.body?.done ?? '')
  if (!/^[ABC]{1,3}$/.test(done) || new Set(done).size !== done.length) throw new BadRequest('done')
  await pool.execute(
    `UPDATE participants
        SET done_order = ?, completed = ?, finished_at = IF(? >= 3 AND finished_at IS NULL, UTC_TIMESTAMP(), finished_at)
      WHERE id = ? AND CHAR_LENGTH(?) > CHAR_LENGTH(COALESCE(done_order, ''))
        AND LEFT(?, CHAR_LENGTH(COALESCE(done_order, ''))) = COALESCE(done_order, '')`,
    [done, done.length, done.length, me.id, done, done],
  )
  res.json({ ok: true })
}))

app.get('/api/health', wrap(async (req, res) => {
  await pool.query('SELECT 1')
  res.json({ ok: true })
}))

// ---------------- Admin (one shared password) ----------------

const SESSION_HOURS = 12
const failures = new Map() // ip -> { n, until }

function cookie(req, name) {
  for (const part of String(req.headers.cookie ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return decodeURIComponent(v.join('='))
  }
  return null
}

async function isAdmin(req) {
  const token = cookie(req, 'admin')
  if (!token) return false
  const [rows] = await pool.execute('SELECT 1 FROM admin_sessions WHERE token_hash = ? AND expires_at > UTC_TIMESTAMP()', [sha256(token)])
  return rows.length > 0
}

const admin = (fn) => wrap(async (req, res, next) => {
  if (!(await isAdmin(req))) return res.status(401).json({ error: 'Please log in first.' })
  return fn(req, res, next)
})

app.post('/api/admin/login', wrap(async (req, res) => {
  const ip = req.ip
  const f = failures.get(ip)
  if (f && f.n >= 8 && f.until > Date.now()) return res.status(429).json({ error: 'Too many tries. Please wait a few minutes.' })
  const given = createHash('sha256').update(String(req.body?.password ?? '')).digest()
  const real = createHash('sha256').update(ADMIN_PASSWORD).digest()
  if (!timingSafeEqual(given, real)) {
    failures.set(ip, { n: (f && f.until > Date.now() ? f.n : 0) + 1, until: Date.now() + 15 * 60 * 1000 })
    return res.status(401).json({ error: 'Wrong password.' })
  }
  failures.delete(ip)
  const token = randomBytes(32).toString('hex')
  await pool.execute('DELETE FROM admin_sessions WHERE expires_at < UTC_TIMESTAMP()')
  await pool.execute('INSERT INTO admin_sessions (token_hash, expires_at) VALUES (?, UTC_TIMESTAMP() + INTERVAL ? HOUR)', [sha256(token), SESSION_HOURS])
  const secure = req.secure ? '; Secure' : ''
  res.setHeader('Set-Cookie', `admin=${token}; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=${SESSION_HOURS * 3600}${secure}`)
  res.json({ ok: true })
}))

app.post('/api/admin/logout', wrap(async (req, res) => {
  const token = cookie(req, 'admin')
  if (token) await pool.execute('DELETE FROM admin_sessions WHERE token_hash = ?', [sha256(token)])
  res.setHeader('Set-Cookie', 'admin=; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=0')
  res.json({ ok: true })
}))

app.get('/api/admin/me', admin(async (req, res) => res.json({ ok: true })))

const COLUMNS = 'id, code, first_name, birth_date, age, bio, match_letter, done_order, completed, is_test, signed_up_at, matched_at, finished_at, last_seen_at'

function describe(row) {
  const order = row.done_order ?? ''
  return {
    ...row,
    is_test: Boolean(row.is_test),
    language: row.match_letter ? LANGUAGE[row.match_letter] : null,
    order_done: [...order].join(' > ') || null, // e.g. 'B > A > C'
    style_1: STYLE[order[0]] ?? null, // the style done first, second, third
    style_2: STYLE[order[1]] ?? null,
    style_3: STYLE[order[2]] ?? null,
    status: row.completed >= 3 ? 'Finished' : row.match_letter ? `Chatting (${row.completed}/3 done)` : 'Signed up',
  }
}

app.get('/api/admin/participants', admin(async (req, res) => {
  const [rows] = await pool.query(`SELECT ${COLUMNS} FROM participants ORDER BY id DESC`)
  res.json({ participants: rows.map(describe) })
}))

const CSV_FIELDS = ['code', 'first_name', 'birth_date', 'age', 'bio', 'match_letter', 'language', 'order_done', 'style_1',
  'style_2', 'style_3', 'completed', 'status', 'is_test', 'signed_up_at', 'matched_at', 'finished_at']

function csvCell(v) {
  if (v === null || v === undefined) return ''
  let s = v instanceof Date ? v.toISOString() : String(v)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}` // keep spreadsheets from running it as a formula
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

app.get('/api/admin/participants.csv', admin(async (req, res) => {
  const [rows] = await pool.query(`SELECT ${COLUMNS} FROM participants ORDER BY id`)
  const lines = [CSV_FIELDS.join(','), ...rows.map(describe).map((r) => CSV_FIELDS.map((f) => csvCell(r[f])).join(','))]
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="participants-${new Date().toISOString().slice(0, 10)}.csv"`)
  res.send('﻿' + lines.join('\r\n'))
}))

app.patch('/api/admin/participants/:id', admin(async (req, res) => {
  if (typeof req.body?.is_test !== 'boolean') throw new BadRequest('is_test')
  await pool.execute('UPDATE participants SET is_test = ? WHERE id = ?', [req.body.is_test ? 1 : 0, Number(req.params.id)])
  res.json({ ok: true })
}))

// Only rows marked as test can be deleted (real data is never removed by accident).
app.delete('/api/admin/participants/:id', admin(async (req, res) => {
  const [r] = await pool.execute('DELETE FROM participants WHERE id = ? AND is_test = 1', [Number(req.params.id)])
  if (!r.affectedRows) return res.status(409).json({ error: 'Only test entries can be deleted.' })
  res.json({ ok: true })
}))

// ---------------- Errors + the built site ----------------

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }))
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  if (err instanceof BadRequest) return res.status(400).json({ error: `Please check your ${err.message}.` })
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Bad request.' })
  console.error(err)
  res.status(500).json({ error: 'Server error. Please try again.' })
})

const dist = fileURLToPath(new URL('../dist/', import.meta.url))
if (existsSync(dist)) {
  app.use(express.static(dist))
  app.use((req, res, next) => (req.method === 'GET' ? res.sendFile('index.html', { root: dist }) : next()))
}

app.listen(PORT, HOST, () => console.log(`API server on http://${HOST}:${PORT}`))
