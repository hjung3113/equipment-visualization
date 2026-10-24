import { Info } from 'lucide-react';
import { Callout } from '@ap/ui';

/** One status callout per notice, shared by every screen that shows load or data notices. */
export function NoticeList({ notices }: { notices: readonly string[] }) {
  return notices.map((notice) => (
    <Callout key={notice} tone="blue" icon={<Info className="size-3.5" aria-hidden />} className="mb-2">
      <span role="status">{notice}</span>
    </Callout>
  ));
}
