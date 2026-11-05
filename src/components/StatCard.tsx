import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  caption?: ReactNode;
  tone?: "default" | "error";
  icon?: LucideIcon;
}

export default function StatCard({ label, value, caption, tone = "default", icon: Icon }: StatCardProps) {
  const error = tone === "error" && Number(value) > 0;
  return (
    <div className={`card stat-card ${error ? 'stat-card-error' : ''}`}>
      <div className="stat-card-top"><span>{label}</span>{Icon && <span className="stat-icon"><Icon size={17} strokeWidth={1.7} aria-hidden="true" /></span>}</div>
      <span className={`stat-value tabular ${error ? 'text-err-ink' : ''}`}>{value}</span>
      {caption && <span className="stat-caption">{caption}</span>}
    </div>
  );
}
