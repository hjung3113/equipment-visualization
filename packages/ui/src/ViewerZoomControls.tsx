import { Maximize2, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@ap/ui';

/** Same shape as the renderer's `TopViewerControls`; declared here so this package never imports `@eqv/renderer`. */
export interface ViewerZoomControlsState {
  zoomIn(): void;
  zoomOut(): void;
  fit(): void;
  canZoomIn: boolean;
  canZoomOut: boolean;
  canFit: boolean;
}

export interface ViewerZoomControlsProps {
  controls: ViewerZoomControlsState;
  labels: { zoomIn: string; zoomOut: string; fit: string };
}

export function ViewerZoomControls({ controls, labels }: ViewerZoomControlsProps) {
  return (
    <div role="group" className="flex gap-1">
      <Button type="button" variant="secondary" size="toolbar" disabled={!controls.canZoomIn} onClick={controls.zoomIn}><ZoomIn className="size-3.5" aria-hidden />{labels.zoomIn}</Button>
      <Button type="button" variant="secondary" size="toolbar" disabled={!controls.canZoomOut} onClick={controls.zoomOut}><ZoomOut className="size-3.5" aria-hidden />{labels.zoomOut}</Button>
      <Button type="button" variant="secondary" size="toolbar" disabled={!controls.canFit} onClick={controls.fit}><Maximize2 className="size-3.5" aria-hidden />{labels.fit}</Button>
    </div>
  );
}
