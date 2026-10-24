import { contextCapabilities, type ModuleManifest } from '@ap/contracts';

/** Bare screen ids; the host registers them as `eqv:<id>` (ADR-0053). */
export const TOPVIEW_SCREEN = 'topview';
export const FOCUS_SCREEN = 'focus';

const GROUP = 'eqv:equipment';
const PERMISSION = 'eqv:view';
const noFeatures = { export: false, savedView: false, annotate: false, compare: false } as const;

/**
 * The EV host-module manifest (host contract 1). Read-only screens (ADR-0012 first scope). Names are Candidates until AP #334.
 * Routes: `topview` is the module prefix itself (path `''`, the group's primary screen, reached from the sidebar with no equipment),
 * `focus` is its child (`<prefix>/focus`). The equipment id travels as the page key `equipment` (`?equipment=`), not a route param:
 * AP's registry rejects a parent whose route needs params and needs exactly one primary screen per group. 177d shows a
 * "pick an equipment" state when the key is absent and copies it into the endpoint params `{ equipmentId }`.
 * `requiresScope: false` on both screens: an equipment is addressed by that page key, not by a Scope selection;
 * the endpoints re-check access on the server.
 */
export const eqvManifest: ModuleManifest = {
  module: { id: 'eqv', label: { ko: '설비 Top View', en: 'Equipment Top View' }, contract: 1, languages: ['ko', 'en'] },
  requires: ['query'],
  optional: ['detailSlot'],
  groups: [{ id: GROUP, label: { ko: '설비', en: 'Equipment' } }],
  screens: [
    {
      id: TOPVIEW_SCREEN,
      group: GROUP,
      label: { ko: '설비 Top View', en: 'Equipment Top View' },
      description: { ko: '설비 구성요소 배치와 재생 시점의 자재 위치를 보여줍니다.', en: 'Shows the equipment layout and where material sits at the replay cursor.' },
      path: '',
      primary: true,
      permission: PERMISSION,
      requiresScope: false,
      // The board is drawn for the applied time window (topview-context / topview-events are time-projected).
      context: contextCapabilities({ time: 'apply' }),
      pageType: 'overview',
      features: noFeatures,
      pageKeys: ['equipment'],
    },
    {
      id: FOCUS_SCREEN,
      group: GROUP,
      label: { ko: 'Focus', en: 'Focus' },
      description: { ko: 'Top View, Gantt, Occurrence 목록을 하나의 커서로 함께 재생합니다.', en: 'Replays the Top View, Gantt and Occurrence list on one shared cursor.' },
      path: 'focus',
      permission: PERMISSION,
      requiresScope: false,
      context: contextCapabilities({ time: 'apply' }),
      pageType: 'analysis',
      features: noFeatures,
      // `equipment` selects the equipment; the entityType/anchor pair survives navigation on this route.
      pageKeys: ['equipment', 'entityType', 'anchor'],
      parent: TOPVIEW_SCREEN,
    },
  ],
};
