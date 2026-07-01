// Standalone SPA entry — used by `npm run dev` for isolated visual dev.
// In this mode the page IS the console, with no JarvYZ host: the WS bus is
// empty and core's /api/* endpoints aren't reachable, so panels render idle /
// empty. This just proves the bundle mounts + lays out; the console's real home
// is the JarvYZ dashboard (variant 8).

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material'
import { ClaudeConsole } from './dashboards'
import type { WSApi } from './lib/ws'

const NO_WS: WSApi = { send: () => {}, subscribe: () => () => {}, isConnected: false }

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#c9a227' },
    background: { default: '#04060e', paper: '#0b0f1a' },
  },
})

function StandaloneRoot() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <div style={{ height: '100dvh', boxSizing: 'border-box' }}>
        <ClaudeConsole theme={theme} wsApi={NO_WS} capabilities={{ apiBase: '', deployTarget: 'standalone' }} />
      </div>
    </ThemeProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StandaloneRoot />
  </StrictMode>,
)
