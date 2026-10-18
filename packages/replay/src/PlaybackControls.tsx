import { Button, ToggleGroup, ToggleGroupItem } from '@fops/ui';
import { SPEEDS, type PlaybackSpeed } from './use-playback.js';

export interface PlaybackControlsProps {
  playing: boolean;
  onPlay: () => void;
  onPause: () => void;
  speed: PlaybackSpeed;
  onSpeedChange: (speed: PlaybackSpeed) => void;
  /** Previous / next timeline breakpoint; null disables the button. */
  onPreviousBreakpoint: (() => void) | null;
  onNextBreakpoint: (() => void) | null;
  sequence: {
    /** The sequence-step toggle can be pressed (the entry step exists) or the mode is already active. */
    available: boolean;
    /** Shown next to the disabled toggle. */
    unavailableReason?: string;
    active: boolean;
    onToggle: () => void;
    /** Previous / next Record Sequence step; null at the ends. */
    onPrevious: (() => void) | null;
    onNext: (() => void) | null;
    /** The displayed step, shown in the status text while `active`. */
    step: { seq: number; at: string } | null;
  };
}

const isSpeed = (value: string): value is `${PlaybackSpeed}` => SPEEDS.some((speed) => String(speed) === value);

/** Presentational playback and debug-step controls; the page owns the cursor and the mode. */
export function PlaybackControls({ playing, onPlay, onPause, speed, onSpeedChange, onPreviousBreakpoint, onNextBreakpoint, sequence }: PlaybackControlsProps) {
  return (
    <div className="my-2 flex flex-wrap items-center gap-x-3 gap-y-2" role="group" aria-label="재생 컨트롤">
      <Button type="button" variant="outline" size="toolbar" onClick={playing ? onPause : onPlay}>{playing ? '일시정지' : '재생'}</Button>
      <ToggleGroup type="single" variant="outline" size="sm" aria-label="재생 속도" value={String(speed)}
        onValueChange={(value) => { if (isSpeed(value)) onSpeedChange(Number(value) as PlaybackSpeed); }}>
        {SPEEDS.map((value) => <ToggleGroupItem key={value} value={String(value)}>{`x${value}`}</ToggleGroupItem>)}
      </ToggleGroup>
      <Button type="button" variant="outline" size="toolbar" disabled={onPreviousBreakpoint === null} onClick={() => onPreviousBreakpoint?.()}>이전 단계</Button>
      <Button type="button" variant="outline" size="toolbar" disabled={onNextBreakpoint === null} onClick={() => onNextBreakpoint?.()}>다음 단계</Button>
      <span className="flex flex-wrap items-center gap-2 border-l border-border-subtle pl-3" role="group" aria-label="Sequence step (debug)">
        <Button type="button" variant={sequence.active ? 'secondary' : 'outline'} size="toolbar" aria-pressed={sequence.active} disabled={!sequence.available && !sequence.active}
          onClick={sequence.onToggle}>Sequence step</Button>
        {!sequence.available && !sequence.active && sequence.unavailableReason && <span>{sequence.unavailableReason}</span>}
        <Button type="button" variant="outline" size="toolbar" disabled={!sequence.active || sequence.onPrevious === null} onClick={() => sequence.onPrevious?.()}>이전 record</Button>
        <Button type="button" variant="outline" size="toolbar" disabled={!sequence.active || sequence.onNext === null} onClick={() => sequence.onNext?.()}>다음 record</Button>
        <span role="status" className="tabular-nums text-text-secondary">
          {sequence.active && sequence.step ? `Sequence step · Record Sequence ${sequence.step.seq} · ${sequence.step.at}` : ''}
        </span>
      </span>
    </div>
  );
}
