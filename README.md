# yz-loom

The **Loom integration kit** — everything a Claude Code session needs to *be*
Loom for a JarvYZ, built up iteratively. Two surfaces so far:

- **Loom console** — dashboard **variant 8** (extracted from the in-core `V8`
  `ClaudeConsole`): a full-screen console that reflects Loom's live state
  (conversation transcript, mode, pending external prompts + tool calls,
  timers, WLED, LLM mode, announce). Shipped as the dynamic-module IIFE.
- **Voice listener** — `companion/loom_listener.py`, the Claude-side WS+REST
  listener (see below).

## The console is a UI-only satellite

The console has no backend of its own — **no Python package, no wheel, no
process, no `service` block**. It reads JarvYZ's WS bus (transcript / mode /
timers / wled / llm-mode / announce / tool events) and fetches core's own
`/api/*` endpoints directly (same-origin when embedded). The only *served*
deliverable is the **dynamic-module IIFE** (`yz-loom.iife.js`) + its
`manifest.json`, which JarvYZ's `SatelliteDashboardLoader` mounts for variant 8.
The release workflow builds and attaches exactly those two.

### Develop (console)

```
cd ui
npm install
npm run dev          # standalone SPA (idle — no host WS / API)
npm run ship         # build the IIFE + install it into JarvYZ's modules dir
```

## Companion: voice listener

`companion/loom_listener.py` is the other half of Loom's dual channel: the
Monitor script a Claude Code session runs to *hear* JarvYZ. It's a Claude-side
**client** of JarvYZ (subscribes `/ws`, surfaces `[PROMPT]` / `[TOOL_CALL]` /
`[mode]` / `[<lang>]` lines, replays `/api/llm/external/pending` on reconnect),
not a served satellite artifact — so it isn't in the manifest, isn't bundled
into the IIFE, and the release workflow doesn't ship it. It lives here because
it's Loom integration; it does **not** get its own Python env. Run it with the
backend env (which already has `websockets`):

```
cd ../../backend
uv run python ../satellites/yz-loom/companion/loom_listener.py
# wait for: [ws-connected] mode=...
```

**Onboarding a fresh Claude:** point a zero-context Claude Code session at
[`companion/BECOME_LOOM.md`](companion/BECOME_LOOM.md) — a self-contained manual
that turns it into Loom (identity + how to run the listener + how to reply),
no prior project knowledge required.

Listener details — run, per-mode output, line formats, resilience:
[`companion/LISTENER.md`](companion/LISTENER.md). Server side of the protocol
(reply/pending API, event shapes, prompt_brief, mode model):
`backend/_docs/CLAUDE_MODE.md` in the core repo.

## Future: Loom's own avatar

The longer-term goal for this satellite is a fully **license-clean 3D mascot**
we author ourselves (to replace the Streamoji-derived character, whose license
prohibits redistribution as a standalone asset). That work — a headless
Blender/MakeHuman pipeline producing a Mixamo-rigged GLB consumed by **yz-body**
as a character — is not built yet; it will land here alongside the console when
ready.
