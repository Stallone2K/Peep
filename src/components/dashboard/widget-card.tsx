import { cn } from "@/lib/utils";

// Shared wrapper used by every dashboard widget. Keeps spacing,
// borders, and the (optional) eyebrow + header treatment consistent
// across the Overview.
export function WidgetCard({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "border-border/60 bg-card/20 flex flex-col rounded-lg border",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function WidgetHeader({
  title,
  subtitle,
  trailing,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  trailing?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-4 px-6 pt-5 pb-4",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <h2 className="text-base font-medium leading-6">{title}</h2>
        {subtitle ? (
          <p className="text-muted-foreground mt-0.5 text-xs">{subtitle}</p>
        ) : null}
      </div>
      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </div>
  );
}
