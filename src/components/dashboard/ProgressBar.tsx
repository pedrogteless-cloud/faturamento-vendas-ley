import { cn } from "@/lib/utils";

type ProgressBarProps = {
  value: number; // 0..1+
  expected?: number; // 0..1+ (linha indicativa)
  variant?: "success" | "warning" | "danger" | "info";
  label?: string;
  className?: string;
};

export function ProgressBar({
  value,
  expected,
  variant = "info",
  label = "Progresso da meta",
  className,
}: ProgressBarProps) {
  const pct = Math.max(0, Math.min(1.5, value));
  const widthPct = `${Math.min(pct, 1) * 100}%`;
  const exp = expected !== undefined ? Math.max(0, Math.min(1, expected)) : null;

  const colorClass = {
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-destructive",
    info: "bg-primary",
  }[variant];

  return (
    <div
      className={cn("relative h-2 w-full overflow-hidden rounded-full bg-muted/60", className)}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
    >
      <div
        className={cn("h-full rounded-full transition-all duration-500", colorClass)}
        style={{ width: widthPct }}
      />
      {exp !== null && (
        <div
          className="absolute top-0 h-full w-0.5 bg-foreground/40"
          style={{ left: `${exp * 100}%` }}
          aria-hidden
        />
      )}
    </div>
  );
}
