/**
 * Single source of design values. layout.tsx injects them as CSS variables
 * (color.mint100 -> --aa-color-mint-100) and Phaser reads them via phaserColor.
 * Palette follows docs/design/ART_DIRECTION.md. Pastels are decoration: never use them as body text.
 * Text/background pairs below were checked for at least 4.5:1 contrast.
 */
export const color = {
  surface: "#FFFFFF",
  background: "#FAFCF7",
  line: "#D5E8DF",
  ink900: "#234D4A",
  ink600: "#4A6F6B",
  primary600: "#356D60",
  primary700: "#2A584D",
  onPrimary: "#FFFFFF",
  mint100: "#E6F6EE",
  mint200: "#BFE8D4",
  mint500: "#6FC7A5",
  sky100: "#E4F2FB",
  sky200: "#BEDFF3",
  coral100: "#FDE8E8",
  coral300: "#F3A3A6",
  lavender200: "#D8C9F0",
  // Pale birch: a small accent material only, never a whole wall or floor.
  birch200: "#F0E6D6",
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
  soft: "0 1px 2px rgba(35, 77, 74, 0.08), 0 8px 20px rgba(35, 77, 74, 0.08)",
  raised: "0 2px 4px rgba(35, 77, 74, 0.10), 0 16px 32px rgba(35, 77, 74, 0.12)",
  pressed: "0 1px 2px rgba(35, 77, 74, 0.14)",
} as const;

export const font = {
  display: '"Jua", "Gowun Dodum", system-ui, sans-serif',
  body: '"Gowun Dodum", system-ui, sans-serif',
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
