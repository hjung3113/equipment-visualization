import { useEffect, useMemo, useRef, useState } from 'react';
import { Info, LibraryBig, ServerCrash } from 'lucide-react';
import { idSchema, promoteLayout, type EquipmentLayoutDocument } from '@eqv/core';
import {
  AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, Button, Input,
} from '@ap/ui';
import { DetailFields, FormField, StateMessage } from '@eqv/ui';
import { promoteTemplate } from './api.js';
import { errorMessage } from './error-message.js';

/** The published Layout Revision a promotion starts from: its file identity and the document as read from that file. */
export interface PromotionSource {
  layoutId: string;
  /** The 64-hex digits of the revision file name. */
  hex: string;
  layout: EquipmentLayoutDocument;
}

/** Confirm step of the Template promotion (ADR-0015): names the new Template, shows what it will contain, then promotes the published source. */
export function PromoteDialog({ source, edited, onPromoted, onCancel }: {
  source: PromotionSource;
  /** True when the open document has local edits; promotion uses the published revision without them. */
  edited: boolean;
  onPromoted(path: string): void;
  onCancel(): void;
}) {
  const [templateId, setTemplateId] = useState('');
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const live = useRef(true);
  const idRef = useRef<HTMLInputElement>(null);

  // The dialog is mounted for one source; unmounting it (cancel, navigation, import, replaced source) drops a late result.
  useEffect(() => {
    live.current = true;
    return () => { live.current = false; };
  }, []);

  const idValid = idSchema.safeParse(templateId).success;
  const nameValid = name.trim() !== '';
  const preview = useMemo(() => idValid && nameValid
    ? promoteLayout(source.layout, { templateId, name: name.trim(), layoutRevision: `sha256:${source.hex}` }) : null, [idValid, nameValid, source, templateId, name]);

  async function submit() {
    if (preview === null || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await promoteTemplate({ layoutId: source.layoutId, revision: source.hex, templateId, name: name.trim() });
      if (live.current) onPromoted(result.path);
    } catch (failure) {
      if (!live.current) return;
      setError(errorMessage(failure));
      setSubmitting(false);
    }
  }

  return (
    <AlertDialog open onOpenChange={(next) => { if (!next && !submitting) onCancel(); }}>
      <AlertDialogContent role="alertdialog" onOpenAutoFocus={(event) => { event.preventDefault(); idRef.current?.focus(); }}>
        <AlertDialogHeader>
          <AlertDialogTitle>Template으로 승격할까요?</AlertDialogTitle>
          <AlertDialogDescription>
            게시된 Layout Revision <code className="font-mono">{source.layoutId}</code>을(를) 데이터 루트 templates/에 Template으로 저장합니다. 저장한 Template은 Studio에서 지울 수 없습니다.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <form noValidate className="grid gap-3" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
          <FormField label="Template id" required hint="영문 소문자로 시작하고 소문자·숫자를 하이픈(-) 하나로 이어 씁니다. 하이픈으로 끝날 수 없습니다."
            error={templateId !== '' && !idValid ? 'Template id 형식이 아닙니다' : undefined}>
            {(control) => (
              <Input {...control} ref={idRef} autoComplete="off" spellCheck={false} value={templateId} disabled={submitting}
                onChange={(event) => { setTemplateId(event.target.value); setError(null); }} />
            )}
          </FormField>
          <FormField label="이름" required error={!nameValid ? '이름을 입력하세요' : undefined}>
            {(control) => (
              <Input {...control} autoComplete="off" placeholder={source.layout.name} value={name} disabled={submitting}
                onChange={(event) => { setName(event.target.value); setError(null); }} />
            )}
          </FormField>
          {edited && (
            <StateMessage compact icon={Info} title="승격은 게시된 Revision을 쓰며, 저장하지 않은 편집은 포함하지 않습니다" />
          )}
          {preview !== null && (
            <DetailFields items={[
              { key: 'source', label: '원천 Revision', value: <code className="font-mono">{`sha256:${source.hex.slice(0, 12)}…`}</code> },
              { key: 'roles', label: 'Role별 개수 (정확히 이 수)', value: Object.entries(preview.roleCardinality).map(([role, { min }]) => `${role} ${min}`).join(', ') },
            ]} />
          )}
          {preview !== null && <p className="text-xs text-muted-foreground">승격한 Template은 Role마다 이 개수와 정확히 같은 설비에만 맞습니다.</p>}
          {error !== null && <StateMessage compact tone="danger" icon={ServerCrash} title={error} />}
          <AlertDialogFooter>
            <Button type="button" variant="secondary" size="sm" disabled={submitting} onClick={onCancel}>취소</Button>
            <Button type="submit" variant="primary" size="sm" disabled={preview === null || submitting}>
              <LibraryBig className="size-3.5" aria-hidden />승격
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
