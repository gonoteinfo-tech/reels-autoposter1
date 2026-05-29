"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  Settings,
  Clock,
  PanelLeftClose,
  PanelLeftOpen,
  Zap,
  Users,
  LogOut,
} from "lucide-react";
import type { User } from "@/types";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/sources", label: "Fontes", icon: Users },
  { href: "/dashboard/settings", label: "Configurações", icon: Settings },
];

export default function Sidebar({
  collapsed,
  onToggle,
  user,
}: {
  collapsed: boolean;
  onToggle: () => void;
  user?: User | null;
}) {
  const pathname = usePathname();

  return (
    <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">
          <Zap className="w-5 h-5 text-white" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-white truncate">
              GO POST
            </h1>
            <p
              className="text-[10px] font-medium truncate"
              style={{ color: "var(--text-muted)" }}
            >
              Automação de Reels
            </p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive =
            href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`nav-item relative ${isActive ? "active" : ""}`}
              title={collapsed ? label : undefined}
            >
              <Icon className="nav-icon" />
              {!collapsed && <span>{label}</span>}
            </Link>
          );
        })}

        {/* Divider */}
        <div
          className="my-3 mx-2"
          style={{ borderTop: "1px solid var(--surface-border)" }}
        />

        {/* Scheduler status indicator */}
        <div
          className="nav-item"
          style={{ cursor: "default", opacity: 0.7 }}
        >
          <Clock className="nav-icon" />
          {!collapsed && (
            <div className="flex items-center gap-2">
              <span className="text-xs">Scheduler</span>
              <span className="flex items-center gap-1">
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: "var(--success)" }}
                />
                {!collapsed && (
                  <span
                    className="text-[10px]"
                    style={{ color: "var(--success)" }}
                  >
                    Ativo
                  </span>
                )}
              </span>
            </div>
          )}
        </div>
      </nav>

      {/* User profile & Logout */}
      {user && (
        <div 
          className="flex items-center gap-2"
          style={{ 
            borderTop: "1px solid var(--surface-border)", 
            padding: "12px 8px",
            margin: "0 8px" 
          }}
        >
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            {user.picture ? (
              <img 
                src={user.picture} 
                alt={user.name} 
                className="w-7 h-7 rounded-full border border-[var(--surface-border)] flex-shrink-0" 
              />
            ) : (
              <div 
                className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-white text-[10px] flex-shrink-0" 
                style={{ background: "var(--brand-gradient-subtle)", border: "1px solid var(--surface-border)" }}
              >
                {user.name.charAt(0).toUpperCase()}
              </div>
            )}
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-white truncate leading-tight">{user.name}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[9px] truncate" style={{ color: "var(--text-muted)", maxWidth: "70px" }}>
                    {user.email}
                  </span>
                  <span className={`text-[8px] font-extrabold px-1.5 py-0.2 rounded uppercase tracking-wider shrink-0 ${
                    user.plan === 'pro'
                      ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                      : 'bg-zinc-500/20 text-zinc-400 border border-zinc-500/30'
                  }`}>
                    {user.plan === 'pro' ? 'PRO' : 'GRÁTIS'}
                  </span>
                </div>
              </div>
            )}
          </div>
          <Link 
            href="/api/auth/logout" 
            className="p-1.5 rounded-lg hover:bg-[var(--surface-2)] text-red-400 hover:text-red-300 transition-colors flex-shrink-0" 
            title="Sair"
            prefetch={false}
          >
            <LogOut className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}

      {/* Collapse toggle */}
      <div style={{ borderTop: "1px solid var(--surface-border)" }}>
        <button
          onClick={onToggle}
          className="nav-item justify-center"
          style={{ margin: "8px" }}
        >
          {collapsed ? (
            <PanelLeftOpen className="nav-icon" />
          ) : (
            <>
              <PanelLeftClose className="nav-icon" />
              <span>Recolher</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
