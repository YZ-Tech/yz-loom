"""Universal Loom brain client — stdlib only, runs on any Python 3.9+.

The zero-dependency sibling of loom_listener.py, built for agent harnesses
that CANNOT be woken by background output (no Monitor-equivalent). Instead of
streaming events into a live session, it gives the agent two blocking verbs it
can drive from its own terminal — the "persistent wait-loop" protocol:

  python loom_client.py next
      Block until a voice prompt is waiting, print it, exit. This IS the
      agent's wake primitive: run it in the terminal, let it wait (minutes are
      normal), and treat its output as the next user message.

  python loom_client.py reply <id> --text "what to say out loud"
      Answer the prompt. Does the JSON + HTTP for you — no shell-quoting
      fights, no temp files. Also: --file <path> (read reply text from a
      file, for multi-line or tricky quoting) or pipe text on stdin.
      --json-file <path> sends a full reply body (tool_calls, motion, ...).

  python loom_client.py listen
      Run forever, printing prompts as they arrive — same line formats as
      loom_listener.py. For Monitor-style harnesses that want the no-deps
      client (loom_listener.py needs the `websockets` package; this doesn't).

  python loom_client.py status
      One-line health probe: mode, pending count, last brain heartbeat.

Transport: HTTP long-poll against GET /api/loom/next (the server holds the
request open until a prompt arrives or the wait window lapses; we just call
it again). No WebSocket, no pip installs. Connection errors are retried
quietly — while JarvYZ is booting or restarting, waiting is the correct
behavior for a wait verb.

Output line formats (greppable, identical to loom_listener.py):
  [PROMPT id=<hex> persona=<name>] <text>   — the user is waiting for a reply
  [PERSONA_OVERLAY id=<hex>] <...>          — who you are this turn
  [VOICE_CONTRACT id=<hex>] <...>           — output rules (spoken length,
                                              language, digits-as-words)
  [BRIEF id=<hex>] <...>                    — live capabilities + world state
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

# Windows console is cp1252 by default — German umlauts and non-ASCII
# transcripts crash print(). Same guard as loom_listener.py.
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except AttributeError:
    pass

DEFAULT_BASE = "http://127.0.0.1:8765"
# Server-side hold per long-poll request. Short enough that a dead connection
# is noticed, long enough that an idle voice channel costs ~2 requests/min.
WAIT_SECS = 25
RETRY_DELAY = 2.0


def _get_json(url: str, timeout: float) -> dict:
    with urllib.request.urlopen(url, timeout=timeout) as r:
        return json.loads(r.read())


def _post_json(url: str, body: dict) -> tuple[int, dict]:
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url, data=data, headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        try:
            detail = json.loads(e.read())
        except Exception:
            detail = {"detail": str(e)}
        return e.code, detail


def _print_prompt(p: dict) -> None:
    pid = p.get("id") or "?"
    tag = f" persona={p['persona']}" if p.get("persona") else ""
    print(f"[PROMPT id={pid}{tag}] {(p.get('text') or '').strip()}", flush=True)
    overlay = (p.get("persona_overlay") or "").strip()
    contract = (p.get("voice_contract") or "").strip()
    brief = (p.get("brief") or "").strip()
    if overlay:
        print(f"[PERSONA_OVERLAY id={pid}] {overlay}", flush=True)
    if contract:
        print(f"[VOICE_CONTRACT id={pid}] {contract}", flush=True)
    if brief:
        print(f"[BRIEF id={pid}] {brief}", flush=True)


def _poll_once(base: str, client: str, exclude: set[str]) -> dict | None:
    """One long-poll round. Returns a prompt dict, or None on empty/error
    (both mean: poll again)."""
    q = urllib.parse.urlencode({"wait": WAIT_SECS, "client": client})
    try:
        data = _get_json(f"{base}/api/loom/next?{q}", timeout=WAIT_SECS + 10)
    except Exception:
        return None  # booting / restarting / unreachable — waiting is correct
    prompt = data.get("prompt")
    if prompt and prompt.get("id") not in exclude:
        return prompt
    return None


def cmd_next(base: str) -> int:
    """Block until one prompt is waiting, print it, exit 0."""
    warned = False
    started = time.monotonic()
    while True:
        prompt = _poll_once(base, "loop", exclude=set())
        if prompt is not None:
            # Time-grounding: a blocking command returning feels instant to
            # the agent (the 30-min soak read as "a few seconds" to a live
            # session, 2026-07-06). Tell it how long the channel was quiet
            # so etiquette can match reality.
            print(f"[waited {time.monotonic() - started:.0f}s]", flush=True)
            _print_prompt(prompt)
            return 0
        if not warned:
            # One-time hint so a human tailing the terminal knows the silence
            # is healthy waiting, not a hang.
            print("[waiting] connected loop is idle - no prompt yet", flush=True)
            warned = True
        time.sleep(0.2)  # tiny gap between long-poll rounds


def cmd_listen(base: str) -> int:
    """Print prompts forever (Monitor-style). De-dupes ids for this process
    so an unanswered prompt isn't re-emitted every poll round."""
    emitted: set[str] = set()
    last = time.monotonic()
    print(f"[loom-client] listening via {base}/api/loom/next", flush=True)
    while True:
        prompt = _poll_once(base, "listen", exclude=emitted)
        if prompt is not None:
            now = time.monotonic()
            print(f"[waited {now - last:.0f}s]", flush=True)  # see cmd_next
            last = now
            _print_prompt(prompt)
            emitted.add(prompt.get("id") or "?")
        time.sleep(0.2)


def cmd_reply(base: str, args: argparse.Namespace) -> int:
    if args.json_file:
        with open(args.json_file, encoding="utf-8") as f:
            body = json.load(f)
        body["id"] = args.id
    else:
        if args.file:
            with open(args.file, encoding="utf-8") as f:
                text = f.read().strip()
        elif args.text is not None:
            text = args.text
        elif not sys.stdin.isatty():
            text = sys.stdin.read().strip()
        else:
            print("no reply text: use --text, --file, --json-file, or pipe stdin", file=sys.stderr)
            return 2
        # Empty text is a deliberate silent-cancel (user cut themselves off,
        # cross-talk, "never mind") — forwarded as-is.
        body = {"id": args.id, "text": text}
    status, detail = _post_json(f"{base}/api/llm/external/reply", body)
    if status == 200:
        print("[replied]" if body.get("text") or body.get("tool_calls") else "[cancelled]", flush=True)
        return 0
    print(f"[reply-failed {status}] {detail.get('detail', detail)}", file=sys.stderr)
    return 1


def cmd_status(base: str) -> int:
    try:
        s = _get_json(f"{base}/api/loom/status", timeout=5)
    except Exception as e:
        print(f"[status] JarvYZ unreachable at {base} ({e})", flush=True)
        return 1
    brain = s.get("brain") or {}
    seen = brain.get("seen_secs_ago")
    seen_txt = f"{brain.get('client')} seen {seen:.0f}s ago" if seen is not None else "none seen"
    print(
        f"[status] mode={s.get('mode')} pending={s.get('pending')} brain: {seen_txt}",
        flush=True,
    )
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="Universal Loom brain client (stdlib only)")
    ap.add_argument("--base", default=DEFAULT_BASE, help=f"JarvYZ base URL (default {DEFAULT_BASE})")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("next", help="block until a prompt is waiting, print it, exit")
    sub.add_parser("listen", help="print prompts forever (Monitor-style)")
    sub.add_parser("status", help="one-line health probe")
    rp = sub.add_parser("reply", help="answer a prompt by id")
    rp.add_argument("id", help="the hex id from the PROMPT line")
    rp.add_argument("--text", help="reply text (spoken aloud); empty string cancels silently")
    rp.add_argument("--file", help="read reply text from a file")
    rp.add_argument("--json-file", help="send a full reply body (tool_calls, motion, ...) from a JSON file")
    args = ap.parse_args()
    base = args.base.rstrip("/")
    if args.cmd == "next":
        return cmd_next(base)
    if args.cmd == "listen":
        return cmd_listen(base)
    if args.cmd == "reply":
        return cmd_reply(base, args)
    return cmd_status(base)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        sys.exit(130)
