import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import CheckIcon from '@mui/icons-material/Check'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Tooltip,
  Typography,
} from '@mui/material'
import { useCallback, useState } from 'react'

// The onboarding prompt is served next to this IIFE (copied there by the
// satellite's install-to-frontend). Fetched + copied whole so it works pasted
// into ANY session, even a different project.
const ONBOARDING_URL = '/modules/yz-loom.become-loom.md'

const FALLBACK_PROMPT =
  'Become Loom — the voice of my JarvYZ assistant. Open and follow this file, ' +
  'then do what it says:\n\n  satellites/yz-loom/companion/BECOME_LOOM.md\n\n' +
  "(If you're in a different project and can't see that file, ask me to paste its contents.)"

/** Dense "Become Loom" — icon button + dialog that copies the onboarding
 *  prompt for a fresh AI coder. Satellite-local copy of the core
 *  BrainModeControls button (separate IIFE bundle), for the v8 console header. */
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
            your AI coder. Just paste this prompt into a new session:
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
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
