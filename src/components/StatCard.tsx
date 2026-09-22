import type { ReactNode } from "react";

interface StatCardProps {
  label: string;
  value: string | number;
  /** Linha de apoio abaixo do número (dado real — nada de tendência inventada) */
  caption?: ReactNode;
  tone?: "default" | "error";
}

export default function StatCard({ label, value, caption, tone = "default" }: StatCardProps) {
  return (
    <div className="card p-5 flex flex-col gap-2 min-w-0">
      <span className="text-[13px] text-muted">{label}</span>
      <span
        className={`font-display text-[34px] leading-none font-bold tracking-tight tabular ${
          tone === "error" && Number(value) > 0 ? "text-err-ink" : ""
        }`}
      >
        {value}
      </span>
      {caption && <span className="text-xs text-faint truncate">{caption}</span>}
    </div>
  );
}
