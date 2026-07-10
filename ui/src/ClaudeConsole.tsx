import { Box, InputBase, Paper } from '@mui/material'
import { useEffect, useReducer, useRef, useState } from 'react'
import { useSubscription } from './lib/ws'
import { BecomeLoomButton } from './BecomeLoomButton'
import { useConsolePalette, type Engine, type LogKind } from './consolePalette'

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
  const p = useConsolePalette()
  const barRef = useRef<HTMLSpanElement | null>(null)
  const countRef = useRef<HTMLSpanElement | null>(null)
  const rowRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const update = () => {
      const remaining = timer.fires_at - Date.now() / 1000
      const total = timer.seconds || 1
      const elapsed = Math.max(0, Math.min(total, total - remaining))
      const pct = Math.max(0, Math.min(100, (elapsed / total) * 100))
      const active = remaining <= 5 ? p.rose : remaining <= 15 ? p.amber : p.accentSoft
      if (barRef.current) {
        barRef.current.style.background = `linear-gradient(to right, ${active} 0%, ${active} ${pct}%, ${p.dim} ${pct}%, ${p.dim} 100%)`
      }
      if (countRef.current) countRef.current.textContent = `${fmtMS(remaining)} / ${fmtMS(total)}`
      if (rowRef.current) rowRef.current.style.color = active
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [timer.fires_at, timer.seconds, p])

  const id = `#${timer.id}`.padEnd(4)
  const label = (timer.label || '').padEnd(10).slice(0, 10)

  return (
    <Box ref={rowRef} sx={{ display: 'flex', gap: 1.5, color: p.accentSoft, alignItems: 'center' }}>
      <Box sx={{ color: p.muted, flexShrink: 0 }}>{id}</Box>
      <Box sx={{ color: p.text, flexShrink: 0 }}>{label}</Box>
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
      <Box component="span" ref={countRef} sx={{ flexShrink: 0, color: p.text }} />
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
  const p = useConsolePalette()
  const { alias, state, reachable, enabled } = device

  if (!enabled) return null

  const alias10 = alias.padEnd(10).slice(0, 10)

  if (!reachable || !state) {
    return (
      <Box sx={{ display: 'flex', gap: 1.5 }}>
        <Box sx={{ color: p.rose, flexShrink: 0, width: '1ch' }}>?</Box>
        <Box sx={{ color: p.text, flexShrink: 0 }}>{alias10}</Box>
        <Box sx={{ color: p.muted }}>— offline</Box>
      </Box>
    )
  }

  const { on, bri, color } = state
  const pct = Math.round((bri / 255) * 100)
  const hex = toHex(color)
  const dotColor = on ? p.accent : p.muted
  const swatchColor = on ? `rgb(${color[0]}, ${color[1]}, ${color[2]})` : p.muted

  return (
    <Box sx={{ display: 'flex', gap: 1.5, color: on ? p.text : p.muted, alignItems: 'center' }}>
      <Box sx={{ color: dotColor, flexShrink: 0, width: '1ch' }}>{on ? '●' : '○'}</Box>
      <Box sx={{ color: p.text, flexShrink: 0 }}>{alias10}</Box>
      <Box sx={{ color: swatchColor, flexShrink: 0 }}>■</Box>
      <Box sx={{ color: p.mid, flexShrink: 0 }}>{hex}</Box>
      <Bar pct={pct} width={BRI_WIDTH} active={on ? p.accentSoft : p.faint} inactive={p.dim} />
      <Box sx={{ color: p.text, flexShrink: 0 }}>{on ? `${pct}%` : 'off '}</Box>
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

  const p = useConsolePalette()
  const visible = devices.filter((d) => d.enabled)
  if (visible.length === 0) return null

  return (
    <Box
      sx={{
        borderTop: `1px solid ${p.border}`,
        px: 1.5,
        py: 1,
        fontFamily: MONO,
        fontSize: 13,
        lineHeight: 1.55,
        bgcolor: p.strip,
      }}
    >
      <Box sx={{ color: p.faint, fontSize: 11, letterSpacing: '0.08em', mb: 0.5 }}>
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

  const p = useConsolePalette()
  if (timers.length === 0) return null

  return (
    <Box
      sx={{
        borderTop: `1px solid ${p.border}`,
        px: 1.5,
        py: 1,
        fontFamily: MONO,
        fontSize: 13,
        lineHeight: 1.55,
        bgcolor: p.strip,
      }}
    >
      <Box sx={{ color: p.faint, fontSize: 11, letterSpacing: '0.08em', mb: 0.5 }}>
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

// The active engine, read from the live /api/llm/source (none | ollama |
// cloud | external). Read-only status here — the actual toggle lives on the
// Brain page + privacy shield. `external` = Loom Mode; `cloud` = an OpenAI-
// compatible API answers instead of us; `none` = empty brain slot, reflexes
// only.
const ENGINE_LABEL: Record<Engine, string> = {
  none: '◦ reflexes only',
  ollama: '○ ollama',
  cloud: '◑ cloud api',
  external: '● loom mode',
}

export function ClaudeConsoleView() {
  const p = useConsolePalette()
  const [log, dispatch] = useReducer(reduce, [])
  const scrollRef = useRef<HTMLDivElement>(null)
  const [source, setSource] = useState<Engine | null>(null)
  const [pendingIds, setPendingIds] = useState<string[]>([])
  const [model, setModel] = useState<string>('')
  const [lang, setLang] = useState<'en' | 'de'>('en')
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const pendingRef = useRef<Set<string>>(new Set())
  const asstBuf = useRef<string>('')

  useEffect(() => {
    let canceled = false
    const tick = async () => {
      try {
        const [s, p] = await Promise.all([
          fetch('/api/llm/source').then((r) => r.json()),
          fetch('/api/llm/external/pending').then((r) => r.json()),
        ])
        if (canceled) return
        setSource(s.source)
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
        setLang(s?.stt?.whisper_language === 'de' ? 'de' : 'en')
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

  const engineLabel = source ? ENGINE_LABEL[source] : '… loading'
  const engineColor = source ? p.engine[source] : p.muted
  const sourceLabel =
    source === 'external' ? 'loom' :
    source === 'ollama' ? model || 'ollama' :
    source === 'none' ? 'no brain' :
    '…'

  // Typed turn — the text counterpart to the mic. POSTs /api/prompt; the user +
  // assistant text stream back into the log via the `transcript` subscription
  // (same as a voice turn), so nothing to render here beyond clearing the draft.
  const send = async () => {
    const t = draft.trim()
    if (!t || busy) return
    setBusy(true)
    try {
      await fetch('/api/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: t, lang }),
      })
      setDraft('')
    } catch {
      /* offline — leave the draft so the user can retry */
    } finally {
      setBusy(false)
    }
  }

  return (
    <Paper
      sx={{
        p: 0,
        overflow: 'hidden',
        bgcolor: p.bg,
        border: `1px solid ${p.border}`,
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
          borderBottom: `1px solid ${p.border}`,
          fontFamily: MONO,
          fontSize: 13,
        }}
      >
        <Box
          sx={{
            color: engineColor,
            userSelect: 'none',
            transition: 'color 120ms',
          }}
          title="Active engine (change it on the Brain page)"
        >
          {engineLabel}
        </Box>
        <Box sx={{ color: p.dim }}>│</Box>
        <Box sx={{ color: p.mid }}>
          source: <Box component="span" sx={{ color: p.text }}>{sourceLabel}</Box>
        </Box>
        <Box sx={{ color: p.dim }}>│</Box>
        <Box
          sx={{
            color: pendingIds.length > 0 ? p.accent : p.muted,
            transition: 'color 120ms',
          }}
        >
          pending: {pendingIds.length}
        </Box>
        <Box sx={{ flex: 1 }} />
        <BecomeLoomButton />
        <Box sx={{ color: p.faint, fontSize: 11, letterSpacing: '0.08em' }}>v8 · console</Box>
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
          <Box sx={{ color: p.faint, textAlign: 'center', mt: 6, fontSize: 12 }}>
            // waiting for events…
          </Box>
        )}
        {log.map((e) => (
          <Box key={e.id} sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
            <Box sx={{ color: p.dim, flexShrink: 0 }}>{fmtTime(e.ts)}</Box>
            <Box sx={{ color: p.kinds[e.kind], flexShrink: 0, opacity: 0.85 }}>{TAGS[e.kind]}</Box>
            {e.pid && (
              <Box sx={{ color: p.muted, flexShrink: 0 }} title={e.pid}>
                {e.pid.slice(0, 8)}
              </Box>
            )}
            <Box sx={{ color: p.kinds[e.kind], flex: 1 }}>{e.text}</Box>
          </Box>
        ))}
      </Box>

      <TimerStrip />
      <WLEDStrip />

      <Box
        sx={{
          borderTop: `1px solid ${p.border}`,
          px: 1.5,
          py: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          fontFamily: MONO,
          fontSize: 13,
        }}
      >
        <Box component="span" sx={{ color: p.accent, flexShrink: 0, opacity: busy ? 0.4 : 1 }}>
          &gt;
        </Box>
        <InputBase
          value={draft}
          disabled={busy}
          placeholder="type a message to JarvYZ…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void send()
            }
          }}
          sx={{
            flex: 1,
            color: p.input,
            fontFamily: MONO,
            fontSize: 13,
            '& input::placeholder': { color: p.muted, opacity: 1 },
          }}
        />
      </Box>
    </Paper>
  )
}
