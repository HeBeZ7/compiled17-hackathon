/**
 * Single source of design values. layout.tsx injects them as CSS variables
 * (color.mint100 -> --aa-color-mint-100) and Phaser reads them via phaserColor.
 * Palette follows docs/design/ART_DIRECTION.md section "Redesign". Pastels are decoration: never use them as body text.
 * Text/background pairs below were checked for at least 4.5:1 contrast.
 */
export const color = {
  surface: "#FFFFFF",
  background: "#FBF9F4",
  line: "#DDE6E1",
  ink900: "#11303A",
  ink600: "#4C626A",
  // Small controls, focus and selected states.
  primary600: "#2A6F66",
  primary700: "#1F5750",
  onPrimary: "#FFFFFF",
  // Main calls to action only, and only with bold text of at least 19px (3.8:1).
  cta: "#E2524A",
  ctaHover: "#CC433C",
  onCta: "#FFFFFF",
  mint100: "#E4F4EC",
  mint200: "#BFE6D4",
  mint500: "#6FC7A5",
  sky100: "#E4F1FA",
  sky200: "#BBDDF2",
  coral100: "#FDE8E6",
  coral300: "#F6A6A0",
  lavender100: "#EFE9FA",
  lavender200: "#D9CCF2",
  lavender500: "#9C84D8",
  lavender700: "#5A3FA8",
  birch200: "#F2E4CE",
  board600: "#3E8A78",
  okText: "#1F6B52",
  okBg: "#DFF5EA",
  warnText: "#8A4B12",
  warnBg: "#FFF1DC",
  dangerText: "#A82E3E",
  dangerBg: "#FDE6E8",
  unknownText: "#465C63",
  unknownBg: "#E9EFF1",
} as const;

export const space = {
  1: "4px",
  2: "8px",
  3: "12px",
  4: "16px",
  5: "24px",
  6: "32px",
  7: "48px",
  8: "64px",
} as const;

export const radius = {
  sm: "8px",
  md: "14px",
  lg: "22px",
  pill: "999px",
} as const;

export const shadow = {
  soft: "0 1px 2px rgba(17, 48, 58, 0.08), 0 8px 20px rgba(17, 48, 58, 0.08)",
  raised: "0 2px 4px rgba(17, 48, 58, 0.10), 0 16px 32px rgba(17, 48, 58, 0.12)",
  pressed: "0 1px 2px rgba(17, 48, 58, 0.14)",
} as const;

export const font = {
  display: '"Plus Jakarta Sans Variable", system-ui, sans-serif',
  body: '"Plus Jakarta Sans Variable", system-ui, sans-serif',
} as const;

export const z = {
  stage: "1",
  header: "10",
  overlay: "20",
} as const;

export const motion = {
  fast: "120ms ease-out",
  base: "220ms ease-out",
} as const;

const GROUPS = { color, space, radius, shadow, font, z, motion } as const;

function kebab(key: string): string {
  return key.replace(/([a-z])([A-Z0-9])/g, "$1-$2").toLowerCase();
}

export function tokensToCss(): string {
  const lines = Object.entries(GROUPS).flatMap(([group, values]) =>
    Object.entries(values).map(([key, value]) => `--aa-${group}-${kebab(key)}:${value};`),
  );
  return `:root{${lines.join("")}}`;
}

export type ColorToken = keyof typeof color;

/** Hex token as the 0xRRGGBB number Phaser expects. */
export function phaserColor(name: ColorToken): number {
  return Number.parseInt(color[name].slice(1), 16);
}
