# Loom voice listener

`loom_listener.py` is the Claude-side half of Loom's dual channel — the Monitor
script a Claude Code session runs to *hear* JarvYZ. It's a **client** of JarvYZ
(subscribes to the `/ws` bus, probes a few REST endpoints) and prints greppable
lines the operating Claude reads to know when it owns a turn.

Since 2026-07-06 both companion scripts are **served by the running JarvYZ**
(install-to-frontend copies them to `/modules/yz-loom.listener.py` and
`/modules/yz-loom.client.py`), so a brain on any machine can fetch them with
curl — no human file-copying. BECOME_LOOM.md (the pasteable onboarding prompt)
tells the agent how.

**Sibling: `loom_client.py`** — the universal, stdlib-only client for harnesses
WITHOUT a Monitor-equivalent (Copilot & co.). Instead of a woken stream it
offers blocking verbs: `next` (long-poll `/api/loom/next` until a prompt
waits), `reply <id>` (posts the answer, no JSON quoting fights), `listen`
(Monitor-style stream without the `websockets` dependency), `status`. The
"persistent wait-loop" protocol built on it (run `next` in the agent's own
terminal, answer, repeat — one chat session carries the whole conversation)
is documented in BECOME_LOOM.md Path B and was verified live with a Copilot
session on 2026-07-06. Both clients heartbeat `/api/loom/heartbeat` (listener)
or implicitly via the long-poll (client), which feeds the Loom Console's
brain-status chip.

For the **server side** of the protocol it consumes — `/api/llm/external/reply`,
`/pending`, the `external_prompt` event shape, `prompt_brief`, the mode model —
see `backend/_docs/CLAUDE_MODE.md` in the JarvYZ core repo. This doc covers only
the listener.

## Run

The listener has no env of its own — run it with JarvYZ's backend env (which
already has `websockets`). From the JarvYZ `backend/` directory:

```
uv run python ../satellites/yz-loom/companion/loom_listener.py
# wait for: [ws-connected] mode=...
```

Launch it as a Monitor task in the Loom Claude Code session so its output
streams into the session.

## What it emits, by mode

The listener probes `/api/settings` to track the current mode and gates output
so the channel only speaks up when Claude has a role:

| mode | `[<lang>]` transcript | `[PROMPT]` | `[PERSONA_OVERLAY]` | `[BRIEF]` |
|---|---|---|---|---|
| `external` (Claude Mode) | yes | yes | when overlay set | when brief set |
| `local` (reflex / ollama, ± DuckDuckGo web) | — | — | — | — |

For each PROMPT in external mode it emits three lines, in this order:

1. `[PROMPT id=<hex> persona=<name>] <user text>` — always.
2. `[PERSONA_OVERLAY id=<hex>] <overlay>` — when the active persona has an
   overlay (identity + body / motion catalog).
3. `[BRIEF id=<hex>] <brief>` — when `prompt_brief` is enabled (default): the
   capabilities + world state + history + pre-fetched query results.

Read in that order: the overlay tells you *who* you are and what your body can
do; the brief tells you *what's available now* and what *just happened*; the
PROMPT text is the user's actual ask.

Mode changes are announced as `[mode] <prev> → <next>` so the operator sees the
channel go hot or cold.

## Status lines

- `[ws-connected] mode=<mode>` — attached; shows the current mode.
- `[mode] <prev> → <next>` — mode changed (from a `settings_change` or an idle
  re-probe).
- `[ws-disconnect] <err>` — connection dropped (logged only after a successful
  connect; boot-time retries stay silent).
- `[ws-settings-probe-failed]` / `[ws-pending-probe-failed]` — a REST probe
  failed (kept the previous mode / skipped that one recovery).

## Resilience

The listener is built so a live turn can't be silently stranded:

- **Connect-probe retry** — the mode probe is retried on connect (JarvYZ may
  still be booting on a reconnect); a single transient failure won't wedge the
  channel on the silent local default.
- **Idle re-probe** — mode is re-probed on idle (~30 s), so a mis-probed
  listener self-heals even without a `settings_change` event.
- **Pending recovery** — on connect *and* on any transition into external mode,
  it replays `/api/llm/external/pending`, so a prompt that fired before it
  attached (or before a mode-correction) is still surfaced — at full fidelity
  (persona + brief included).
- **De-dup** — ids already surfaced this process aren't re-emitted across a
  reconnect. A listener *restart* starts fresh and re-emits anything still
  blocked.
- **Backoff** — reconnect attempts are paced on every path (including a clean
  server close).
