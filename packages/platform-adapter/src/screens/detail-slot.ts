import { useCallback, useEffect, type ReactNode } from 'react';
import type { ModuleHost } from '@ap/contracts';

export type DetailPayload = { node: ReactNode; label: string } | null;

/**
 * The host's detail slot as one stable callback (`FocusView` re-publishes when the identity changes), or undefined when the host
 * has no `detailSlot` and the screen shows the detail inline. null clears the slot.
 */
export function useDetailSlot(host: ModuleHost): ((detail: DetailPayload) => void) | undefined {
  const slot = host.detail;
  const publish = useCallback((detail: DetailPayload) => {
    if (!slot) return;
    if (detail) slot.show(detail.node, detail.label);
    else slot.clear();
  }, [slot]);
  return slot ? publish : undefined;
}

/** Publishes `detail` to the host's slot while it holds, clearing it when it stops holding and on unmount. */
export function usePublishDetail(publish: ((detail: DetailPayload) => void) | undefined, detail: DetailPayload): void {
  useEffect(() => {
    if (!publish) return;
    publish(detail);
    return () => publish(null);
  }, [publish, detail]);
}
