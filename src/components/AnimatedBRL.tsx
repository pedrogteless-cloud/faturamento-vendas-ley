import { useCountUp } from "@/hooks/useCountUp";
import { centsToBRL } from "@/lib/format";

interface AnimatedBRLProps {
  cents: number;
  className?: string;
  duration?: number;
}

export function AnimatedBRL({ cents, className, duration = 900 }: AnimatedBRLProps) {
  const animated = useCountUp(cents, duration);
  return <span className={className}>{centsToBRL(animated)}</span>;
}
