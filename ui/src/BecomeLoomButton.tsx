import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import CheckIcon from '@mui/icons-material/Check'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import DownloadIcon from '@mui/icons-material/Download'
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Tooltip,
  Typography,
} from '@mui/material'
import { useCallback, useEffect, useState } from 'react'

// The onboarding prompt is served next to this IIFE (copied there by the
// satellite's install-to-frontend). Fetched + copied whole so it works pasted
// into ANY session, even a different project.
const ONBOARDING_URL = '/modules/yz-loom.become-loom.md'
// The bridge scripts, served the same way — a brain can curl them from the
// running JarvYZ (BECOME_LOOM.md says how); these links are the human path.
const CLIENT_URL = '/modules/yz-loom.client.py'
const LISTENER_URL = '/modules/yz-loom.listener.py'

const FALLBACK_PROMPT =
  'Become Loom — the voice of my JarvYZ assistant. Open and follow this file, ' +
  'then do what it says:\n\n  satellites/yz-loom/companion/BECOME_LOOM.md\n\n' +
  "(If you're in a different project and can't see that file, ask me to paste its contents.)"

interface BrainStatus {
  mode: string
  pending: number
  brain: { seen_secs_ago: number; client: string } | null
}

/** Snapshot of /api/loom/status, fetched when the dialog opens (no polling —
 *  reopen or hit the refresh text to re-read). Older cores without the
 *  endpoint render nothing. */
function BrainStatusRow() {
  const [status, setStatus] = useState<BrainStatus | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let alive = true
    void fetch('/api/loom/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => {
        if (alive) setStatus(s)
      })
      .catch(() => {
        if (alive) setStatus(null)
      })
    return () => {
      alive = false
    }
  }, [nonce])

  if (!status) return null
  const seen = status.brain?.seen_secs_ago
  // The listener heartbeats every ~30s; the loop client's long-poll is ~25s.
  // Anything younger than ~90s is a live brain; older is a stale corpse.
  const connected = seen != null && seen < 90
  return (
    <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
      <Chip
        size="small"
        color={connected ? 'success' : 'default'}
        variant={connected ? 'filled' : 'outlined'}
        label={
          connected
            ? `brain connected (${status.brain?.client}, ${Math.round(seen ?? 0)}s ago)`
            : 'no brain connected'
        }
      />
      <Chip
        size="small"
        variant="outlined"
        label={status.mode === 'external' ? 'Loom Mode ON' : 'Loom Mode off'}
      />
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ cursor: 'pointer', textDecoration: 'underline' }}
        onClick={() => setNonce((n) => n + 1)}
      >
        refresh
      </Typography>
    </Box>
  )
}

/** Dense "Become Loom" — icon button + dialog that copies the onboarding
 *  prompt for a fresh AI coder (any harness: Claude Code runs the listener
 *  under Monitor; Copilot & co. run the persistent wait-loop — both paths
 *  are in the prompt). Satellite-local copy of the core BrainModeControls
 *  button (separate IIFE bundle), for the v8 console header. */
export function BecomeLoomButton() {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const copy = useCallback(async () => {
    let text = FALLBACK_PROMPT
    try {
      const r = await fetch(ONBOARDING_URL)
      if (r.ok) {
        const md = (await r.text()).trim()
        if (md) text = md
      }
    } catch {
      /* served doc unreachable — fall back to the pointer prompt */
    }
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard blocked — nothing to do silently */
    }
  }, [])

  return (
    <>
      <Tooltip title="Become Loom — connect an AI coder to JarvYZ">
        <IconButton size="small" onClick={() => setOpen(true)} sx={{ color: '#6b7280' }}>
          <AutoAwesomeIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Become Loom</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            Add a voice channel to your coding experience by connecting JarvYZ to
            your AI coder — Claude Code, Copilot, or any agent with a terminal.
            Just paste this prompt into a session:
          </Typography>
          <Box
            sx={{
              mt: 1.5,
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              p: 1,
              pl: 1.5,
              borderRadius: 1,
              bgcolor: 'background.default',
              border: '1px solid',
              borderColor: 'divider',
            }}
          >
            <Typography variant="body2" sx={{ flex: 1, fontStyle: 'italic' }}>
              the Become Loom onboarding prompt
            </Typography>
            <Tooltip title={copied ? 'Copied!' : 'Copy to clipboard'}>
              <IconButton size="small" color={copied ? 'success' : 'default'} onClick={() => void copy()}>
                {copied ? <CheckIcon fontSize="small" /> : <ContentCopyIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
          </Box>
          <BrainStatusRow />
          <Box sx={{ mt: 1.5, display: 'flex', gap: 1.5, alignItems: 'center' }}>
            <DownloadIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
            <Typography variant="caption" color="text.secondary">
              bridge scripts (the prompt fetches these itself):{' '}
              <a href={CLIENT_URL} download="loom_client.py">
                loom_client.py
              </a>
              {' · '}
              <a href={LISTENER_URL} download="loom_listener.py">
                loom_listener.py
              </a>
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
