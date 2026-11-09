export type GraphicsQuality = "low" | "medium" | "high";

export interface QualitySettings {
  maxDpr: number;
  shadows: boolean;
  /** Characters and props may reduce detail below 1. */
  detail: number;
}

export const QUALITY: Record<GraphicsQuality, QualitySettings> = {
  low: { maxDpr: 1, shadows: false, detail: 0.5 },
  medium: { maxDpr: 1.5, shadows: true, detail: 0.75 },
  high: { maxDpr: 2, shadows: true, detail: 1 },
};

export function detectWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return canvas.getContext("webgl2") !== null;
  } catch {
    return false;
  }
}
