// Lib (IIFE) entry. The IIFE attaches these exports to `window.YzLoom`;
// JarvYZ loads it via @yz-dev/react-dynamic-module and looks up
// `createSatelliteApi` (api factory) + `ClaudeConsole` (the variant-8
// component) by name.

export { ClaudeConsole } from './dashboards'
export type { ClaudeConsoleProps } from './dashboards'
export { createSatelliteApi } from './lib/api'
export type { LoomApi } from './lib/api'
export type { WSApi } from './lib/ws'
