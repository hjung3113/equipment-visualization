// @eqv/platform-adapter — the analytics-platform host module (ADR-0012, ADR-0013). The only package that imports @ap/contracts.
export { eqvManifest, TOPVIEW_SCREEN, FOCUS_SCREEN } from './manifest.js';
export { topviewContext, topviewEvents } from './endpoints.js';
export type { TopviewContextParams, TopviewEventsParams } from './endpoints.js';
