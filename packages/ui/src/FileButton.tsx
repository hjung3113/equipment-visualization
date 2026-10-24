import { useRef } from 'react';
import type { ChangeEvent } from 'react';
import { Upload } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@ap/ui';

export interface FileButtonProps {
  /** Names the button and the file input. */
  label: string;
  accept?: string;
  disabled?: boolean;
  'aria-describedby'?: string;
  onFile: (file: File) => void;
  /** Defaults to `Upload`. */
  icon?: LucideIcon;
}

/** Toolbar button that opens the file picker; the native input stays hidden but reachable by its label. */
export function FileButton({ label, accept, disabled, 'aria-describedby': describedBy, onFile, icon: Icon = Upload }: FileButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (file !== undefined) onFile(file);
  };
  return (
    <>
      <Button type="button" variant="secondary" size="toolbar" disabled={disabled} aria-describedby={describedBy} onClick={() => inputRef.current?.click()}>
        <Icon className="size-3.5" aria-hidden />
        {label}
      </Button>
      <input ref={inputRef} type="file" accept={accept} aria-label={label} tabIndex={-1} className="hidden" disabled={disabled} onChange={handleChange} />
    </>
  );
}
