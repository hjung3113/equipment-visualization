import {
  cloneElement, isValidElement, useEffect, useLayoutEffect, useMemo, useRef, useState,
  type FocusEvent, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactElement, type ReactNode,
} from 'react';
import {
  bringIntoView, clampCenter, defaultCamera, fitScale, panByFraction, pxPerUnit, screenToLayout,
  viewBoxOf, zoomAtPoint, zoomFromWheel, ZOOM_MAX, ZOOM_MIN, type Camera, type Frame, type Size,
} from './camera.js';
import { buildJourneyLayer, type JourneyOverlay } from './journey.js';
import { buildOverlay, buildReplayLayer, type Highlight, type ReplayOverlay } from './overlay.js';
import { buildScene, type Scene } from './scene.js';
import { formatNum, renderNode } from './svg.js';
import type { TopViewProps } from './TopView.js';

/** Zoom actions and capabilities the viewer hands to a host-rendered control slot. */
export interface TopViewerControls {
  zoomIn(): void;
  zoomOut(): void;
  fit(): void;
  canZoomIn: boolean;
  canZoomOut: boolean;
  canFit: boolean;
}

export interface TopViewerProps extends TopViewProps {
  /** `undefined` keeps the selection inside the viewer. Any other value, including null, is controlled. */
  selectedId?: string | null;
  /** Fires for every user change in both the internal and the controlled selection. */
  onSelectedChange?: (id: string | null) => void;
  /** Rings the listed components and draws a dashed line per observed transfer. Display only. */
  highlight?: Highlight | null;
  /** Cursor-time replay layer: activity rings, material tokens, conflicts, illustrative ghosts. Given, never computed here. */
  replay?: ReplayOverlay | null;
  /** One wafer's discrete hops as numbered badges on their Components. Given, never computed here; draws no line between hops
   * and, while set, a selected Component draws no Transfer Capability segments. */
  journey?: JourneyOverlay | null;
  /** Host slot for the zoom controls. Absent: the default 확대/축소/맞춤 buttons render. */
  renderControls?: (controls: TopViewerControls) => ReactNode;
}

interface Drag {
  pointerId: number;
  componentId: string | null;
  captured: boolean;
  x: number;
  y: number;
  cx: number;
  cy: number;
  zoom: number;
  px: number;
  moved: boolean;
}

interface ViewState {
  width: number;
  height: number;
  frame: Frame;
}

const ZOOM_STEP = 1.25;

const BUTTON_STYLE = {
  backgroundColor: 'var(--eqv-board, #fbfdff)',
  color: 'var(--eqv-ink, #101828)',
  borderColor: 'var(--eqv-secondary, #374151)',
  borderStyle: 'solid',
  borderWidth: 1,
  font: 'inherit',
  padding: '4px 8px',
  cursor: 'pointer',
} as const;

function buttonStyle(disabled: boolean) {
  return disabled ? { ...BUTTON_STYLE, opacity: 0.4, cursor: 'default' } : BUTTON_STYLE;
}

function viewBoxAttr(camera: Camera, view: Size, frame: Frame): string {
  const box = viewBoxOf(camera, view, frame);
  return `${formatNum(box.x)} ${formatNum(box.y)} ${formatNum(box.width)} ${formatNum(box.height)}`;
}

function componentIdFrom(target: EventTarget | null, root: Element | null): string | null {
  let node: Node | null = target instanceof Node ? target : null;
  while (node instanceof Element && node !== root) {
    const id = node.getAttribute('data-component-id');
    if (id) {
      if (node.getAttribute('data-hidden') === 'true') {
        node = node.parentElement;
        continue;
      }
      return id;
    }
    node = node.parentElement;
  }
  return null;
}

function withKey(node: ReactNode, key: string): ReactNode {
  if (!isValidElement(node)) return node;
  return cloneElement(node as ReactElement, { key });
}

/** Board, component tree and annotation layers. The scene's capability layer is left out. */
function staticParts(scene: Scene): {
  board: ReactNode;
  tree: ReactNode[];
  interfaces: ReactNode;
  labels: ReactNode;
  badges: ReactNode;
  chips: ReactNode;
} {
  let board: ReactNode = null;
  const tree: ReactNode[] = [];
  const layers = new Map<string, ReactNode>();
  for (const child of scene.node.children) {
    if (typeof child === 'string') continue;
    const layer = child.attrs['data-layer'];
    if (layer === 'capabilities') continue;
    if (layer) {
      layers.set(layer, renderNode(child));
      continue;
    }
    if (child.attrs['data-component-id']) {
      tree.push(withKey(renderNode(child), child.attrs['data-component-id']));
      continue;
    }
    board = renderNode(child);
  }
  return {
    board,
    tree,
    interfaces: layers.get('interfaces') ?? null,
    labels: layers.get('labels') ?? null,
    badges: layers.get('badges') ?? null,
    chips: layers.get('chips') ?? null,
  };
}

/**
 * Interactive Top View. The scene tree is memoised per committed scene, and selection only
 * updates `aria-pressed` and the overlay, so a click does not rebuild the picture.
 */
export function TopViewer({
  layout, width, height, labels, layers, visibleLevelIds, selectedId, onSelectedChange, highlight, replay, journey, renderControls,
}: TopViewerProps) {
  const controlled = selectedId !== undefined;
  const [internalSelection, setInternalSelection] = useState<string | null>(null);
  const [camera, setCamera] = useState(() => defaultCamera(layout.viewBox));
  const [committedPx, setCommittedPx] = useState(() => fitScale({ width, height }, layout.viewBox));
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [modality, setModality] = useState<'pointer' | 'keyboard'>('pointer');
  const [sceneEpoch, setSceneEpoch] = useState({ layout, width, height, labels, layers, visibleLevelIds });

  const layoutChanged = sceneEpoch.layout !== layout;
  const sceneInputsChanged = layoutChanged
    || sceneEpoch.width !== width
    || sceneEpoch.height !== height
    || sceneEpoch.labels !== labels
    || sceneEpoch.layers !== layers
    || sceneEpoch.visibleLevelIds !== visibleLevelIds;
  let viewCamera = camera;
  let scenePx = committedPx;
  if (sceneInputsChanged) {
    if (layoutChanged) {
      viewCamera = defaultCamera(layout.viewBox);
      scenePx = fitScale({ width, height }, layout.viewBox);
      setInternalSelection(null);
      setHoverId(null);
      setFocusedId(null);
      setModality('pointer');
    } else {
      viewCamera = clampCenter(camera, layout.viewBox);
      scenePx = fitScale({ width, height }, layout.viewBox) * viewCamera.zoom;
    }
    setSceneEpoch({ layout, width, height, labels, layers, visibleLevelIds });
    if (viewCamera !== camera) setCamera(viewCamera);
    if (scenePx !== committedPx) setCommittedPx(scenePx);
  }

  let hover = hoverId;
  let focused = focusedId;
  let mode = modality;
  let selection = controlled ? (selectedId ?? null) : internalSelection;
  if (layoutChanged) {
    hover = null;
    focused = null;
    mode = 'pointer';
    if (!controlled) selection = null;
  }

  const svgRef = useRef<SVGSVGElement>(null);
  const cameraRef = useRef(viewCamera);
  const viewRef = useRef<ViewState>({ width, height, frame: layout.viewBox });
  const dragRef = useRef<Drag | null>(null);
  const clickTargetRef = useRef<Pick<Drag, 'componentId'> | null>(null);
  const suppressClick = useRef(false);
  const pressedRef = useRef<string | null>(null);
  const relayoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queueRelayoutRef = useRef<() => void>(() => {});
  const layoutSeen = useRef(layout);

  const scene = useMemo(
    () => buildScene(layout, {
      width, height, pxPerUnit: scenePx, labels, layers, visibleLevelIds, interactive: true,
    }),
    [layout, width, height, scenePx, labels, layers, visibleLevelIds],
  );
  const parts = useMemo(() => staticParts(scene), [scene]);
  const focusForOverlay = mode === 'keyboard' ? focused : null;
  const showAll = layers?.capabilities ?? false;
  const overlay = useMemo(
    () => buildOverlay(scene, {
      selectedId: selection, hoveredId: hover, focusedId: focusForOverlay, showAllCapabilities: showAll, highlight,
      suppressCapabilities: journey != null,
    }, 1 / scene.pxPerUnit),
    [scene, selection, hover, focusForOverlay, showAll, highlight, journey != null],
  );
  const overlayNodes = useMemo(() => ({
    interaction: renderNode(overlay.interaction),
    capabilities: renderNode(overlay.capabilities),
    highlight: overlay.highlight.children.length ? renderNode(overlay.highlight) : null,
  }), [overlay]);
  const replayNodes = useMemo(
    () => (replay ? renderNode(buildReplayLayer(scene, replay, 1 / scene.pxPerUnit)) : null),
    [scene, replay],
  );

  const journeyNodes = useMemo(
    () => (journey ? renderNode(buildJourneyLayer(scene, journey, 1 / scene.pxPerUnit)) : null),
    [scene, journey],
  );

  const queueRelayout = () => {
    if (relayoutTimer.current != null) clearTimeout(relayoutTimer.current);
    relayoutTimer.current = setTimeout(() => {
      relayoutTimer.current = null;
      const view = viewRef.current;
      setCommittedPx(fitScale(view, view.frame) * cameraRef.current.zoom);
    }, 150);
  };

  useLayoutEffect(() => {
    cameraRef.current = viewCamera;
    viewRef.current = { width, height, frame: layout.viewBox };
    queueRelayoutRef.current = queueRelayout;
    if (layoutSeen.current !== layout) {
      layoutSeen.current = layout;
      dragRef.current = null;
      clickTargetRef.current = null;
    }
  });

  useLayoutEffect(() => {
    return () => {
      if (relayoutTimer.current != null) {
        clearTimeout(relayoutTimer.current);
        relayoutTimer.current = null;
      }
    };
  }, [layout, width, height, labels, layers, visibleLevelIds]);

  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const mark = (id: string | null, pressed: boolean) => {
      if (!id) return;
      const node = svg.querySelector(`[data-component-id="${id}"]`);
      if (node?.hasAttribute('aria-pressed')) node.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    };
    if (pressedRef.current === selection) mark(selection, true);
    else {
      mark(pressedRef.current, false);
      mark(selection, true);
    }
    pressedRef.current = selection;
  }, [scene, selection]);

  useLayoutEffect(() => {
    if (mode !== 'keyboard' || focused == null) return;
    const geom = scene.components.get(focused);
    if (!geom || geom.hidden) return;
    setCamera((prev) => {
      const next = bringIntoView(prev, geom.bbox, { width, height }, layout.viewBox);
      return next.cx === prev.cx && next.cy === prev.cy && next.zoom === prev.zoom ? prev : next;
    });
    // Only when keyboard focus lands. A later resize or settled relayout must not pull the centre back.
  }, [focused, mode, layout]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return undefined;
    const onWheel = (event: WheelEvent) => {
      const cam = cameraRef.current;
      const view = viewRef.current;
      const requested = zoomFromWheel(cam.zoom, event.deltaY, event.deltaMode, view.height);
      const rect = svg.getBoundingClientRect();
      const [x, y] = screenToLayout(cam, view, view.frame, event.clientX - rect.left, event.clientY - rect.top);
      const next = zoomAtPoint(cam, requested, { x, y }, view.frame);
      if (next.zoom === cam.zoom) return;
      event.preventDefault();
      cameraRef.current = next;
      setCamera(next);
      queueRelayoutRef.current();
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, []);

  const commit = (next: string | null) => {
    if (next === selection) return;
    if (!controlled) setInternalSelection(next);
    onSelectedChange?.(next);
  };

  const applyCamera = (next: Camera, relayout: boolean) => {
    if (next.zoom === viewCamera.zoom && next.cx === viewCamera.cx && next.cy === viewCamera.cy) return;
    cameraRef.current = next;
    setCamera(next);
    if (relayout) queueRelayout();
  };

  const zoomBy = (factor: number) => {
    const next = zoomAtPoint(viewCamera, viewCamera.zoom * factor, { x: viewCamera.cx, y: viewCamera.cy }, layout.viewBox);
    applyCamera(next, next.zoom !== viewCamera.zoom);
  };

  const fit = () => {
    const next = defaultCamera(layout.viewBox);
    applyCamera(next, next.zoom !== viewCamera.zoom);
  };

  const pan = (fx: number, fy: number) => {
    applyCamera(panByFraction(viewCamera, fx, fy, { width, height }, layout.viewBox), false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key;
    if (!['Tab', 'Escape', 'Enter', ' ', '+', '=', '-', '0', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(key)) return;
    setFocusedId(componentIdFrom(event.target, svgRef.current));
    setModality('keyboard');
    if (key === 'Tab') {
      return;
    }
    if (key === 'Escape') {
      commit(null);
      return;
    }
    if (key === 'Enter' || key === ' ') {
      const id = componentIdFrom(event.target, svgRef.current);
      if (!id) return;
      if (key === ' ') event.preventDefault();
      commit(id === selection ? null : id);
      return;
    }
    if (key === '+' || key === '=' || key === '-' || key === '0' || key.startsWith('Arrow')) {
      event.preventDefault();
      if (key === '+' || key === '=') zoomBy(ZOOM_STEP);
      else if (key === '-') zoomBy(1 / ZOOM_STEP);
      else if (key === '0') fit();
      else if (key === 'ArrowLeft') pan(-0.1, 0);
      else if (key === 'ArrowRight') pan(0.1, 0);
      else if (key === 'ArrowUp') pan(0, -0.1);
      else if (key === 'ArrowDown') pan(0, 0.1);
    }
  };

  const onPointerDown = (event: PointerEvent<SVGSVGElement>) => {
    setModality('pointer');
    suppressClick.current = false;
    dragRef.current = {
      pointerId: event.pointerId,
      componentId: componentIdFrom(event.target, svgRef.current),
      captured: false,
      x: event.clientX,
      y: event.clientY,
      cx: viewCamera.cx,
      cy: viewCamera.cy,
      zoom: viewCamera.zoom,
      px: pxPerUnit(viewCamera, { width, height }, layout.viewBox),
      moved: false,
    };
    clickTargetRef.current = dragRef.current;
  };

  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.moved) {
      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 4) return;
      drag.moved = true;
      const svg = svgRef.current;
      if (svg && typeof svg.setPointerCapture === 'function') {
        try {
          svg.setPointerCapture(event.pointerId);
          drag.captured = true;
        } catch { /* setPointerCapture is missing or throws in jsdom */ }
      }
      setHoverId(null);
    }
    const next = clampCenter({
      zoom: drag.zoom,
      cx: drag.cx - (event.clientX - drag.x) / drag.px,
      cy: drag.cy - (event.clientY - drag.y) / drag.px,
    }, layout.viewBox);
    cameraRef.current = next;
    setCamera(next);
  };

  const endDrag = (event: PointerEvent<SVGSVGElement>, cancel: boolean) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    const svg = svgRef.current;
    if (drag.captured && svg && typeof svg.releasePointerCapture === 'function') {
      try {
        if (typeof svg.hasPointerCapture !== 'function' || svg.hasPointerCapture(event.pointerId)) {
          svg.releasePointerCapture(event.pointerId);
        }
      } catch { /* capture APIs are incomplete in jsdom */ }
    }
    if (cancel || drag.moved) suppressClick.current = true;
  };

  const onClick = (event: MouseEvent<SVGSVGElement>) => {
    const target = clickTargetRef.current;
    clickTargetRef.current = null;
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    const id = target ? target.componentId : componentIdFrom(event.target, svgRef.current);
    commit(id == null || id === selection ? null : id);
  };

  const onPointerOver = (event: PointerEvent<SVGSVGElement>) => {
    if (dragRef.current?.moved) return;
    setHoverId(componentIdFrom(event.target, svgRef.current));
  };

  const onPointerOut = (event: PointerEvent<SVGSVGElement>) => {
    if (dragRef.current?.moved) {
      setHoverId(null);
      return;
    }
    const next = event.relatedTarget;
    if (!(next instanceof Node) || !svgRef.current?.contains(next)) {
      setHoverId(null);
      return;
    }
    setHoverId(componentIdFrom(next, svgRef.current));
  };

  const onFocus = (event: FocusEvent<SVGSVGElement>) => {
    setFocusedId(componentIdFrom(event.target, svgRef.current));
  };

  const onBlur = (event: FocusEvent<SVGSVGElement>) => {
    const next = event.relatedTarget;
    if (next instanceof Node && svgRef.current?.contains(next)) {
      setFocusedId(componentIdFrom(next, svgRef.current));
      return;
    }
    setFocusedId(null);
  };

  const home = defaultCamera(layout.viewBox);
  const zoomInDisabled = viewCamera.zoom >= ZOOM_MAX;
  const zoomOutDisabled = viewCamera.zoom <= ZOOM_MIN;
  const fitDisabled = viewCamera.zoom === ZOOM_MIN && viewCamera.cx === home.cx && viewCamera.cy === home.cy;

  return (
    <div style={{ position: 'relative', width, height }} onKeyDown={onKeyDown}>
      <svg
        ref={svgRef}
        xmlns="http://www.w3.org/2000/svg"
        viewBox={viewBoxAttr(viewCamera, { width, height }, layout.viewBox)}
        width={width}
        height={height}
        role="group"
        aria-label={layout.name}
        tabIndex={0}
        style={{ display: 'block' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(event) => endDrag(event, false)}
        onPointerCancel={(event) => endDrag(event, true)}
        onClick={onClick}
        onPointerOver={onPointerOver}
        onPointerOut={onPointerOut}
        onFocus={onFocus}
        onBlur={onBlur}
      >
        {parts.board}
        {parts.tree}
        {!overlayNodes.highlight && overlayNodes.interaction}
        {parts.interfaces}
        {overlayNodes.capabilities}
        {replayNodes}
        {journeyNodes}
        {overlayNodes.highlight}
        {overlayNodes.highlight && overlayNodes.interaction}
        {parts.labels}
        {parts.badges}
        {parts.chips}
      </svg>
      <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 4 }}>
        {renderControls ? renderControls({
          zoomIn: () => zoomBy(ZOOM_STEP),
          zoomOut: () => zoomBy(1 / ZOOM_STEP),
          fit,
          canZoomIn: !zoomInDisabled,
          canZoomOut: !zoomOutDisabled,
          canFit: !fitDisabled,
        }) : (
          <>
            <button type="button" aria-label="확대" disabled={zoomInDisabled} style={buttonStyle(zoomInDisabled)} onClick={() => zoomBy(ZOOM_STEP)}>확대</button>
            <button type="button" aria-label="축소" disabled={zoomOutDisabled} style={buttonStyle(zoomOutDisabled)} onClick={() => zoomBy(1 / ZOOM_STEP)}>축소</button>
            <button type="button" aria-label="맞춤" disabled={fitDisabled} style={buttonStyle(fitDisabled)} onClick={fit}>맞춤</button>
          </>
        )}
      </div>
    </div>
  );
}
