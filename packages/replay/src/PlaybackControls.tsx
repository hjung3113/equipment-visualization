import { useId } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { Button, ToggleGroup, ToggleGroupItem, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@ap/ui';
import { SPEEDS, type PlaybackSpeed } from './use-playback.js';
import { wallClockText } from './words.js';

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
  const reasonId = useId();
  const unavailable = !sequence.available && !sequence.active && sequence.unavailableReason !== undefined;
  return (
    <TooltipProvider>
      <div className="my-2 flex flex-wrap items-center gap-x-3 gap-y-2" role="group" aria-label="재생 컨트롤">
      <Button type="button" variant="secondary" size="toolbar" onClick={playing ? onPause : onPlay}>
        {playing ? <Pause className="size-3.5" aria-hidden /> : <Play className="size-3.5" aria-hidden />}
        {playing ? '일시정지' : '재생'}
      </Button>
      <ToggleGroup type="single" variant="outline" size="sm" appearance="filter" aria-label="재생 속도" value={String(speed)}
        onValueChange={(value) => { if (isSpeed(value)) onSpeedChange(Number(value) as PlaybackSpeed); }}>
        {SPEEDS.map((value) => <ToggleGroupItem key={value} value={String(value)} appearance="selected-filter">{`x${value}`}</ToggleGroupItem>)}
      </ToggleGroup>
      <Button type="button" variant="secondary" size="toolbar" disabled={onPreviousBreakpoint === null} onClick={() => onPreviousBreakpoint?.()}>
        <SkipBack className="size-3.5" aria-hidden />이전 단계
      </Button>
      <Button type="button" variant="secondary" size="toolbar" disabled={onNextBreakpoint === null} onClick={() => onNextBreakpoint?.()}>
        <SkipForward className="size-3.5" aria-hidden />다음 단계
      </Button>
      <span className="flex flex-wrap items-center gap-2 border-l border-border-subtle pl-3" role="group" aria-label="기록 단위 보기 (디버그)">
        {unavailable ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <Button type="button" variant="outline" size="toolbar" aria-pressed={sequence.active} disabled
                  aria-describedby={reasonId} onClick={sequence.onToggle}>기록 단위 보기</Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>{sequence.unavailableReason}</TooltipContent>
          </Tooltip>
        ) : (
          <Button type="button" variant={sequence.active ? 'secondary' : 'outline'} size="toolbar" aria-pressed={sequence.active}
            disabled={!sequence.available && !sequence.active} onClick={sequence.onToggle}>기록 단위 보기</Button>
        )}
        {unavailable && <span id={reasonId}>{sequence.unavailableReason}</span>}
        <Button type="button" variant="secondary" size="toolbar" disabled={!sequence.active || sequence.onPrevious === null} onClick={() => sequence.onPrevious?.()}>
          <ChevronLeft className="size-3.5" aria-hidden />이전 기록
        </Button>
        <Button type="button" variant="secondary" size="toolbar" disabled={!sequence.active || sequence.onNext === null} onClick={() => sequence.onNext?.()}>
          <ChevronRight className="size-3.5" aria-hidden />다음 기록
        </Button>
        <span role="status" className="tabular-nums text-text-secondary">
          {sequence.active && sequence.step ? `기록 단위 · Record Sequence ${sequence.step.seq} · ${wallClockText(sequence.step.at)}` : ''}
        </span>
      </span>
      </div>
    </TooltipProvider>
  );
}
