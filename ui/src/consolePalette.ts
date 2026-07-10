import { useTheme } from '@mui/material/styles'

/** The console's terminal palette, previously hardcoded dark-only in
 *  ClaudeConsole.tsx. Two fixed palettes picked by the HOST theme's
 *  palette.mode (the host theme arrives via the ClaudeConsoleProps
 *  theme prop and is re-applied by dashboards.tsx's ThemeProvider).
 *
 *  The gray ladder inverts direction between modes: "dim" means darker
 *  in dark mode but LIGHTER in light mode — always toward the canvas.
 *  Accents keep their hue and shift luminance for contrast. */

export type LogKind =
  | 'prompt'
  | 'reply'
  | 'transcript_user'
  | 'transcript_asst'
  | 'tool'
  | 'extool'
  | 'mode'
  | 'system'
  | 'announce'

export type Engine = 'none' | 'ollama' | 'cloud' | 'external'

export interface ConsolePalette {
  /** Console body / strip backgrounds + hairline borders. */
  bg: string
  strip: string
  border: string
  /** Gray ladder, dimmest to brightest (relative to the canvas). */
  dim: string
  faint: string
  muted: string
  mid: string
  text: string
  input: string
  /** Cyan identity accent (prompts, caret, active dots) + its soft
   *  variant (replies, progress bars). */
  accent: string
  accentSoft: string
  /** Timer urgency / offline. */
  rose: string
  amber: string
  kinds: Record<LogKind, string>
  engine: Record<Engine, string>
}

const DARK: ConsolePalette = {
  bg: '#0a0d11',
  strip: '#080a0e',
  border: '#1f2937',
  dim: '#1f2937',
  faint: '#374151',
  muted: '#4b5563',
  mid: '#6b7280',
  text: '#9ca3af',
  input: '#e5e7eb',
  accent: '#00d9ff',
  accentSoft: '#7ee8ff',
  rose: '#fb7185',
  amber: '#fbbf24',
  kinds: {
    prompt: '#00d9ff',
    reply: '#7ee8ff',
    transcript_user: '#9aa3b2',
    transcript_asst: '#fde68a',
    tool: '#e8c07d',
    extool: '#f472b6',
    mode: '#4b5563',
    system: '#6ee7b7',
    announce: '#a78bfa',
  },
  engine: {
    none: '#4b5563',
    ollama: '#4b5563',
    cloud: '#4b5563',
    external: '#00d9ff',
  },
}

const LIGHT: ConsolePalette = {
  bg: '#ffffff',
  strip: '#f4f4f5',
  border: '#e4e4e7',
  dim: '#d4d4d8',
  faint: '#a1a1aa',
  muted: '#8a919c',
  mid: '#71717a',
  text: '#52525b',
  input: '#18181b',
  accent: '#0891b2',
  accentSoft: '#2a8aa8',
  rose: '#c85c6c',
  amber: '#b8862e',
  kinds: {
    prompt: '#0891b2',
    reply: '#2a8aa8',
    transcript_user: '#64748b',
    transcript_asst: '#b45309',
    tool: '#a16207',
    extool: '#ad4a91',
    mode: '#a1a1aa',
    system: '#358a67',
    announce: '#7c5fd3',
  },
  engine: {
    none: '#8a919c',
    ollama: '#8a919c',
    cloud: '#8a919c',
    external: '#0891b2',
  },
}

export function useConsolePalette(): ConsolePalette {
  return useTheme().palette.mode === 'light' ? LIGHT : DARK
}
