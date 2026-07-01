# yz-loom

The **Loom** satellite. Its first shipped surface is the **Loom console** —
dashboard **variant 8** (extracted from the in-core `V8` `ClaudeConsole`): a
full-screen console that reflects Loom's live state (conversation transcript,
mode, pending external prompts + tool calls, timers, WLED, LLM mode, announce).

## UI-only satellite

There is no backend here — **no Python package, no wheel, no process, no
`service` block**. The console reads JarvYZ's WS bus (transcript / mode /
timers / wled / llm-mode / announce / tool events) and fetches core's own
`/api/*` endpoints directly (same-origin when embedded). The only deliverable
is the **dynamic-module IIFE** (`yz-loom.iife.js`) + its `manifest.json`, which
JarvYZ's `SatelliteDashboardLoader` mounts for variant 8. The release workflow
builds and attaches exactly those two.

## Develop

```
cd ui
npm install
npm run dev          # standalone SPA (idle — no host WS / API)
npm run ship         # build the IIFE + install it into JarvYZ's modules dir
```

## Future: Loom's own avatar

The longer-term goal for this satellite is a fully **license-clean 3D mascot**
we author ourselves (to replace the Streamoji-derived character, whose license
prohibits redistribution as a standalone asset). That work — a headless
Blender/MakeHuman pipeline producing a Mixamo-rigged GLB consumed by **yz-body**
as a character — is not built yet; it will land here alongside the console when
ready.
