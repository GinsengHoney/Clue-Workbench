import fs from "fs";
import path from "path";

function readJson(p) {
  const raw = fs.readFileSync(p, "utf-8");
  return JSON.parse(raw);
}

function maskKey(key) {
  if (!key) return "";
  const s = String(key);
  if (s.length <= 8) return "*".repeat(s.length);
  return `${s.slice(0, 3)}...${s.slice(-3)}`;
}

async function main() {
  const projectRoot = path.join(process.cwd());
  const credPath = path.join(projectRoot, "api-credentials.local.json");

  if (!fs.existsSync(credPath)) {
    console.error(`找不到凭据文件：${credPath}`);
    console.error(`请先创建或复制 api-credentials.local.json。`);
    process.exit(1);
  }

  const cfg = readJson(credPath);
  const apiKey = String(cfg.apiKey || "").trim();
  const baseUrl = String(cfg.baseUrl || "").trim().replace(/\/$/, "");
  const model = String(cfg.model || "").trim();

  if (!apiKey || !baseUrl || !model) {
    console.error(`api-credentials.local.json 缺少必要字段：apiKey/baseUrl/model`);
    process.exit(1);
  }

  console.log("=== LLM API Test ===");
  console.log(`provider: ${cfg.provider || "unknown"}`);
  console.log(`baseUrl: ${baseUrl}`);
  console.log(`model: ${model}`);
  console.log(`apiKey: ${maskKey(apiKey)} (已脱敏)`);

  const endpoint = `${baseUrl}/chat/completions`;
  const payload = {
    model,
    temperature: 0.2,
    messages: [
      { role: "system", content: "你是一个测试代理。只需返回一句话，不要格式化。"}
      ,
      { role: "user", content: "如果你能正常调用，请回复：API_OK" },
    ],
  };

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    if (!res.ok) {
      console.error(`请求失败：HTTP ${res.status}`);
      console.error(text.slice(0, 1200));
      process.exit(2);
    }

    console.log(`请求成功：HTTP ${res.status}`);
    // 尝试解析出类似 OpenAI 的字段：choices[0].message.content
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
    const out =
      parsed?.choices?.[0]?.message?.content ??
      parsed?.choices?.[0]?.text ??
      text;

    console.log("response preview:");
    console.log(String(out).slice(0, 1000));
  } catch (e) {
    console.error("网络/运行时错误：", e?.message || e);
    process.exit(3);
  }
}

main();

