"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import Sidebar, { BrandMark, NAV_ITEMS, isNavActive } from "@/components/Sidebar";
import type { User } from "@/types";

/**
 * Estrutura da área logada: menu lateral (gaveta no celular), barra superior do
 * celular e navegação inferior do celular. As páginas só renderizam o conteúdo.
 */
export default function AppShell({ user, children }: { user: User; children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  return (
    <div className="app-shell">
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((v) => !v)}
        user={user}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      <div className={`main-area ${collapsed ? "collapsed" : ""}`}>
        <header className="mobile-topbar">
          <Link href="/dashboard" className="flex items-center gap-2 h-11">
            <BrandMark size={28} />
            <span className="font-display text-lg font-bold">GO POST</span>
          </Link>
          <button type="button" className="btn btn-icon" onClick={() => setMobileOpen(true)} aria-label="Abrir menu">
            <Menu />
          </button>
        </header>

        <main className="page">{children}</main>
      </div>

      <nav className="mobile-nav" aria-label="Principal">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} aria-current={isNavActive(pathname, href) ? "page" : undefined}>
            <Icon className="w-5 h-5" strokeWidth={1.8} />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}

/** Cabeçalho padrão das páginas: título, subtítulo e ações à direita */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex flex-col gap-1 min-w-0">
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="m-0 text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
    </header>
  );
}

/** Interruptor liga/desliga acessível (botão com aria-pressed) */
export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button type="button" className="switch" aria-pressed={checked} aria-label={label} onClick={() => onChange(!checked)}>
      <span className="switch-track">
        <span className="switch-knob" />
      </span>
    </button>
  );
}
