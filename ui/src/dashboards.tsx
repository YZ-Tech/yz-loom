// Dashboard-variant wrapper for the Loom console.
//
// Shipped as a react-dynamic-module IIFE export (`window.YzLoom.ClaudeConsole`)
// loaded by JarvYZ's SatelliteDashboardLoader (variant 8), and rendered by the
// standalone SPA (src/App.tsx). The host passes the conventional satellite-UI
// prop shape: `theme` / `wsApi` / `api` / `capabilities`.
//
// React context can't cross the IIFE bundle boundary by identity, so the
// host's theme + WS values arrive as PROPS; we re-establish module-local
// providers here (the same pattern as yz-orbs / yz-head). The console reads the
// WS bus (transcript, mode, timers, wled, llm-mode, announce, tool events) and
// fetches core's own /api/* endpoints directly (same-origin when embedded), so
// there's no store or api adapter to thread through.

import { ThemeProvider, type Theme } from '@mui/material/styles'
import { WSContext, type WSApi } from './lib/ws'
import { ClaudeConsoleView } from './ClaudeConsole'

export interface ClaudeConsoleProps {
  /** MUI theme from the host (`useTheme()`), re-applied via our own
   *  ThemeProvider so MUI components inside the IIFE pick it up. */
  theme: Theme
  /** WS bridge from the host — drives transcript / mode / timers / wled /
   *  llm-mode / announce / tool-call events. */
  wsApi: WSApi
  /** Present for prop-shape parity; the console reads core /api/* directly. */
  api?: unknown
  capabilities?: unknown
}

/** Dashboard variant 8 — the Loom console. */
export function ClaudeConsole({ theme, wsApi }: ClaudeConsoleProps) {
  return (
    <ThemeProvider theme={theme}>
      <WSContext.Provider value={wsApi}>
        <ClaudeConsoleView />
      </WSContext.Provider>
    </ThemeProvider>
  )
}
