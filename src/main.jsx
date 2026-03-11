import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Lock to landscape for cycling game — works on Android PWA and Chrome
if (screen.orientation?.lock) {
  screen.orientation.lock('landscape').catch(() => {})
}

createRoot(document.getElementById('root')).render(
    <StrictMode>
        <App />
    </StrictMode>,
)
