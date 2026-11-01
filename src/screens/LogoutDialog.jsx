import { useEffect, useRef } from 'react'

// Asked before logging out (user request 2026-10-25). Participants have no
// password, so logging out ends their session on this device for good.
// Not in the PDF; styled like the site's white boxes. "Stay" has the focus;
// Escape or a click outside the box also means stay.
export function LogoutDialog({ onStay, onLogout }) {
  const box = useRef(null)
  const stay = useRef(null)
  const onStayRef = useRef(onStay)
  onStayRef.current = onStay

  useEffect(() => {
    const before = document.activeElement
    stay.current?.focus()
    const key = (e) => {
      if (e.key === 'Escape') onStayRef.current()
      if (e.key === 'Tab') {
        // Keep the focus on the two buttons while the box is open.
        const buttons = [...box.current.querySelectorAll('button')]
        const i = buttons.indexOf(document.activeElement)
        e.preventDefault()
        buttons[(i + (e.shiftKey ? buttons.length - 1 : 1)) % buttons.length].focus()
      }
    }
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('keydown', key)
      before?.focus?.()
    }
  }, [])

  return (
    <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onStay()}>
      <div ref={box} className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="logout-title" aria-describedby="logout-text">
        <h2 id="logout-title" className="dialog-title"><span className="grad-text">Log out?</span></h2>
        <p id="logout-text" className="dialog-text">
          Your finished chats are saved, but you won’t be able to continue where you left off. Only log out if your
          researcher asks you to.
        </p>
        <div className="dialog-actions">
          <button ref={stay} type="button" className="dialog-btn" onClick={onStay}>Stay</button>
          <button type="button" className="dialog-btn dialog-btn-go" onClick={onLogout}>Log out</button>
        </div>
      </div>
    </div>
  )
}
