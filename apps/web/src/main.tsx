import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles/index.css'

const PrototypeApp = lazy(() => import('./prototype/PrototypeApp'))
const V4Workbench = lazy(() => import('./pages/V4Workbench'))
const view = new URLSearchParams(window.location.search).get('view')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {view === 'prototype'
      ? <Suspense fallback={null}><PrototypeApp /></Suspense>
      : view === 'v4'
        ? <Suspense fallback={null}><V4Workbench /></Suspense>
        : <App />}
  </StrictMode>,
)
