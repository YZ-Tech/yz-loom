#!/usr/bin/env node
// Copy the built IIFE + manifest to BOTH:
//   - frontend/public/modules/             (Vite source-of-truth for public assets)
//   - backend/jarvyz/web/static/modules/   (JarvYZ production-serve dir)
//
// Why both: JarvYZ serves backend/jarvyz/web/static/ directly; the frontend's
// Vite build copies public/ -> static/ as part of its pipeline. During dev
// iteration on the orbs module we don't want to require a full frontend
// rebuild just to deploy a new IIFE, so `npm run ship` lands it in both.
//
// Plus the manifest.json from the satellite root -> both targets, so the
// frontend registry can fetch /modules/yz-loom.manifest.json and the Python
// pipeline manifest reader picks it up too.
//
// Build-time drift check: assert the IIFE actually exports the names the
// manifest claims. Cross-platform (no `cp`).
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
// Layout: satellites/yz-loom/ui/scripts/ -> climb 4 levels to project root
const projectRoot = resolve(here, '..', '..', '..', '..')
const satelliteRoot = resolve(here, '..', '..')

const iifeSrc = resolve(here, '..', 'dist-lib', 'yz-loom.iife.js')
const manifestSrc = resolve(satelliteRoot, 'manifest.json')
// The Loom onboarding prompt — served so the "Become Loom" UI can fetch + copy
// its full text into the clipboard (works in any target session, any project).
const becomeLoomSrc = resolve(satelliteRoot, 'companion', 'BECOME_LOOM.md')

const iifeTargets = [
  resolve(projectRoot, 'frontend', 'public', 'modules', 'yz-loom.iife.js'),
  resolve(projectRoot, 'backend', 'jarvyz', 'web', 'static', 'modules', 'yz-loom.iife.js'),
]
const manifestTargets = [
  resolve(projectRoot, 'frontend', 'public', 'modules', 'yz-loom.manifest.json'),
  resolve(projectRoot, 'backend', 'jarvyz', 'web', 'static', 'modules', 'yz-loom.manifest.json'),
]
const becomeLoomTargets = [
  resolve(projectRoot, 'frontend', 'public', 'modules', 'yz-loom.become-loom.md'),
  resolve(projectRoot, 'backend', 'jarvyz', 'web', 'static', 'modules', 'yz-loom.become-loom.md'),
]

// -- Sanity: IIFE exists --------------------------------------------------
try {
  statSync(iifeSrc)
} catch {
  console.error(`[error] ${iifeSrc} not found. Run \`npm run build:lib\` first.`)
  process.exit(1)
}

// -- Drift check: manifest claims should resolve in the IIFE --------------
if (existsSync(manifestSrc)) {
  const manifest = JSON.parse(readFileSync(manifestSrc, 'utf8'))
  const iifeBody = readFileSync(iifeSrc, 'utf8')
  const claimed = new Set()
  for (const d of manifest.dashboards || []) claimed.add(d.component)
  for (const e of manifest.exports || []) claimed.add(e.id)
  const missing = []
  for (const name of claimed) {
    const re = new RegExp(`\\b${name}\\b`)
    if (!re.test(iifeBody)) missing.push(name)
  }
  if (missing.length) {
    console.error(
      `[error] manifest claims exports the IIFE doesn't appear to provide:\n  ${missing.join('\n  ')}\n` +
      `Check satellites/yz-loom/ui/src/index.ts.`,
    )
    process.exit(1)
  }
  console.log(`[ok] manifest drift check passed (${claimed.size} exports validated)`)
} else {
  console.warn(`[warn] ${manifestSrc} not found — skipping drift check`)
}

// -- Copy IIFE ------------------------------------------------------------
console.log(`[ok] ${iifeSrc}`)
for (const dst of iifeTargets) {
  mkdirSync(dirname(dst), { recursive: true })
  copyFileSync(iifeSrc, dst)
  const { size } = statSync(dst)
  console.log(`  -> ${dst}`)
  console.log(`     ${(size / 1024).toFixed(1)} KB`)
}

// -- Copy manifest.json ---------------------------------------------------
if (existsSync(manifestSrc)) {
  console.log(`[ok] ${manifestSrc}`)
  for (const dst of manifestTargets) {
    mkdirSync(dirname(dst), { recursive: true })
    copyFileSync(manifestSrc, dst)
    console.log(`  -> ${dst}`)
  }
}

// -- Copy BECOME_LOOM.md (the onboarding prompt) --------------------------
if (existsSync(becomeLoomSrc)) {
  console.log(`[ok] ${becomeLoomSrc}`)
  for (const dst of becomeLoomTargets) {
    mkdirSync(dirname(dst), { recursive: true })
    copyFileSync(becomeLoomSrc, dst)
    console.log(`  -> ${dst}`)
  }
}
