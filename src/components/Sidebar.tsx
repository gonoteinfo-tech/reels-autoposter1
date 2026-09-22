"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutGrid,
  Users,
  SlidersHorizontal,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from "lucide-react";
import type { User } from "@/types";

export const NAV_ITEMS = [
  { href: "/dashboard", label: "Painel", icon: LayoutGrid },
  { href: "/dashboard/sources", label: "Fontes", icon: Users },
  { href: "/dashboard/settings", label: "Configurações", icon: SlidersHorizontal },
];

export function isNavActive(pathname: string, href: string): boolean {
  return href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);
}

/** Marca do produto: quadrado coral com o triângulo de "play" */
export function BrandMark({ size = 30 }: { size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-lg bg-accent shrink-0"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg width={size * 0.44} height={size * 0.44} viewBox="0 0 24 24" fill="#111214">
        <polygon points="7 4 20 12 7 20 7 4" />
      </svg>
    </span>
  );
}

/** Página conectada, mostrada no rodapé do menu */
function PublishingTarget({ collapsed }: { collapsed: boolean }) {
  const [target, setTarget] = useState<{ page: string; ig: boolean } | null | undefined>(undefined);

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => {
        const s = data?.data;
        setTarget(s?.facebook_page_id ? { page: s.facebook_page_name || "Página conectada", ig: !!s.instagram_business_account_id } : null);
      })
      .catch(() => setTarget(null));
  }, []);

  if (collapsed || target === undefined) return null;

  if (target === null) {
    return (
      <Link href="/dashboard/settings" className="card p-3.5 flex flex-col gap-1.5 hover:border-line-strong transition-colors">
        <span className="text-xs text-muted">Nenhuma página conectada</span>
        <span className="text-[13px] font-semibold text-accent">Conectar página →</span>
      </Link>
    );
  }

  return (
    <div className="card p-3.5 flex flex-col gap-2">
      <span className="text-xs text-muted">Publicando em</span>
      <span className="flex items-center gap-2 font-semibold min-w-0">
        <span className="dot bg-ok" />
        <span className="truncate">{target.page}</span>
      </span>
      <span className="flex gap-1.5">
        {target.ig && <span className="chip text-[11px] py-0.5 px-2">Instagram</span>}
        <span className="chip text-[11px] py-0.5 px-2">Facebook</span>
      </span>
    </div>
  );
}

export default function Sidebar({
  collapsed,
  onToggle,
  user,
  mobileOpen,
  onMobileClose,
}: {
  collapsed: boolean;
  onToggle: () => void;
  user?: User | null;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}) {
  const pathname = usePathname();

  return (
    <>
      <div className={`sidebar-backdrop ${mobileOpen ? "open" : ""}`} onClick={onMobileClose} aria-hidden="true" />

      <aside className={`sidebar ${collapsed ? "collapsed" : ""} ${mobileOpen ? "mobile-open" : ""}`} aria-label="Menu">
        <div className={`flex items-center gap-2.5 ${collapsed ? "justify-center" : "px-2"}`}>
          <BrandMark />
          {!collapsed && (
            <span className="font-display text-[19px] font-bold tracking-tight flex-1">GO POST</span>
          )}
          <button type="button" className="btn-icon btn lg:hidden" onClick={onMobileClose} aria-label="Fechar menu">
            <X />
          </button>
        </div>

        <nav aria-label="Principal" className="flex flex-col gap-0.5">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="nav-link"
              aria-current={isNavActive(pathname, href) ? "page" : undefined}
              title={collapsed ? label : undefined}
              onClick={onMobileClose}
            >
              <Icon className="w-[18px] h-[18px] shrink-0" strokeWidth={1.8} />
              {!collapsed && <span className="truncate">{label}</span>}
            </Link>
          ))}
        </nav>

        <div className="mt-auto flex flex-col gap-3">
          <PublishingTarget collapsed={collapsed} />

          {user && (
            <div className={`flex items-center gap-2.5 ${collapsed ? "flex-col" : "p-2"}`}>
              {user.picture ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.picture} alt="" className="w-[34px] h-[34px] rounded-full object-cover shrink-0" />
              ) : (
                <span className="w-[34px] h-[34px] rounded-full bg-[#2a2d33] flex items-center justify-center text-[13px] font-semibold shrink-0">
                  {user.name.charAt(0).toUpperCase()}
                </span>
              )}
              {!collapsed && (
                <div className="flex-1 min-w-0 flex flex-col">
                  <span className="font-medium truncate">{user.name}</span>
                  <span className="text-xs text-muted">{user.plan === "pro" ? "Plano Pro" : "Plano Grátis"}</span>
                </div>
              )}
              <Link href="/api/auth/logout" prefetch={false} className="btn btn-icon" aria-label="Sair" title="Sair">
                <LogOut />
              </Link>
            </div>
          )}

          <button
            type="button"
            onClick={onToggle}
            className="nav-link w-full border-0 bg-transparent cursor-pointer hidden lg:flex"
            aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          >
            {collapsed ? (
              <PanelLeftOpen className="w-[18px] h-[18px] shrink-0" strokeWidth={1.8} />
            ) : (
              <>
                <PanelLeftClose className="w-[18px] h-[18px] shrink-0" strokeWidth={1.8} />
                <span className="text-[13px]">Recolher menu</span>
              </>
            )}
          </button>
        </div>
      </aside>
    </>
  );
}
