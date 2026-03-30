import fs from "fs";
import path from "path";

export type LlmRuntimeConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  source: "api-credentials.local.json" | "env";
};

const LOCAL_FILE = "api-credentials.local.json";

/**
 * 优先从项目根目录 api-credentials.local.json 读取；
 * 若不存在或无效，再读环境变量 LLM_*（与 .env 一致）。
 */
export function getLlmConfig(): LlmRuntimeConfig | null {
  const root = process.cwd();
  const localPath = path.join(root, LOCAL_FILE);

  try {
    if (fs.existsSync(localPath)) {
      const raw = fs.readFileSync(localPath, "utf-8");
      const j = JSON.parse(raw) as {
        apiKey?: string;
        baseUrl?: string;
        model?: string;
      };
      const apiKey = j.apiKey?.trim();
      const baseUrl = j.baseUrl?.trim().replace(/\/$/, "");
      if (apiKey && baseUrl) {
        return {
          apiKey,
          baseUrl,
          model: (j.model || "gemini-2.0-flash").trim(),
          source: "api-credentials.local.json",
        };
      }
    }
  } catch {
    // fall through to env
  }

  const key = process.env.LLM_API_KEY?.trim();
  if (!key) return null;

  return {
    apiKey: key,
    baseUrl: (
      process.env.LLM_BASE_URL || "https://api.openai.com/v1"
    ).replace(/\/$/, ""),
    model: (process.env.LLM_MODEL_NAME || "gpt-4o-mini").trim(),
    source: "env",
  };
}
