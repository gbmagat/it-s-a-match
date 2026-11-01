// Calls to the API server (server/index.js), which stores everything in MySQL.

async function call(method, path, body, token, { keepalive = false } = {}) {
  let res
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Participant': token } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
      keepalive, // finishes even if the page is closed right after
    })
  } catch {
    throw new Error('Can’t reach the server. Please try again.')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.error ?? 'Something went wrong. Please try again.')
    err.status = res.status
    throw err
  }
  return data
}

// Participant
export const signUp = (profile, test) => call('POST', '/signup', { ...profile, test })
export const chooseMatch = (token, match) => call('POST', '/match', { match }, token)
export const saveProgress = (token, done) => call('POST', '/progress', { done }, token, { keepalive: true })
export const checkSignUp = (token) => call('GET', '/me', undefined, token) // 401 if the server no longer has it

// Admin
export const adminMe = () => call('GET', '/admin/me')
export const adminLogin = (password) => call('POST', '/admin/login', { password })
export const adminLogout = () => call('POST', '/admin/logout')
export const adminParticipants = () => call('GET', '/admin/participants')
export const adminSetTest = (id, isTest) => call('PATCH', `/admin/participants/${id}`, { is_test: isTest })
export const adminDelete = (id) => call('DELETE', `/admin/participants/${id}`)
