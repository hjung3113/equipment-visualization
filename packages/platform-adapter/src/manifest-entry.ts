// @eqv/platform-adapter/manifest — what a host registers at startup, with no React, screen, replay or renderer module reachable.
// The screens load lazily from the package root.
export { eqvManifest, TOPVIEW_SCREEN, FOCUS_SCREEN } from './manifest.js';
export { topviewContext, topviewEvents } from './endpoints.js';
export type { TopviewContextParams, TopviewEventsParams } from './endpoints.js';
