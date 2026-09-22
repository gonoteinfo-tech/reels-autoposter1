/**
 * Converte datas do banco para Date. O SQLite grava "AAAA-MM-DD HH:MM:SS" em UTC,
 * sem fuso; outras datas já vêm em ISO.
 */
export function parseDbDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const iso = /[T]/.test(value) || /Z|[+-]\d\d:?\d\d$/.test(value) ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "agora", "há 5 min", "há 2 h", "há 3 dias" */
export function timeAgo(value: string | null | undefined, now = Date.now()): string {
  const date = parseDbDate(value);
  if (!date) return "—";
  const minutes = Math.round((now - date.getTime()) / 60000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.round(hours / 24);
  return `há ${days} ${days === 1 ? "dia" : "dias"}`;
}

/** "em 12 min", "em 2 h", "agora" */
export function timeUntil(value: string | null | undefined, now = Date.now()): string {
  const date = parseDbDate(value);
  if (!date) return "—";
  const minutes = Math.round((date.getTime() - now) / 60000);
  if (minutes <= 0) return "agora";
  if (minutes < 60) return `em ${minutes} min`;
  const hours = Math.round(minutes / 60);
  return `em ${hours} h`;
}

/** "14:32" no fuso do navegador */
export function clockTime(value: string | null | undefined): string {
  const date = parseDbDate(value);
  return date ? date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—";
}
