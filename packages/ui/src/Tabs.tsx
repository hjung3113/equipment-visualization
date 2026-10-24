// AP underline tabs (#73 slice f1): only the list and trigger look is defined here, on the @ap/ui base tabs (TabsListBase/TabsTriggerBase); roles, selection and keyboard stay @ap/ui's.
import * as React from 'react';
import { TabsListBase as FopsTabsList, TabsTriggerBase as FopsTabsTrigger, cn } from '@ap/ui';

export { Tabs, TabsContent } from '@ap/ui';

export const TabsList: typeof FopsTabsList = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof FopsTabsList>
>(({ className, ...props }, ref) => (
  <FopsTabsList
    ref={ref}
    className={cn(
      'flex h-auto w-full items-end justify-start overflow-x-auto rounded-none border-b border-border-subtle bg-transparent p-0 text-text-secondary',
      className,
    )}
    {...props}
  />
));
TabsList.displayName = FopsTabsList.displayName;

export const TabsTrigger: typeof FopsTabsTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof FopsTabsTrigger>
>(({ className, children, ...props }, ref) => (
  <FopsTabsTrigger
    ref={ref}
    className={cn(
      'relative shrink-0 rounded-none text-text-secondary hover:text-text-primary focus-visible:ring-inset focus-visible:ring-offset-0 focus-visible:-outline-offset-2 data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-text-primary data-[state=active]:shadow-none',
      // The selection bar is the trigger's own ::after: a sibling child would break the Radix asChild slot (AP #340 F1). Forced colors keep it as a border.
      'after:absolute after:inset-x-3 after:bottom-0 after:hidden after:h-0.5 after:rounded-pill after:bg-accent-primary data-[state=active]:after:block forced-colors:after:bg-transparent forced-colors:after:border-b-2 forced-colors:after:border-current',
      className,
    )}
    {...props}
  >
    {typeof children === 'string' || typeof children === 'number' ? (
      <span className="grid">
        <span aria-hidden className="invisible col-start-1 row-start-1 font-semibold whitespace-nowrap">{children}</span>
        <span className="col-start-1 row-start-1">{children}</span>
      </span>
    ) : children}
  </FopsTabsTrigger>
));
TabsTrigger.displayName = FopsTabsTrigger.displayName;
