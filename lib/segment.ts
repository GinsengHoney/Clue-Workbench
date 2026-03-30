import type { Material } from "./types";

/** 将材料切成带编号的段落，供引用 P{materialIndex}-{paragraphIndex} */
export function segmentMaterials(materials: Material[]): string {
  return materials
    .map((m, mi) => {
      const paras = m.content
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter(Boolean);
      const numbered = paras
        .map((p, pi) => `P${mi + 1}-${pi + 1}\n${p}`)
        .join("\n\n");
      return `## ${m.title}\n${numbered}`;
    })
    .join("\n\n---\n\n");
}
