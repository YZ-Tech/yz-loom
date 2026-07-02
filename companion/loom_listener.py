"""Loom voice channel listener.

Run by a Monitor task in the Claude Code session that's twinned with this
JarvYZ instance. Emission depends on the current mode (probed from
/api/settings on connect, refreshed via WS `settings_change` events, and
re-probed periodically as a self-heal):

  external (Claude Mode):
    [<lang>] <text>            — final user transcript
    [PROMPT id=<hex>] <text>   — awaiting a reply via POST /api/llm/external/reply
                                 (+ [PERSONA_OVERLAY] / [BRIEF] context lines)

  local (reflex, or ollama with/without DuckDuckGo web):
    nothing — Claude has no role; only [ws-connected] / [mode] / [ws-disconnect]
    surface so the user can still see the listener is alive. (qwen runs its own
    tools, incl. web search, in-loop — nothing is delegated to Claude.)

Reply to a PROMPT with text (and optional tool_calls) via
POST /api/llm/external/reply. An empty reply cancels the turn silently.

Recovery + resilience:
  • On connect (and after any mode-correction into external) we replay prompts
    already blocked server-side, so a listener that attaches late — or whose
    mode was briefly wrong — still learns about them. Recovered PROMPTs carry
    the same persona/brief block as live ones.
  • The connect-time mode probe is retried (JarvYZ may still be booting on a
    reconnect), and mode is re-probed on idle so a misprobed listener can't stay
    silently stuck in the wrong mode until the next settings_change.
  • Emitted ids are de-duped for this process so a reconnect can't surface the
    same PROMPT twice (a listener *restart* starts fresh and re-emits).
"""
from __future__ import annotations

import asyncio
import json
import sys
from typing import Any
from urllib.request import urlopen

# Windows console is cp1252 by default — German umlauts (ß, ö, ü) and
# emojis crash print() in transcripts. Force utf-8 so non-ASCII transcripts
# survive into our log file.
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except AttributeError:
    pass

import websockets

URL = "ws://127.0.0.1:8765/ws"
PENDING_URL = "http://127.0.0.1:8765/api/llm/external/pending"
SETTINGS_URL = "http://127.0.0.1:8765/api/settings"

RECONNECT_DELAY = 2.0     # backoff between connection attempts (every path)
REPROBE_SECS = 30.0       # idle re-probe interval — self-heals a mis-moded listener
CONNECT_PROBE_TRIES = 5   # retry the connect-time mode probe (JarvYZ may be booting)

# Current operating mode — "external" (Claude is the LLM) or "local" (reflex /
# ollama; Claude has no role). Refreshed on connect, on settings_change, and on
# idle re-probe. Default "local" so an unreachable settings endpoint silences
# the channel rather than spamming transcripts — but the connect-time retry +
# periodic re-probe keep a genuinely-external session from getting stuck on it.
_mode: str = "local"

# Prompt ids already surfaced during THIS process. Prevents re-emitting the same
# PROMPT when pending is replayed across a reconnect or a mode-correction. A
# fresh process starts empty, so a listener *restart* still re-emits anything
# still blocked. Process-lifetime + one small hex string per turn — negligible.
_emitted_prompts: set[str] = set()


def _mode_from_settings(s: dict) -> str:
    source = (s.get("llm") or {}).get("source") or "ollama"
    return "external" if source == "external" else "local"


async def _get_json(url: str) -> Any:
    """Blocking urlopen off-loaded to a thread so a slow/hung endpoint can't
    stall the event loop (which also services the WS keepalive)."""
    def _get() -> Any:
        with urlopen(url, timeout=2) as r:
            return json.loads(r.read())
    return await asyncio.to_thread(_get)


async def _refresh_mode() -> bool:
    """Fetch the current mode from /api/settings. Returns True on success. On
    failure keeps the previous value — we'd rather stay in whatever mode we
    last saw than flip to a default and misroute events."""
    global _mode
    try:
        _mode = _mode_from_settings(await _get_json(SETTINGS_URL))
        return True
    except Exception as e:
        print(f"[ws-settings-probe-failed] {e}", flush=True)
        return False


def _print_prompt(pid: str, text: str, persona: str, overlay: str, brief: str) -> None:
    """Emit a PROMPT with its persona overlay (identity+body) and prompt_brief
    (capabilities+world+history) as clearly-separated, greppable blocks — so
    Claude reads each without an extra /api/settings probe. Shared by the live
    `external_prompt` path and pending-recovery so both are full-fidelity."""
    if pid in _emitted_prompts:
        return
    tag = f" persona={persona}" if persona else ""
    print(f"[PROMPT id={pid}{tag}] {text}", flush=True)
    if overlay:
        print(f"[PERSONA_OVERLAY id={pid}] {overlay}", flush=True)
    if brief:
        print(f"[BRIEF id={pid}] {brief}", flush=True)
    _emitted_prompts.add(pid)


async def _emit_pending() -> None:
    """Probe the REST API for prompts that are already blocked waiting for us.
    Without this, a listener that attaches AFTER an event fires (JarvYZ restart,
    listener restart, late session start, or a mode-correction that arrives
    after the event) would never learn about it — the WS event has already been
    broadcast and is gone. Replays anything pending as if it just arrived.

    Only external mode has anything to recover; de-duped via _print_prompt so a
    replay can't double-surface."""
    if _mode != "external":
        return
    try:
        for p in ((await _get_json(PENDING_URL)).get("prompts") or []):
            _print_prompt(
                p.get("id") or "?",
                (p.get("text") or "").strip(),
                p.get("persona") or "",
                (p.get("persona_overlay") or "").strip(),
                (p.get("brief") or "").strip(),
            )
    except Exception as e:
        print(f"[ws-pending-probe-failed] {e}", flush=True)


async def _apply_mode_change(prev: str) -> None:
    """After a re-probe, announce a mode change and — if we've entered external
    — recover anything already blocked (the event may have fired while we were
    in the wrong mode)."""
    if _mode == prev:
        return
    print(f"[mode] {prev} → {_mode}", flush=True)
    if _mode == "external":
        await _emit_pending()


async def _handle(raw: str) -> None:
    try:
        d = json.loads(raw)
    except Exception:
        return
    if not isinstance(d, dict):  # a valid-JSON non-object frame — ignore, don't crash
        return
    et = d.get("event_type")
    if et == "settings_change":
        prev = _mode
        if await _refresh_mode():
            await _apply_mode_change(prev)
        return
    # Everything below only matters in external mode (Claude is the LLM for the
    # turn). In local mode the user isn't talking to Claude — qwen/reflex handle it.
    if _mode != "external":
        return
    if et == "transcript" and d.get("role") == "user" and not d.get("partial", False):
        text = (d.get("text") or "").strip()
        lang = d.get("lang") or "?"
        if text:
            print(f"[{lang}] {text}", flush=True)
    elif et == "external_prompt":
        _print_prompt(
            d.get("id") or "?",
            (d.get("text") or "").strip(),
            d.get("persona") or "",
            (d.get("persona_overlay") or "").strip(),
            (d.get("brief") or "").strip(),
        )


async def main() -> None:
    was_connected = False
    while True:
        try:
            async with websockets.connect(URL, ping_interval=20) as ws:
                # Connect-time mode probe with retry: JarvYZ may still be booting
                # on a reconnect, and silently accepting the local default would
                # mute a genuinely-external session (nothing re-probes until a
                # settings_change, which may never come).
                for _ in range(CONNECT_PROBE_TRIES):
                    if await _refresh_mode():
                        break
                    await asyncio.sleep(1)
                print(f"[ws-connected] mode={_mode}", flush=True)
                was_connected = True
                # Recover anything that fired before we attached.
                await _emit_pending()
                while True:
                    try:
                        raw = await asyncio.wait_for(ws.recv(), timeout=REPROBE_SECS)
                    except asyncio.TimeoutError:
                        # Idle — re-probe so a mis-moded listener self-heals even
                        # without a settings_change (e.g. after a connect-time
                        # probe failure left us on the local default).
                        prev = _mode
                        if await _refresh_mode():
                            await _apply_mode_change(prev)
                        continue
                    await _handle(raw)
        except Exception as e:
            if was_connected:
                # Only surface the first failure after a successful connection;
                # silent retries while JarvYZ is booting / restarting.
                print(f"[ws-disconnect] {e}", flush=True)
                was_connected = False
        # Unconditional backoff before the next attempt — also covers a server
        # that closes cleanly (no exception path would otherwise pace us).
        await asyncio.sleep(RECONNECT_DELAY)


if __name__ == "__main__":
    asyncio.run(main())
