/**
 * Tema central do Konoha Fin — identidade Konoha Tech (monocromática).
 *
 * Marca: preto, branco e tons de cinza. O botão/realce primário é BRANCO
 * com texto PRETO (`brand` / `brandText`).
 *
 * Exceção semântica (dinheiro): entradas usam VERDE e saídas usam VERMELHO,
 * pois a cor carrega significado financeiro e não deve virar cinza.
 * Transferência é neutra (não é entrada nem saída de patrimônio).
 *
 * Todas as telas devem consumir estes tokens em vez de hex hardcoded.
 */

// ── Escala base monocromática (cinza-neutro, sem matiz azul) ──────────────
const mono = {
  black: "#000000",
  ink900: "#0c0c0d", // fundo da app
  ink850: "#121214",
  ink800: "#161618", // superfície (cards)
  ink750: "#1c1c1f", // superfície elevada
  ink700: "#26262a", // borda
  ink600: "#3a3a40",
  gray500: "#71717a", // texto faint
  gray400: "#a1a1aa", // texto muted
  gray300: "#d4d4d8",
  white: "#ffffff",
} as const;

// ── Cores semânticas de dinheiro ──────────────────────────────────────────
const money = {
  income: "#22c55e",
  incomeStrong: "#16a34a",
  incomeSoft: "#4ade80",
  expense: "#f87171",
  expenseStrong: "#dc2626",
  expenseSoft: "#fca5a5",
} as const;

export const colors = {
  // Marca (monocromática)
  brand: mono.white, // realce/CTA primário = branco
  brandText: mono.black, // texto sobre o realce = preto
  brandMuted: mono.gray300,

  // Superfícies
  bg: mono.ink900,
  surface: mono.ink800,
  surfaceAlt: mono.ink750,
  surfaceElevated: mono.ink750,
  border: mono.ink700,
  borderStrong: mono.ink600,

  // Texto
  text: mono.white,
  textMuted: mono.gray400,
  textFaint: mono.gray500,
  placeholder: mono.gray500,
  textOnBrand: mono.black,

  // Entrada (verde) — semântica financeira
  income: money.income,
  incomeStrong: money.incomeStrong,
  incomeText: money.incomeSoft,
  successText: money.incomeSoft,
  successBg: "rgba(34,197,94,0.08)",
  successBorder: "rgba(34,197,94,0.22)",

  // Saída (vermelho) — semântica financeira
  expense: money.expense,
  expenseStrong: money.expenseStrong,
  expenseText: money.expenseSoft,
  dangerText: money.expenseSoft,
  dangerBg: "rgba(248,113,113,0.08)",
  dangerBorder: "rgba(248,113,113,0.22)",

  // Transferência / neutro — sem matiz, coerente com a marca
  transfer: mono.gray300,
  transferText: mono.gray300,
  neutral: mono.gray400,
} as const;

// ── Espaçamento ───────────────────────────────────────────────────────────
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

// ── Raio de borda ─────────────────────────────────────────────────────────
export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 999,
} as const;

// ── Tipografia ────────────────────────────────────────────────────────────
export const font = {
  size: {
    xs: 11,
    sm: 13,
    md: 15,
    lg: 17,
    xl: 22,
    xxl: 26,
  },
  weight: {
    regular: "400",
    medium: "500",
    semibold: "600",
    bold: "700",
    extrabold: "800",
  },
} as const;

/**
 * Aplica opacidade a uma cor hex (#rgb ou #rrggbb), retornando rgba().
 * Para cores que já são rgba()/nomeadas, retorna a cor original.
 *
 *   alpha(colors.income, 0.15) -> "rgba(34,197,94,0.15)"
 */
export function alpha(color: string, opacity: number): string {
  const hex = color.trim();
  if (hex[0] !== "#") return color;

  let r: number;
  let g: number;
  let b: number;

  if (hex.length === 4) {
    r = parseInt(hex[1] + hex[1], 16);
    g = parseInt(hex[2] + hex[2], 16);
    b = parseInt(hex[3] + hex[3], 16);
  } else if (hex.length === 7) {
    r = parseInt(hex.slice(1, 3), 16);
    g = parseInt(hex.slice(3, 5), 16);
    b = parseInt(hex.slice(5, 7), 16);
  } else {
    return color;
  }

  const a = Math.max(0, Math.min(1, opacity));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export const theme = { colors, spacing, radius, font, alpha } as const;
export default theme;
