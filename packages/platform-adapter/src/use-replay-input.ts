import { useEffect, useReducer, useRef, useState } from 'react';
import type { ModuleHost } from '@ap/contracts';
import { readHostProps, type HostProps } from './host-props.js';
import { loadReplayInput, type Settled } from './replay-load.js';

/** The loaded state of a screen: `loading` until the load for the current equipment and time settles. */
export type ReplayLoad = { kind: 'loading' } | Settled;

/**
 * One load per (equipment, applied time). The host props are re-read on every `host.subscribe` change. A new identity aborts the
 * previous load (one `AbortController` per load, chained to `host.signal`); its late result is dropped, and the state is keyed by
 * identity so a frame of another equipment or window is never shown. The anchor is not a query input: `FocusView` re-enters on it.
 * `host.status` is touched only for `forbidden` (`auth_required`) and to return to `ready` afterwards.
 */
export function useReplayScreen(host: ModuleHost): { props: HostProps; load: ReplayLoad | null; resetKey: string } {
  const [, refresh] = useReducer((count: number) => count + 1, 0);
  useEffect(() => host.subscribe(refresh), [host]);
  const props = readHostProps(host);
  const { equipment } = props;
  const applied = props.time.kind === 'applied' ? props.time : null;
  const from = applied?.from ?? null;
  const to = applied?.to ?? null;
  const resetKey = JSON.stringify([equipment, from, to]);
  const loadable = equipment !== null && from !== null && to !== null;
  const [settled, setSettled] = useState<{ key: string; load: Settled } | null>(null);
  const statusSet = useRef(false);

  useEffect(() => {
    const leaveStatus = () => {
      if (statusSet.current) host.status('ready');
      statusSet.current = false;
    };
    if (!loadable || equipment === null) {
      leaveStatus();
      return;
    }
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (host.signal.aborted) abort();
    else host.signal.addEventListener('abort', abort, { once: true });
    void loadReplayInput(host, equipment, controller.signal).then((load) => {
      if (load === null || controller.signal.aborted) return;
      if (load.kind === 'forbidden') {
        host.status('auth_required');
        statusSet.current = true;
      } else leaveStatus();
      setSettled({ key: resetKey, load });
    });
    return () => {
      controller.abort();
      host.signal.removeEventListener('abort', abort);
    };
  }, [host, loadable, equipment, resetKey]);

  if (!loadable) return { props, load: null, resetKey };
  return { props, load: settled?.key === resetKey ? settled.load : { kind: 'loading' }, resetKey };
}
