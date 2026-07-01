// Thin API factory for the loom module.
//
// The console has no backend of its own — it reads core's WS bus and fetches
// core's /api/* endpoints directly (same-origin when embedded). But the host's
// SatelliteDashboardLoader REQUIRES every satellite IIFE to export a
// `createSatelliteApi` factory (it loads that export and renders a fallback if
// it's missing), so we ship a minimal one carrying the resolved apiBase for
// prop-shape parity.

export interface LoomApi {
  readonly apiBase: string
}

export function createSatelliteApi({ apiBase = '' }: { apiBase?: string } = {}): LoomApi {
  const base = apiBase.endsWith('/') ? apiBase.slice(0, -1) : apiBase
  return { apiBase: base }
}
