// Test-only stand-in for 'mysql2/promise': the study's two tables kept in
// memory, so the real API (server/index.js) runs on this computer without
// MySQL. It knows exactly the SQL the server sends and refuses anything else,
// so a new query fails loudly here instead of passing untested.
// Loaded by register.mjs (the "api-memory" launch configuration). The data is
// gone when the server stops. Never on the live server (deploy/ doesn't ship tools/).

const participants = [] // rows as MySQL returns them (DATE as text, DATETIME as Date)
const adminSessions = new Map() // token_hash -> expiry time (ms)
let nextId = 1

const now = () => new Date(Math.floor(Date.now() / 1000) * 1000) // DATETIME keeps whole seconds
const byId = (id) => participants.find((r) => r.id === Number(id))
const changed = (n) => [{ affectedRows: n, changedRows: n, insertId: 0 }, undefined]
const touch = (row, patch) => Object.assign(row, patch, { last_seen_at: now() }) // ON UPDATE CURRENT_TIMESTAMP

const PROGRESS_SQL = 'UPDATE participants SET done_order = ?, completed = ?, finished_at = IF(? >= 3 AND finished_at IS NULL, '
  + 'UTC_TIMESTAMP(), finished_at) WHERE id = ? AND CHAR_LENGTH(?) > CHAR_LENGTH(COALESCE(done_order, \'\')) '
  + 'AND LEFT(?, CHAR_LENGTH(COALESCE(done_order, \'\'))) = COALESCE(done_order, \'\')'

function run(sql, p = []) {
  const q = sql.replace(/\s+/g, ' ').trim()
  let m

  if (q === 'SELECT 1') return [[{ 1: 1 }], []]

  // ---- participants ----
  if (q === 'INSERT INTO participants (token_hash, first_name, birth_date, age, bio, is_test) VALUES (?, ?, ?, ?, ?, ?)') {
    const [token_hash, first_name, birth_date, age, bio, is_test] = p
    if (participants.some((r) => r.token_hash === token_hash)) throw Object.assign(new Error('Duplicate token_hash'), { code: 'ER_DUP_ENTRY' })
    const t = now()
    const row = {
      id: nextId++, code: null, token_hash, first_name, birth_date, age, bio, match_letter: null, completed: 0,
      done_order: null, is_test: is_test ? 1 : 0, signed_up_at: t, matched_at: null, finished_at: null, last_seen_at: t,
    }
    participants.push(row)
    return [{ affectedRows: 1, insertId: row.id }, undefined]
  }
  if (q === 'UPDATE participants SET code = ? WHERE id = ?') {
    const row = byId(p[1])
    if (row) touch(row, { code: p[0] })
    return changed(row ? 1 : 0)
  }
  if (q === 'SELECT * FROM participants WHERE token_hash = ?') {
    return [participants.filter((r) => r.token_hash === p[0]).map((r) => ({ ...r })), []]
  }
  if (q === 'UPDATE participants SET match_letter = ?, matched_at = UTC_TIMESTAMP() WHERE id = ? AND match_letter IS NULL') {
    const row = byId(p[1])
    const ok = Boolean(row) && row.match_letter === null
    if (ok) touch(row, { match_letter: p[0], matched_at: now() })
    return changed(ok ? 1 : 0)
  }
  if (q === 'SELECT match_letter FROM participants WHERE id = ?') {
    const row = byId(p[0])
    return [row ? [{ match_letter: row.match_letter }] : [], []]
  }
  if (q === PROGRESS_SQL) {
    // Only ever extends the stored order, as the SQL does.
    const [done, completed, count, id] = p
    const row = byId(id)
    const stored = row?.done_order ?? ''
    const ok = Boolean(row) && done.length > stored.length && done.startsWith(stored)
    if (ok) touch(row, { done_order: done, completed, finished_at: count >= 3 && !row.finished_at ? now() : row.finished_at })
    return changed(ok ? 1 : 0)
  }
  if ((m = /^SELECT ([a-z_, ]+) FROM participants ORDER BY id( DESC)?$/.exec(q))) {
    const cols = m[1].split(', ')
    const rows = participants.map((r) => Object.fromEntries(cols.map((c) => [c, r[c]])))
    return [m[2] ? rows.reverse() : rows, []]
  }
  if (q === 'UPDATE participants SET is_test = ? WHERE id = ?') {
    const row = byId(p[1])
    if (row) touch(row, { is_test: p[0] ? 1 : 0 })
    return changed(row ? 1 : 0)
  }
  if (q === 'DELETE FROM participants WHERE id = ? AND is_test = 1') {
    const i = participants.findIndex((r) => r.id === Number(p[0]) && r.is_test === 1)
    if (i >= 0) participants.splice(i, 1)
    return changed(i >= 0 ? 1 : 0)
  }

  // ---- admin sessions ----
  if (q === 'SELECT 1 FROM admin_sessions WHERE token_hash = ? AND expires_at > UTC_TIMESTAMP()') {
    return [adminSessions.get(p[0]) > Date.now() ? [{ 1: 1 }] : [], []]
  }
  if (q === 'DELETE FROM admin_sessions WHERE expires_at < UTC_TIMESTAMP()') {
    let n = 0
    for (const [k, until] of adminSessions) if (until < Date.now()) n += adminSessions.delete(k) ? 1 : 0
    return changed(n)
  }
  if (q === 'INSERT INTO admin_sessions (token_hash, expires_at) VALUES (?, UTC_TIMESTAMP() + INTERVAL ? HOUR)') {
    adminSessions.set(p[0], Date.now() + p[1] * 3600 * 1000)
    return [{ affectedRows: 1, insertId: 0 }, undefined]
  }
  if (q === 'DELETE FROM admin_sessions WHERE token_hash = ?') {
    return changed(adminSessions.delete(p[0]) ? 1 : 0)
  }

  throw new Error(`memory-db doesn't know this SQL (add it to tools/memory-db/mysql2.mjs): ${q}`)
}

export function createPool() {
  const call = async (sql, params) => run(sql, params)
  return {
    execute: call,
    query: call,
    pool: { on() {} }, // no real connections, so nothing to set up per connection
    end: async () => {},
  }
}

export default { createPool }
