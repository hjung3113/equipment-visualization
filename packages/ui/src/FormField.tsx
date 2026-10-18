import { useId } from 'react';
import type { ReactNode } from 'react';
import { CircleAlert } from 'lucide-react';
import { FieldLabel } from '@fops/ui';

export interface FormFieldControlProps {
  id: string;
  'aria-describedby': string | undefined;
  'aria-invalid': true | undefined;
  'aria-required': true | undefined;
}

export interface FormFieldProps {
  label: string;
  required?: boolean;
  hint?: ReactNode;
  error?: ReactNode;
  /** Renders the control; spread the given props onto it so the label, hint and error are wired to it. */
  children: (control: FormFieldControlProps) => ReactNode;
}

/** Label, control, error and hint with ids and ARIA wired. The description reads the error first, then the hint. */
export function FormField({ label, required, hint, error, children }: FormFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const hasError = error !== undefined && error !== null && error !== false;
  const hasHint = hint !== undefined && hint !== null && hint !== false;
  const describedBy = [hasError ? errorId : null, hasHint ? hintId : null].filter((value) => value !== null).join(' ');
  return (
    <div className="grid gap-1">
      <FieldLabel htmlFor={id} required={required}>{label}</FieldLabel>
      {children({
        id,
        'aria-describedby': describedBy === '' ? undefined : describedBy,
        'aria-invalid': hasError ? true : undefined,
        'aria-required': required === true ? true : undefined,
      })}
      {hasError && (
        <p id={errorId} className="m-0 flex items-start gap-1 text-xs text-text-danger-label">
          <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
          <span>{error}</span>
        </p>
      )}
      {hasHint && <p id={hintId} className="m-0 text-xs text-text-muted">{hint}</p>}
    </div>
  );
}
