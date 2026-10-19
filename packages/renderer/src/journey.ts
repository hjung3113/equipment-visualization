import { EVIDENCE_DASH, EVIDENCE_KO, PAINT, visible, type StateEvidence } from './overlay.js';
import type { Scene } from './scene.js';
import { estimateTextWidth } from './text.js';
import { el, formatNum, type SvgNode } from './svg.js';

/** One discrete hop, already placed on a Component by the host. The renderer only draws it; it draws no line between hops. */
export interface JourneyHopMark {
  number: number;
  componentId: string;
  evidence: StateEvidence;
}

export interface JourneyOverlay {
  hops: readonly JourneyHopMark[];
  /** The emphasised hop number. */
  selected?: number | null;
}

const BADGE_PX = 16;
const BADGE_GAP_PX = 3;
/** Gap between the badge row and the inner top edge of the component bbox, screen px. */
const INSET_PX = 2;
const NUMBER_PX = 10;
const MAX_BADGES = 4;
const SHOWN_WITH_CHIP = 3;

function badge(hop: JourneyHopMark, cx: number, cy: number, k: number, selected: boolean): SvgNode {
  const dash = EVIDENCE_DASH[hop.evidence];
  const attrs: Record<string, string> = {
    cx: formatNum(cx),
    cy: formatNum(cy),
    r: formatNum(BADGE_PX / 2 * k),
    fill: selected ? PAINT.selection : PAINT.board,
    stroke: selected ? PAINT.ink : PAINT.selection,
    'stroke-width': formatNum(selected ? 3 : 1.5),
    'vector-effect': 'non-scaling-stroke',
  };
  if (dash) attrs['stroke-dasharray'] = dash;
  return el('g', {
    'data-journey-hop': String(hop.number),
    'data-component-id': hop.componentId,
    ...(selected ? { 'data-selected': 'true' } : {}),
  }, [
    el('title', {}, [`hop ${hop.number} · ${hop.componentId} · ${EVIDENCE_KO[hop.evidence]}`]),
    el('circle', attrs),
    el('text', {
      x: formatNum(cx),
      y: formatNum(cy + 0.35 * NUMBER_PX * k),
      'text-anchor': 'middle',
      'font-family': 'inherit',
      'font-size': formatNum(NUMBER_PX * k),
      fill: selected ? PAINT.board : PAINT.ink,
      'pointer-events': 'none',
    }, [String(hop.number)]),
  ]);
}

/**
 * Journey layer: one numbered circle per hop on its Component, in a row on the inner top edge of the Component's
 * axis-aligned bbox (material discs use the bottom edge), upright in screen space. Ring dash = location evidence.
 * Discrete marks only: no connector, no motion. Badges take pointer events and carry `data-component-id`, so a click
 * selects the Component like any other part of it.
 */
export function buildJourneyLayer(scene: Scene, journey: JourneyOverlay, k: number): SvgNode {
  const byComponent = new Map<string, JourneyHopMark[]>();
  for (const hop of journey.hops) {
    const row = byComponent.get(hop.componentId);
    if (row) row.push(hop);
    else byComponent.set(hop.componentId, [hop]);
  }
  const nodes: SvgNode[] = [];
  for (const [componentId, row] of byComponent) {
    const comp = visible(scene, componentId);
    if (!comp) continue;
    const ordered = [...row].sort((a, b) => a.number - b.number);
    const overflow = ordered.length > MAX_BADGES;
    const shown = overflow ? ordered.slice(0, SHOWN_WITH_CHIP) : ordered;
    const hidden = overflow ? ordered.slice(SHOWN_WITH_CHIP) : [];
    const plus = overflow ? `+${hidden.length}` : null;
    const chipPx = plus ? estimateTextWidth(plus, NUMBER_PX, false) + 8 : 0;
    const rowPx = shown.length * BADGE_PX + Math.max(0, shown.length - 1) * BADGE_GAP_PX
      + (plus ? (shown.length > 0 ? BADGE_GAP_PX : 0) + chipPx : 0);
    const cy = comp.bbox.y0 + (INSET_PX + BADGE_PX / 2) * k;
    let xPx = -rowPx / 2;
    for (const hop of shown) {
      nodes.push(badge(hop, comp.center[0] + (xPx + BADGE_PX / 2) * k, cy, k, hop.number === journey.selected));
      xPx += BADGE_PX + BADGE_GAP_PX;
    }
    if (plus) {
      const chosen = hidden.some((hop) => hop.number === journey.selected);
      nodes.push(el('g', { 'data-journey-more': componentId, 'data-component-id': componentId }, [
        el('title', {}, [`${plus} · hop ${hidden.map((hop) => hop.number).join(', ')}`]),
        el('rect', {
          x: formatNum(comp.center[0] + xPx * k),
          y: formatNum(cy - BADGE_PX / 2 * k),
          width: formatNum(chipPx * k),
          height: formatNum(BADGE_PX * k),
          rx: formatNum(3 * k),
          fill: PAINT.board,
          stroke: chosen ? PAINT.ink : PAINT.selection,
          'stroke-width': formatNum(chosen ? 3 : 1.5),
          'vector-effect': 'non-scaling-stroke',
        }),
        el('text', {
          x: formatNum(comp.center[0] + (xPx + chipPx / 2) * k),
          y: formatNum(cy + 0.35 * NUMBER_PX * k),
          'text-anchor': 'middle',
          'font-family': 'inherit',
          'font-size': formatNum(NUMBER_PX * k),
          fill: PAINT.ink,
          'pointer-events': 'none',
        }, [plus]),
      ]));
    }
  }
  return el('g', { 'data-layer': 'journey' }, nodes);
}
