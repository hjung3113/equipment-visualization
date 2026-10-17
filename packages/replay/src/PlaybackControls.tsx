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
    /** The sequence-step toggle can be pressed (a kept step exists). */
    available: boolean;
    active: boolean;
    onToggle: () => void;
    /** Previous / next Record Sequence step; null at the ends. */
    onPrevious: (() => void) | null;
    onNext: (() => void) | null;
    /** The displayed step, shown in the status text while `active`. */
    step: { seq: number; at: string } | null;
  };
}

/** Presentational playback and debug-step controls; the page owns the cursor and the mode. */
export function PlaybackControls({ playing, onPlay, onPause, speed, onSpeedChange, onPreviousBreakpoint, onNextBreakpoint, sequence }: PlaybackControlsProps) {
  return (
    <div className="eqv-rp-controls" role="group" aria-label="재생 컨트롤">
      <button type="button" className="eqv-rp-btn" onClick={playing ? onPause : onPlay}>{playing ? '일시정지' : '재생'}</button>
      <label>속도{' '}
        <select value={String(speed)} onChange={(event) => onSpeedChange(Number(event.target.value) as PlaybackSpeed)}>
          {SPEEDS.map((value) => <option key={value} value={String(value)}>{`x${value}`}</option>)}
        </select>
      </label>
      <button type="button" className="eqv-rp-btn" disabled={onPreviousBreakpoint === null} onClick={() => onPreviousBreakpoint?.()}>이전 단계</button>
      <button type="button" className="eqv-rp-btn" disabled={onNextBreakpoint === null} onClick={() => onNextBreakpoint?.()}>다음 단계</button>
      <span className="eqv-rp-controls-sep" role="group" aria-label="Sequence step (debug)">
        <button type="button" className="eqv-rp-btn" aria-pressed={sequence.active} disabled={!sequence.available && !sequence.active}
          onClick={sequence.onToggle}>Sequence step</button>
        <button type="button" className="eqv-rp-btn" disabled={!sequence.active || sequence.onPrevious === null} onClick={() => sequence.onPrevious?.()}>이전 record</button>
        <button type="button" className="eqv-rp-btn" disabled={!sequence.active || sequence.onNext === null} onClick={() => sequence.onNext?.()}>다음 record</button>
        <span role="status" className="eqv-rp-controls-status">
          {sequence.active && sequence.step ? `Sequence step · Record Sequence ${sequence.step.seq} · ${sequence.step.at}` : ''}
        </span>
      </span>
    </div>
  );
}
