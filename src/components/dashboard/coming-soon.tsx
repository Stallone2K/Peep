import type { ComponentType } from "react";

// Reusable placeholder for dashboard routes whose real implementation
// lands in a later phase. Gives users a clear "we know this isn't here
// yet" state rather than a blank page.
export function ComingSoon({
  title,
  description,
  phase,
  icon: Icon,
}: {
  title: string;
  description: string;
  phase: string;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{description}</p>
      </div>

      <div className="border-border/60 bg-card/20 flex flex-col items-center gap-4 rounded-lg border px-6 py-20 text-center">
        <div className="border-border/60 flex size-12 items-center justify-center rounded-full border">
          <Icon className="text-muted-foreground size-5" />
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-medium">Coming Soon</h2>
          <p className="text-muted-foreground max-w-md text-sm">
            This View Arrives In {phase}. Check Back Once The Corresponding
            Endpoints Are Live.
          </p>
        </div>
      </div>
    </div>
  );
}
