import type { ComponentPropsWithoutRef } from 'react';
import { Badge } from '@ap/ui';

/** The outline pill the platform design system no longer exports (AP ADR-0050): `@ap/ui` `Badge` with the outline variant. */
export function OutlineBadge(props: Omit<ComponentPropsWithoutRef<typeof Badge>, 'variant'>) {
  return <Badge variant="outline" {...props} />;
}
