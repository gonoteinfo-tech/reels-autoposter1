"use client";

import { motion } from "framer-motion";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import type { ReactNode } from "react";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: ReactNode;
  trend?: { value: number; label: string };
  color?: string;
  gradient?: string;
}

export default function StatCard({
  label,
  value,
  icon,
  trend,
  color,
  gradient,
}: StatCardProps) {
  const isPositive = trend && trend.value >= 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -3, transition: { duration: 0.2 } }}
      className="stat-card group"
    >
      {/* Dynamic top gradient line */}
      <div
        className="absolute top-0 left-0 right-0 h-[2px] opacity-80 group-hover:opacity-100 transition-opacity"
        style={{
          background: gradient || "var(--brand-gradient)",
        }}
      />

      {/* Subtle radial ambient glow inside card */}
      <div 
        className="absolute -right-8 -top-8 w-24 h-24 rounded-full pointer-events-none opacity-20 group-hover:opacity-40 transition-opacity blur-xl"
        style={{
          background: color || "var(--brand-purple)",
        }}
      />

      <div className="flex items-start justify-between mb-3 relative z-10">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center transition-transform group-hover:scale-105 duration-200 border"
          style={{
            background: color ? `${color}18` : "rgba(139, 92, 246, 0.15)",
            borderColor: color ? `${color}35` : "rgba(139, 92, 246, 0.3)",
            color: color || "var(--brand-purple)",
          }}
        >
          {icon}
        </div>
        {trend && (
          <div
            className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border"
            style={{
              background: isPositive
                ? "rgba(16, 185, 129, 0.12)"
                : "rgba(239, 68, 68, 0.12)",
              borderColor: isPositive
                ? "rgba(16, 185, 129, 0.25)"
                : "rgba(239, 68, 68, 0.25)",
              color: isPositive ? "#34d399" : "#f87171",
            }}
          >
            {isPositive ? (
              <ArrowUpRight className="w-3 h-3 stroke-[2.5]" />
            ) : (
              <ArrowDownRight className="w-3 h-3 stroke-[2.5]" />
            )}
            <span>{Math.abs(trend.value)}%</span>
          </div>
        )}
      </div>

      <div className="relative z-10">
        <p
          className="text-2xl lg:text-3xl font-extrabold text-white tracking-tight mb-1"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {value}
        </p>
        <p className="text-xs font-medium text-slate-400">
          {label}
        </p>
      </div>
    </motion.div>
  );
}
