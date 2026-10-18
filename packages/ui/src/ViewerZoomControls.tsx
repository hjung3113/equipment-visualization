import { Button } from '@fops/ui';

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
      <Button type="button" variant="outline" size="sm" disabled={!controls.canZoomIn} onClick={controls.zoomIn}>{labels.zoomIn}</Button>
      <Button type="button" variant="outline" size="sm" disabled={!controls.canZoomOut} onClick={controls.zoomOut}>{labels.zoomOut}</Button>
      <Button type="button" variant="outline" size="sm" disabled={!controls.canFit} onClick={controls.fit}>{labels.fit}</Button>
    </div>
  );
}
