import { useCallback, useEffect, useMemo, useState } from 'react'
import manifest from '../assets-manifest.json'
import { adminDelete, adminLogin, adminLogout, adminMe, adminParticipants, adminSetTest } from '../api.js'
import './admin.css'

// Admin panel at /admin: one shared password (ADMIN_PASSWORD in .env).
// Shows everyone who signed up, how far they got, and the order in which they
// chose to do the Text Styles. Not in the PDF; styled after the site.

// Every order a participant can choose (A = formal, B = informal, C = colloquial).
const ORDERS = ['ABC', 'ACB', 'BAC', 'BCA', 'CAB', 'CBA']

const fmtDate = (iso) => {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}
const fmtTime = (iso) =>
  iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'

function Header({ onLogout }) {
  return (
    <header className="panel-header" style={{ backgroundImage: `url(${manifest.plates['header-bar']})` }}>
      <div className="panel-brand">
        <img src={manifest.layers.logo.src} alt="" />
        <span>it’s a match</span>
        <em>Admin</em>
      </div>
      {onLogout && (
        <button type="button" className="panel-link" onClick={onLogout}>Log out</button>
      )}
    </header>
  )
}

function Login({ onDone }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await adminLogin(password)
      onDone()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }
  return (
    <div className="panel-login-wrap">
      <form className="panel-login" onSubmit={submit}>
        <h1>Admin</h1>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus autoComplete="current-password" />
        </label>
        <button type="submit" disabled={busy || !password}>{busy ? 'Checking…' : 'Log in'}</button>
        <p className="panel-error" role="alert">{error}</p>
      </form>
    </div>
  )
}

// Which order participants chose, among real participants who finished.
function Orders({ rows }) {
  const real = rows.filter((r) => !r.is_test && r.done_order?.length === 3)
  const count = (m, o) => real.filter((r) => r.match_letter === m && r.done_order === o).length
  return (
    <section className="panel-card">
      <h2>Order chosen <small>Real participants who finished</small></h2>
      <div className="panel-scroll">
        <table className="panel-balance">
          <thead>
            <tr>
              <th />
              {ORDERS.map((o) => <th key={o}>{[...o].join(' → ')}</th>)}
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {[['A', 'Filipino'], ['B', 'English']].map(([m, lang]) => {
              const cells = ORDERS.map((o) => count(m, o))
              return (
                <tr key={m}>
                  <th>Match {m}<span>{lang}</span></th>
                  {cells.map((n, i) => <td key={i}>{n}</td>)}
                  <td className="panel-total">{cells.reduce((a, b) => a + b, 0)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="panel-note">Text Style A = formal, B = informal, C = colloquial. Participants open them in any order.</p>
    </section>
  )
}

function Stats({ rows }) {
  const real = rows.filter((r) => !r.is_test)
  const items = [
    ['Signed up', real.length],
    ['Finished', real.filter((r) => r.completed >= 3).length],
    ['In progress', real.filter((r) => r.match_letter && r.completed < 3).length],
    ['No match yet', real.filter((r) => !r.match_letter).length],
    ['Test entries', rows.length - real.length],
  ]
  return (
    <section className="panel-stats">
      {items.map(([label, n]) => (
        <div key={label} className="panel-stat">
          <strong>{n}</strong>
          <span>{label}</span>
        </div>
      ))}
    </section>
  )
}

function Participants({ rows, onChanged }) {
  const [q, setQ] = useState('')
  const [show, setShow] = useState('real')
  const [match, setMatch] = useState('all')
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows.filter((r) =>
      (show === 'all' || (show === 'test') === r.is_test)
      && (match === 'all' || r.match_letter === match)
      && (!needle || [r.code, r.first_name, r.bio].some((v) => String(v ?? '').toLowerCase().includes(needle))))
  }, [rows, q, show, match])

  async function toggleTest(r) {
    await adminSetTest(r.id, !r.is_test)
    onChanged()
  }
  async function remove(r) {
    if (!window.confirm(`Delete test entry ${r.code} (${r.first_name})? This can't be undone.`)) return
    await adminDelete(r.id)
    onChanged()
  }

  return (
    <section className="panel-card">
      <div className="panel-toolbar">
        <h2>Participants <small>{list.length} shown</small></h2>
        <input type="search" placeholder="Search name, code or bio" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
        <select value={show} onChange={(e) => setShow(e.target.value)} aria-label="Which entries">
          <option value="real">Real participants</option>
          <option value="test">Test entries</option>
          <option value="all">Everyone</option>
        </select>
        <select value={match} onChange={(e) => setMatch(e.target.value)} aria-label="Match">
          <option value="all">Both matches</option>
          <option value="A">Match A (Filipino)</option>
          <option value="B">Match B (English)</option>
        </select>
      </div>
      <div className="panel-scroll">
        <table className="panel-table">
          <thead>
            <tr>
              <th>Code</th><th>First name</th><th>Age</th><th>Birth date</th><th>Bio</th><th>Match</th>
              <th>Order done</th><th>Progress</th><th>Signed up</th><th>Finished</th><th />
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && (
              <tr><td colSpan={11} className="panel-empty">No one here yet</td></tr>
            )}
            {list.map((r) => (
              <tr key={r.id} className={r.is_test ? 'is-test' : ''}>
                <td className="panel-code">{r.code}</td>
                <td>{r.first_name}</td>
                <td>{r.age}</td>
                <td className="panel-nowrap">{fmtDate(r.birth_date)}</td>
                <td className="panel-bio" title={r.bio}>{r.bio}</td>
                <td className="panel-nowrap">{r.match_letter ? `${r.match_letter} · ${r.language}` : '—'}</td>
                <td className="panel-nowrap" title={[r.style_1, r.style_2, r.style_3].filter(Boolean).join(' → ')}>
                  {r.order_done ? r.order_done.replaceAll(' > ', ' → ') : '—'}
                </td>
                <td>
                  <span className={`panel-chip ${r.completed >= 3 ? 'is-done' : r.match_letter ? 'is-going' : ''}`}>{r.status}</span>
                </td>
                <td className="panel-nowrap">{fmtTime(r.signed_up_at)}</td>
                <td className="panel-nowrap">{fmtTime(r.finished_at)}</td>
                <td className="panel-actions">
                  <button type="button" onClick={() => toggleTest(r)}>{r.is_test ? 'Mark as real' : 'Mark as test'}</button>
                  {r.is_test && <button type="button" className="panel-danger" onClick={() => remove(r)}>Delete</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default function Admin() {
  const [state, setState] = useState('checking') // checking | login | in
  const [data, setData] = useState({ participants: [] })
  const [error, setError] = useState('')
  const [updated, setUpdated] = useState(null)

  const load = useCallback(async () => {
    try {
      setData(await adminParticipants())
      setUpdated(new Date())
      setError('')
    } catch (err) {
      if (err.status === 401) setState('login')
      else setError(err.message)
    }
  }, [])

  useEffect(() => {
    document.title = 'it’s a match · admin'
    adminMe().then(() => setState('in'), () => setState('login'))
  }, [])

  // Live view: refresh every 10 seconds while open.
  useEffect(() => {
    if (state !== 'in') return
    load()
    const t = setInterval(load, 10000)
    return () => clearInterval(t)
  }, [state, load])

  async function logout() {
    await adminLogout().catch(() => {})
    setState('login')
  }

  return (
    <div className="admin" style={{ backgroundImage: `url(${manifest.plates['puzzle-tile']})` }}>
      <Header onLogout={state === 'in' ? logout : null} />
      {state === 'login' && <Login onDone={() => setState('in')} />}
      {state === 'in' && (
        <main className="panel-main">
          <div className="panel-top">
            <h1>Participants</h1>
            <div className="panel-top-actions">
              <span className="panel-updated">{updated ? `Updated ${updated.toLocaleTimeString()}` : 'Loading…'}</span>
              <button type="button" className="panel-btn-outline" onClick={load}>Refresh</button>
              <a className="panel-btn" href="/api/admin/participants.csv" download>Download CSV</a>
            </div>
          </div>
          {error && <p className="panel-error" role="alert">{error}</p>}
          <Stats rows={data.participants} />
          <Orders rows={data.participants} />
          <Participants rows={data.participants} onChanged={load} />
        </main>
      )}
    </div>
  )
}
