import { useId } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip } from "recharts";
import { centsToCompact, formatDateBR } from "@/lib/format";

type SparklineProps = {
  data: { date: string; value: number }[];
  color?: string;
  height?: number;
};

export function Sparkline({ data, color = "var(--color-primary)", height = 56 }: SparklineProps) {
  const gradientId = useId().replace(/:/g, "");
  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-md bg-muted/30 text-xs text-muted-foreground"
        style={{ height }}
      >
        Sem dados no período
      </div>
    );
  }

  return (
    <div style={{ height, width: "100%" }}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.45} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Tooltip
            cursor={{ stroke: "var(--color-border)", strokeWidth: 1 }}
            contentStyle={{
              background: "var(--color-popover)",
              border: "1px solid var(--color-border)",
              borderRadius: 8,
              fontSize: 12,
              padding: "6px 10px",
            }}
            labelStyle={{ color: "var(--color-muted-foreground)", fontSize: 11 }}
            itemStyle={{ color: "var(--color-foreground)" }}
            formatter={(value: number) => [centsToCompact(value), "Valor"]}
            labelFormatter={(label) => formatDateBR(label as string)}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
