import { cn } from "@/lib/utils";

export function Logo({
  className,
  showWordmark = true,
}: {
  className?: string;
  showWordmark?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span
        aria-hidden
        className="inline-block size-5 rounded-full bg-white"
      />
      {showWordmark ? (
        <span className="font-mono text-base font-semibold tracking-tight">
          peep
        </span>
      ) : null}
    </span>
  );
}
