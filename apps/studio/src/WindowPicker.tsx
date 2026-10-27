import { useEffect, useState, type ReactNode } from 'react';
import { DetailFields, FormField, Panel } from '@eqv/ui';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@ap/ui';
import { listSampleWindows, shortWindowHash, windowHex, type SampleWindowEntry } from './onboarding-data.js';

export interface WindowPickerProps {
  equipmentId: string;
  /** The window the page shows (`?window=` or the loaded default); an unknown value shows the placeholder. */
  value: string | null;
  hint: ReactNode;
  /** The selected window's validated facts, only when the page loaded it. */
  details: { dataGeneration: string; timeDomain: string; hash: string } | null;
  onChange: (hex: string) => void;
  /** Spacing from the content below, for pages that are not a grid. */
  className?: string;
}

/**
 * Names-only list of the equipment's Sample Windows (ADR-0010). It renders nothing while loading, when listing fails (the
 * page load shows that error) and for zero windows, so it stays mounted across window changes and offers a way out of an
 * unknown `?window=`.
 */
export function WindowPicker({ equipmentId, value, hint, details, onChange, className }: WindowPickerProps) {
  const [listed, setListed] = useState<{ equipmentId: string; windows: SampleWindowEntry[] } | null>(null);
  useEffect(() => {
    let cancelled = false;
    listSampleWindows(equipmentId).then(
      (windows) => { if (!cancelled) setListed({ equipmentId, windows }); },
      () => { if (!cancelled) setListed(null); },
    );
    return () => { cancelled = true; };
  }, [equipmentId]);

  if (listed === null || listed.equipmentId !== equipmentId || listed.windows.length === 0) return null;
  const { windows } = listed;
  const selected = value !== null && windows.some((entry) => windowHex(entry) === value) ? value : '';
  return (
    <Panel title="Sample Window" {...(className === undefined ? {} : { className })}>
      <div className="grid gap-3">
        <FormField label="사용할 window" hint={hint}>
          {(control) => (
            <Select value={selected} onValueChange={onChange}>
              <SelectTrigger {...control} density="compact" className="w-full max-w-md">
                <SelectValue placeholder="window를 고르세요" />
              </SelectTrigger>
              <SelectContent>
                {windows.map((entry) => <SelectItem key={entry.name} value={windowHex(entry)}>{entry.from} – {entry.to}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </FormField>
        {details && (
          <DetailFields items={[
            { key: 'dataGeneration', label: 'Data Generation', value: details.dataGeneration, mono: true },
            { key: 'timeDomain', label: 'timeDomain', value: details.timeDomain, mono: true },
            { key: 'hash', label: 'hash', value: shortWindowHash(details.hash), mono: true },
          ]} />
        )}
      </div>
    </Panel>
  );
}
