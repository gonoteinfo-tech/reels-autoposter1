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
  X,
  Sparkles,
} from "lucide-react";
import type { User } from "@/types";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/sources", label: "Fontes de Vídeo", icon: Users },
  { href: "/dashboard/settings", label: "Configurações", icon: Settings },
];

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
  schedulerActive?: boolean;
}) {
  const pathname = usePathname();

  return (
    <>
      {/* Mobile overlay backdrop */}
      {mobileOpen && (
        <div
          className="sidebar-overlay"
          onClick={onMobileClose}
        />
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${collapsed ? "collapsed" : ""} ${mobileOpen ? "mobile-open" : ""}`}>
        {/* Mobile close button */}
        <button
          className="sidebar-mobile-close"
          onClick={onMobileClose}
          aria-label="Fechar menu"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Logo */}
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">
            <Zap className="w-5 h-5 text-white fill-white" />
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <h1 className="text-base font-extrabold tracking-tight text-white leading-none">
                  GO POST
                </h1>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 tracking-wider">
                  2.0
                </span>
              </div>
              <p className="text-[11px] font-medium text-slate-400 mt-1 truncate">
                Automação Inteligente
              </p>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav">
          <div className="space-y-1">
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
              const isActive =
                href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`nav-item relative ${isActive ? "active" : ""}`}
                  title={collapsed ? label : undefined}
                  onClick={onMobileClose}
                >
                  <Icon className={`nav-icon ${isActive ? "text-purple-400" : "text-slate-400"}`} />
                  {!collapsed && (
                    <span className="truncate">{label}</span>
                  )}
                  {isActive && !collapsed && (
                    <span className="ml-auto w-1.5 h-1.5 rounded-full bg-purple-400 shadow-[0_0_8px_rgba(168,85,247,0.8)]" />
                  )}
                </Link>
              );
            })}
          </div>

          {/* Divider */}
          <div className="my-4 mx-2 border-t border-white/[0.06]" />

          {/* Scheduler status card */}
          {!collapsed ? (
            <div className="mx-2 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                  <Clock className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-200 leading-none">Automação</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Scheduler ativo</p>
                </div>
              </div>
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
            </div>
          ) : (
            <div className="flex justify-center" title="Automação Ativa">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              </div>
            </div>
          )}
        </nav>

        {/* User profile & Logout */}
        {user && (
          <div className="p-3 border-t border-white/[0.06] bg-black/20">
            <div className="flex items-center gap-2.5">
              {user.picture ? (
                <img 
                  src={user.picture} 
                  alt={user.name} 
                  className="w-8 h-8 rounded-full border border-purple-500/30 flex-shrink-0 object-cover" 
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center font-bold text-white text-xs flex-shrink-0 shadow-sm">
                  {user.name.charAt(0).toUpperCase()}
                </div>
              )}
              {!collapsed && (
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-semibold text-white truncate leading-tight">{user.name}</p>
                    <span className={`text-[8px] font-extrabold px-1.5 py-0.5 rounded-full uppercase tracking-wider shrink-0 ${
                      user.plan === 'pro'
                        ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                        : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                    }`}>
                      {user.plan === 'pro' ? 'PRO' : 'FREE'}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 truncate mt-0.5">
                    {user.email}
                  </p>
                </div>
              )}
              <Link 
                href="/api/auth/logout" 
                className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors flex-shrink-0 ml-auto" 
                title="Sair da Conta"
                prefetch={false}
              >
                <LogOut className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        )}

        {/* Collapse toggle */}
        <div className="border-t border-white/[0.06] p-2">
          <button
            onClick={onToggle}
            className="nav-item justify-center text-slate-400 hover:text-white"
            title={collapsed ? "Expandir menu" : "Recolher menu"}
          >
            {collapsed ? (
              <PanelLeftOpen className="nav-icon" />
            ) : (
              <>
                <PanelLeftClose className="nav-icon" />
                <span className="text-xs">Recolher Menu</span>
              </>
            )}
          </button>
        </div>
      </aside>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="mobile-bottom-nav">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive =
            href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`mobile-bottom-nav-item ${isActive ? "active" : ""}`}
            >
              <Icon className="w-5 h-5" />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
