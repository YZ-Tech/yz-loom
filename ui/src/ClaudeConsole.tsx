import { Box, Paper } from '@mui/material'
import { useEffect, useReducer, useRef, useState } from 'react'
import { useSubscription } from './lib/ws'

type LogKind = 'prompt' | 'reply' | 'transcript_user' | 'transcript_asst' | 'tool' | 'extool' | 'mode' | 'system' | 'announce'

interface LogEntry {
  id: number
  ts: number
  kind: LogKind
  text: string
  pid?: string
}

const MAX_LOG = 250
let _next = 1
const nid = () => _next++

function reduce(state: LogEntry[], a: LogEntry): LogEntry[] {
  return [...state, a].slice(-MAX_LOG)
}

const COLORS: Record<LogKind, string> = {
  prompt:          '#00d9ff',
  reply:           '#7ee8ff',
  transcript_user: '#9aa3b2',
  transcript_asst: '#fde68a',
  tool:            '#e8c07d',
  extool:          '#f472b6',
  mode:            '#4b5563',
  system:          '#6ee7b7',
  announce:        '#a78bfa',
}

const TAGS: Record<LogKind, string> = {
  prompt:          'PROMPT',
  reply:           'REPLY ',
  transcript_user: 'YOU   ',
  transcript_asst: 'JARVYZ',
  tool:            'TOOL  ',
  extool:          'EXTOOL',
  mode:            'MODE  ',
  system:          'SYS   ',
  announce:        'ANN   ',
}

function fmtTime(ts: number): string {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

const MONO = 'Consolas, "JetBrains Mono", Menlo, Monaco, "Courier New", monospace'

interface ActiveTimer {
  id: number
  label: string
  fires_at: number
  seconds: number
}

const BAR_WIDTH = 18

function fmtMS(seconds: number): string {
  const r = Math.max(0, Math.round(seconds))
  const m = Math.floor(r / 60)
  const s = r % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

/** Inline two-tone bar with CSS-equal heights — unicode block chars (█ vs ░)
 *  render at different visual heights in most monospace fonts. This is a
 *  fixed-character-width inline-block painted with a hard-stop gradient so
 *  both halves are pixel-equal. */
function Bar({
  pct,
  width,
  active,
  inactive,
}: {
  pct: number
  width: number
  active: string
  inactive: string
}) {
  const p = Math.max(0, Math.min(100, pct))
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-block',
        width: `${width}ch`,
        height: '0.62em',
        verticalAlign: 'middle',
        background: `linear-gradient(to right, ${active} 0%, ${active} ${p}%, ${inactive} ${p}%, ${inactive} 100%)`,
      }}
    />
  )
}

function TimerRow({ timer }: { timer: ActiveTimer }) {
  const barRef = useRef<HTMLSpanElement | null>(null)
  const countRef = useRef<HTMLSpanElement | null>(null)
  const rowRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const update = () => {
      const remaining = timer.fires_at - Date.now() / 1000
      const total = timer.seconds || 1
      const elapsed = Math.max(0, Math.min(total, total - remaining))
      const pct = Math.max(0, Math.min(100, (elapsed / total) * 100))
      const active = remaining <= 5 ? '#fb7185' : remaining <= 15 ? '#fbbf24' : '#7ee8ff'
      if (barRef.current) {
        barRef.current.style.background = `linear-gradient(to right, ${active} 0%, ${active} ${pct}%, #1f2937 ${pct}%, #1f2937 100%)`
      }
      if (countRef.current) countRef.current.textContent = `${fmtMS(remaining)} / ${fmtMS(total)}`
      if (rowRef.current) rowRef.current.style.color = active
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [timer.fires_at, timer.seconds])

  const id = `#${timer.id}`.padEnd(4)
  const label = (timer.label || '').padEnd(10).slice(0, 10)

  return (
    <Box ref={rowRef} sx={{ display: 'flex', gap: 1.5, color: '#7ee8ff', alignItems: 'center' }}>
      <Box sx={{ color: '#4b5563', flexShrink: 0 }}>{id}</Box>
      <Box sx={{ color: '#9ca3af', flexShrink: 0 }}>{label}</Box>
      <Box
        component="span"
        ref={barRef}
        sx={{
          display: 'inline-block',
          width: `${BAR_WIDTH}ch`,
          height: '0.62em',
          flexShrink: 0,
        }}
      />
      <Box component="span" ref={countRef} sx={{ flexShrink: 0, color: '#9ca3af' }} />
    </Box>
  )
}

interface WLEDDevice {
  alias: string
  host: string
  enabled: boolean
  state: { on: boolean; bri: number; color: [number, number, number]; fx?: number } | null
  reachable: boolean
}

const BRI_WIDTH = 10

function toHex(c: [number, number, number]): string {
  const h = (n: number) => n.toString(16).padStart(2, '0').toUpperCase()
  return `#${h(c[0])}${h(c[1])}${h(c[2])}`
}

function WLEDRow({ device }: { device: WLEDDevice }) {
  const { alias, state, reachable, enabled } = device

  if (!enabled) return null

  const alias10 = alias.padEnd(10).slice(0, 10)

  if (!reachable || !state) {
    return (
      <Box sx={{ display: 'flex', gap: 1.5 }}>
        <Box sx={{ color: '#fb7185', flexShrink: 0, width: '1ch' }}>?</Box>
        <Box sx={{ color: '#9ca3af', flexShrink: 0 }}>{alias10}</Box>
        <Box sx={{ color: '#4b5563' }}>— offline</Box>
      </Box>
    )
  }

  const { on, bri, color } = state
  const pct = Math.round((bri / 255) * 100)
  const hex = toHex(color)
  const dotColor = on ? '#00d9ff' : '#4b5563'
  const swatchColor = on ? `rgb(${color[0]}, ${color[1]}, ${color[2]})` : '#4b5563'

  return (
    <Box sx={{ display: 'flex', gap: 1.5, color: on ? '#9ca3af' : '#4b5563', alignItems: 'center' }}>
      <Box sx={{ color: dotColor, flexShrink: 0, width: '1ch' }}>{on ? '●' : '○'}</Box>
      <Box sx={{ color: '#9ca3af', flexShrink: 0 }}>{alias10}</Box>
      <Box sx={{ color: swatchColor, flexShrink: 0 }}>■</Box>
      <Box sx={{ color: '#6b7280', flexShrink: 0 }}>{hex}</Box>
      <Bar pct={pct} width={BRI_WIDTH} active={on ? '#7ee8ff' : '#374151'} inactive="#1f2937" />
      <Box sx={{ color: '#9ca3af', flexShrink: 0 }}>{on ? `${pct}%` : 'off '}</Box>
    </Box>
  )
}

function WLEDStrip() {
  const [devices, setDevices] = useState<WLEDDevice[]>([])

  const fetchDevices = () => {
    fetch('/api/wled/devices')
      .then((r) => r.json())
      .then((list: WLEDDevice[]) => setDevices(list))
      .catch(() => {})
  }

  useEffect(() => {
    fetchDevices()
  }, [])

  useSubscription<{ host: string; on: boolean; bri: number; color: [number, number, number] }>(
    'wled',
    (d) => {
      setDevices((cur) =>
        cur.map((dev) =>
          dev.host === d.host
            ? {
                ...dev,
                reachable: true,
                state: { on: d.on, bri: d.bri, color: d.color, fx: dev.state?.fx ?? 0 },
              }
            : dev,
        ),
      )
    },
  )

  // Settings changes (devices added/removed/renamed) → re-fetch.
  useSubscription<{ paths: string[] }>('settings_change', (d) => {
    if (d.paths && d.paths.some((p) => p.startsWith('wled'))) fetchDevices()
  })

  const visible = devices.filter((d) => d.enabled)
  if (visible.length === 0) return null

  return (
    <Box
      sx={{
        borderTop: '1px solid #1f2937',
        px: 1.5,
        py: 1,
        fontFamily: MONO,
        fontSize: 13,
        lineHeight: 1.55,
        bgcolor: '#080a0e',
      }}
    >
      <Box sx={{ color: '#374151', fontSize: 11, letterSpacing: '0.08em', mb: 0.5 }}>
        // wled ({visible.length})
      </Box>
      {visible.map((d) => (
        <WLEDRow key={d.alias} device={d} />
      ))}
    </Box>
  )
}

function TimerStrip() {
  const [timers, setTimers] = useState<ActiveTimer[]>([])

  useEffect(() => {
    fetch('/api/timers')
      .then((r) => r.json())
      .then((list: ActiveTimer[]) => setTimers(list))
      .catch(() => {})
  }, [])

  useSubscription<{
    event: string
    id: number
    label?: string
    seconds?: number
    fires_at?: number
  }>('timer', (d) => {
    if (d.event === 'set' && d.fires_at !== undefined) {
      setTimers((cur) => [
        ...cur.filter((t) => t.id !== d.id),
        { id: d.id, label: d.label || '', seconds: d.seconds || 0, fires_at: d.fires_at as number },
      ])
    } else if (d.event === 'fire' || d.event === 'cancel') {
      setTimers((cur) => cur.filter((t) => t.id !== d.id))
    }
  })

  if (timers.length === 0) return null

  return (
    <Box
      sx={{
        borderTop: '1px solid #1f2937',
        px: 1.5,
        py: 1,
        fontFamily: MONO,
        fontSize: 13,
        lineHeight: 1.55,
        bgcolor: '#080a0e',
      }}
    >
      <Box sx={{ color: '#374151', fontSize: 11, letterSpacing: '0.08em', mb: 0.5 }}>
        // timers ({timers.length})
      </Box>
      {timers
        .slice()
        .sort((a, b) => a.fires_at - b.fires_at)
        .map((t) => (
          <TimerRow key={t.id} timer={t} />
        ))}
    </Box>
  )
}

type Mode = 'ollama-web' | 'ollama-claude' | 'claude'

const MODE_ORDER: Mode[] = ['ollama-web', 'ollama-claude', 'claude']
const MODE_LABEL: Record<Mode, string> = {
  'ollama-web': '○ ollama · web',
  'ollama-claude': '◐ ollama · claude',
  'claude': '● claude mode',
}
const MODE_COLOR: Record<Mode, string> = {
  'ollama-web': '#4b5563',
  'ollama-claude': '#f472b6',
  'claude': '#00d9ff',
}

export function ClaudeConsoleView() {
  const [log, dispatch] = useReducer(reduce, [])
  const scrollRef = useRef<HTMLDivElement>(null)
  const [mode, setMode] = useState<Mode | null>(null)
  const [pendingIds, setPendingIds] = useState<string[]>([])
  const [pendingTools, setPendingTools] = useState<string[]>([])
  const [model, setModel] = useState<string>('')
  const pendingRef = useRef<Set<string>>(new Set())
  const pendingToolRef = useRef<Set<string>>(new Set())
  const asstBuf = useRef<string>('')

  useEffect(() => {
    let canceled = false
    const tick = async () => {
      try {
        const [m, p, pt] = await Promise.all([
          fetch('/api/llm/mode').then((r) => r.json()),
          fetch('/api/llm/external/pending').then((r) => r.json()),
          fetch('/api/llm/external/pending_tools').then((r) => r.json()),
        ])
        if (canceled) return
        setMode(m.mode)
        const ids: string[] = p.ids || []
        setPendingIds(ids)
        const seen = pendingRef.current
        const next = new Set(ids)
        for (const id of seen) {
          if (!next.has(id)) {
            dispatch({
              id: nid(),
              ts: Date.now(),
              kind: 'reply',
              text: 'resolved',
              pid: id,
            })
          }
        }
        pendingRef.current = next
        const toolIds: string[] = pt.ids || []
        setPendingTools(toolIds)
        const seenT = pendingToolRef.current
        const nextT = new Set(toolIds)
        for (const id of seenT) {
          if (!nextT.has(id)) {
            dispatch({
              id: nid(),
              ts: Date.now(),
              kind: 'extool',
              text: 'resolved',
              pid: id,
            })
          }
        }
        pendingToolRef.current = nextT
      } catch {
        /* offline — silent */
      }
    }
    tick()
    const id = setInterval(tick, 1500)
    return () => {
      canceled = true
      clearInterval(id)
    }
  }, [])

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((s) => {
        const m = s?.llm?.ollama_model
        if (typeof m === 'string') setModel(m)
      })
      .catch(() => {})
  }, [])

  useSubscription<{ role: 'user' | 'assistant'; text: string; lang?: string; partial: boolean }>(
    'transcript',
    (d) => {
      if (d.role === 'user') {
        if (!d.partial && d.text) {
          const lang = d.lang ? ` [${d.lang}]` : ''
          dispatch({
            id: nid(),
            ts: Date.now(),
            kind: 'transcript_user',
            text: `${d.text}${lang}`,
          })
        }
        return
      }
      // Assistant transcripts arrive as partial=true chunks (each a sentence
      // or partial sentence) followed by a final partial=false marker with
      // empty text. Accumulate and flush on the end-marker so we get one
      // JARVYZ log line per turn, not one per chunk.
      if (d.partial && d.text) {
        asstBuf.current = asstBuf.current ? `${asstBuf.current} ${d.text}` : d.text
      } else if (!d.partial) {
        const text = asstBuf.current.trim()
        asstBuf.current = ''
        if (text) {
          dispatch({
            id: nid(),
            ts: Date.now(),
            kind: 'transcript_asst',
            text,
          })
        }
      }
    },
  )

  useSubscription<{ id: string; text: string }>('external_prompt', (d) => {
    dispatch({ id: nid(), ts: Date.now(), kind: 'prompt', text: d.text, pid: d.id })
  })

  useSubscription<{ id: string; name: string; args: Record<string, unknown> }>(
    'external_tool_call',
    (d) => {
      let argsStr: string
      try {
        argsStr = JSON.stringify(d.args)
      } catch {
        argsStr = '?'
      }
      if (argsStr.length > 80) argsStr = `${argsStr.slice(0, 80)}…`
      dispatch({
        id: nid(),
        ts: Date.now(),
        kind: 'extool',
        text: `${d.name}(${argsStr})`,
        pid: d.id,
      })
    },
  )

  useSubscription<{ name: string; args: Record<string, unknown>; result: string; ms: number }>(
    'tool',
    (d) => {
      let argsStr: string
      try {
        argsStr = JSON.stringify(d.args)
      } catch {
        argsStr = '?'
      }
      if (argsStr.length > 80) argsStr = `${argsStr.slice(0, 80)}…`
      let result = (d.result || '').replace(/\s+/g, ' ').trim()
      if (result.length > 120) result = `${result.slice(0, 120)}…`
      dispatch({
        id: nid(),
        ts: Date.now(),
        kind: 'tool',
        text: `${d.name}(${argsStr}) → ${result} · ${d.ms}ms`,
      })
    },
  )

  useSubscription<{ state: string }>('mode', (d) => {
    dispatch({ id: nid(), ts: Date.now(), kind: 'mode', text: d.state })
  })

  useSubscription<{ paths: string[] }>('settings_change', (d) => {
    if (d.paths && d.paths.length) {
      dispatch({
        id: nid(),
        ts: Date.now(),
        kind: 'system',
        text: `settings: ${d.paths.join(', ')}`,
      })
    }
  })

  useSubscription<{ state: string; message?: string }>('announce', (d) => {
    if (d.state === 'start' && d.message) {
      dispatch({ id: nid(), ts: Date.now(), kind: 'announce', text: d.message })
    }
  })

  const lastLen = log.length
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on new entry
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [lastLen])

  const cycle = async () => {
    if (!mode) return
    const i = MODE_ORDER.indexOf(mode)
    const next = MODE_ORDER[(i + 1) % MODE_ORDER.length]
    try {
      await fetch('/api/llm/mode', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: next }),
      })
      setMode(next)
    } catch {
      /* show nothing — next poll will reconcile */
    }
  }

  const modeLabel = mode ? MODE_LABEL[mode] : '… loading'
  const modeColor = mode ? MODE_COLOR[mode] : '#4b5563'
  const sourceLabel =
    mode === 'claude' ? 'claude' :
    mode === 'ollama-claude' ? `${model || 'ollama'} + claude·web` :
    mode === 'ollama-web' ? model || 'ollama' :
    '…'

  return (
    <Paper
      sx={{
        p: 0,
        overflow: 'hidden',
        bgcolor: '#0a0d11',
        border: '1px solid #1f2937',
        borderRadius: 1,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          px: 2,
          py: 1,
          borderBottom: '1px solid #1f2937',
          fontFamily: MONO,
          fontSize: 13,
        }}
      >
        <Box
          onClick={cycle}
          sx={{
            cursor: mode ? 'pointer' : 'default',
            color: modeColor,
            userSelect: 'none',
            transition: 'color 120ms',
            '&:hover': mode ? { filter: 'brightness(1.25)' } : undefined,
          }}
          title={mode ? `click to cycle: ollama-web → ollama-claude → claude` : ''}
        >
          {modeLabel}
        </Box>
        <Box sx={{ color: '#1f2937' }}>│</Box>
        <Box sx={{ color: '#6b7280' }}>
          source: <Box component="span" sx={{ color: '#9ca3af' }}>{sourceLabel}</Box>
        </Box>
        <Box sx={{ color: '#1f2937' }}>│</Box>
        <Box
          sx={{
            color: pendingIds.length > 0 ? '#00d9ff' : '#4b5563',
            transition: 'color 120ms',
          }}
        >
          pending: {pendingIds.length}
        </Box>
        {pendingTools.length > 0 && (
          <>
            <Box sx={{ color: '#1f2937' }}>│</Box>
            <Box sx={{ color: '#f472b6', transition: 'color 120ms' }}>
              extool: {pendingTools.length}
            </Box>
          </>
        )}
        <Box sx={{ flex: 1 }} />
        <Box sx={{ color: '#374151', fontSize: 11, letterSpacing: '0.08em' }}>v8 · console</Box>
      </Box>

      <Box
        ref={scrollRef}
        sx={{
          // On mobile, fit the viewport so the dock + timer/wled strips
          // stay onscreen without an outer scrollbar. Desktop keeps the
          // fixed 540px feel.
          height: { xs: 'calc(100dvh - 330px)', md: 540 },
          minHeight: 200,
          overflow: 'auto',
          p: 1.5,
          fontFamily: MONO,
          fontSize: 13,
          lineHeight: 1.55,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {log.length === 0 && (
          <Box sx={{ color: '#374151', textAlign: 'center', mt: 6, fontSize: 12 }}>
            // waiting for events…
          </Box>
        )}
        {log.map((e) => (
          <Box key={e.id} sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
            <Box sx={{ color: '#1f2937', flexShrink: 0 }}>{fmtTime(e.ts)}</Box>
            <Box sx={{ color: COLORS[e.kind], flexShrink: 0, opacity: 0.85 }}>{TAGS[e.kind]}</Box>
            {e.pid && (
              <Box sx={{ color: '#4b5563', flexShrink: 0 }} title={e.pid}>
                {e.pid.slice(0, 8)}
              </Box>
            )}
            <Box sx={{ color: COLORS[e.kind], flex: 1 }}>{e.text}</Box>
          </Box>
        ))}
      </Box>

      <TimerStrip />
      <WLEDStrip />
    </Paper>
  )
}
