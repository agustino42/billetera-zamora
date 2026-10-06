import { format, formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

/** Entero con separador de miles: 1234 → "1.234" */
export function formatAmount(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  return new Intl.NumberFormat("es-VE", { maximumFractionDigits: 2 }).format(n);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return format(new Date(value), "dd/MM/yyyy", { locale: es });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return format(new Date(value), "dd/MM/yyyy HH:mm", { locale: es });
}

export function timeAgo(value: string | null | undefined): string {
  if (!value) return "—";
  return formatDistanceToNow(new Date(value), { addSuffix: true, locale: es });
}

/** 8.5 / 10 → "8,5 / 10" */
export function formatGrade(value: number, maxValue: number): string {
  return `${formatAmount(value)} / ${formatAmount(maxValue)}`;
}

/** 0.85 → "85 %" */
export function formatNormalized(value: number): string {
  return `${formatAmount(value * 100)} %`;
}

/** Hash del ledger recortado para mostrarlo en la interfaz. */
export function shortHash(hash: string | null | undefined, size = 10): string {
  if (!hash) return "—";
  return `${hash.slice(0, size)}…${hash.slice(-size)}`;
}

export function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}
