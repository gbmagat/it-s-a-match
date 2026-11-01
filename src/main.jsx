import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/dm-sans/400.css'
import '@fontsource/dm-sans/700.css'
import '@fontsource/dm-sans/700-italic.css'
import '@fontsource-variable/fraunces/full-italic.css'
import '@fontsource/montserrat/700.css'
import './styles.css'
import './mobile.css'
import App from './App.jsx'

// /admin is the researchers' panel; everything else is the participant site.
const Admin = lazy(() => import('./admin/Admin.jsx'))
const isAdmin = /^\/admin\/?$/.test(window.location.pathname)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isAdmin ? (
      <Suspense fallback={null}>
        <Admin />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
)
