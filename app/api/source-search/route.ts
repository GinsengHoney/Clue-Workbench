import { NextRequest, NextResponse } from "next/server";
import { getLlmConfig } from "@/lib/llmConfig";

type SourceCandidate = {
  id: string;
  title: string;
  url: string;
  reason: string;
};

type VerifiedSource = SourceCandidate & {
  preview: string;
  readableChars: number;
};

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchWithTimeout(url: string, ms = 15000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchReadableText(url: string): Promise<string> {
  const mirror = `https://r.jina.ai/http://${url.replace(/^https?:\/\//, "")}`;
  try {
    const m = await fetchWithTimeout(mirror, 14000);
    if (m.ok) {
      const txt = await m.text();
      if (txt.trim().length > 250) return txt.trim();
    }
  } catch {
    // fallback below
  }
  const res = await fetchWithTimeout(url, 14000);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const raw = await res.text();
  return htmlToText(raw);
}

function isReadableArticle(text: string): boolean {
  const t = text.trim();
  if (t.length < 350) return false;
  if (
    /404|not found|页面不存在|访问错误|需要登录|注册|验证码|跳转中|搜索结果|请输入关键词|无结果/i.test(
      t.slice(0, 1200)
    )
  ) {
    return false;
  }
  return true;
}

function parseJson(text: string): unknown {
  const t = text.trim();
  const m = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = m ? m[1].trim() : t;
  return JSON.parse(raw);
}

async function searchWithLlm(
  keyword: string,
  excludedUrls: Set<string>
): Promise<SourceCandidate[]> {
  const cfg = getLlmConfig();
  if (!cfg) return [];

  const system =
    "你是检索助手。给出可点击、可直接访问正文的中文文章链接。只输出 JSON 数组。";
  const user = `主题关键词：${keyword}
请输出最多 12 条候选文献，格式：
[
  {"title":"标题","url":"https://...","reason":"与主题的相关性"}
]
要求：
1) url 必须以 http/https 开头
2) title 不超过 40 字
3) 优先创业案例、公司复盘、行业报道等可读长文
4) 不要搜索页、标签页、首页、登录页、注册页
5) 避免重复 URL。已排除 URL：${Array.from(excludedUrls).slice(0, 50).join(", ")}`;

  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!res.ok) {
    return [];
  }
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = json.choices?.[0]?.message?.content || "";
  let parsed: unknown;
  try {
    parsed = parseJson(content);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const out: SourceCandidate[] = parsed
    .map((x, i) => {
      const o = x as { title?: string; url?: string; reason?: string };
      return {
        id: `c${i + 1}`,
        title: (o.title || "").trim(),
        url: (o.url || "").trim(),
        reason: (o.reason || "").trim(),
      };
    })
    .filter(
      (x) =>
        /^https?:\/\//.test(x.url) &&
        x.title &&
        !excludedUrls.has(x.url) &&
        !/\/search|\/tag|\/topics?|\/login|\/register|\?.*q=|\/$/.test(
          x.url.toLowerCase()
        )
    );

  return out.slice(0, 12);
}

async function verifyCandidates(
  candidates: SourceCandidate[],
  needCount: number
): Promise<VerifiedSource[]> {
  const accepted: VerifiedSource[] = [];

  for (let i = 0; i < candidates.length; i += 1) {
    if (accepted.length >= needCount) break;
    const c = candidates[i];
    try {
      const txt = await fetchReadableText(c.url);
      if (!isReadableArticle(txt)) continue;
      accepted.push({
        ...c,
        preview: txt.slice(0, 120),
        readableChars: txt.length,
      });
    } catch {
      // skip inaccessible urls
    }
  }
  return accepted;
}

async function collectAtLeastFive(keyword: string): Promise<{
  sources: VerifiedSource[];
  attempts: number;
}> {
  const needed = 5;
  const maxAttempts = 4;
  const excludedUrls = new Set<string>();
  const verified: VerifiedSource[] = [];

  const keywordVariants = [
    keyword,
    `${keyword} 创业 复盘`,
    `${keyword} 公司 失败 案例`,
    `${keyword} 深度 报道`,
  ];

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (verified.length >= needed) break;
    const kw = keywordVariants[attempt] || keyword;
    const candidates = await searchWithLlm(kw, excludedUrls);
    candidates.forEach((c) => excludedUrls.add(c.url));
    const remain = needed - verified.length;
    const batch = await verifyCandidates(candidates, remain);
    for (const item of batch) {
      if (!verified.some((x) => x.url === item.url)) verified.push(item);
    }
  }

  return { sources: verified.slice(0, needed), attempts: maxAttempts };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { keyword?: string };
    const keyword = (body.keyword || "").trim();
    if (!keyword) {
      return NextResponse.json({ error: "请输入关键词" }, { status: 400 });
    }
    const { sources, attempts } = await collectAtLeastFive(keyword);
    if (sources.length < 5) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "暂时无法找到至少 5 条可访问正文的文献。请换更具体关键词（如公司名+事件）再试。",
          sources,
          attempts,
        },
        { status: 422 }
      );
    }
    return NextResponse.json({
      ok: true,
      sources: sources.map((s, i) => ({
        id: `v${i + 1}`,
        title: s.title,
        url: s.url,
        reason: `${s.reason}（已验证正文可访问，约 ${s.readableChars} 字）`,
      })),
      attempts,
    });
  } catch {
    return NextResponse.json({ error: "检索失败，请稍后重试" }, { status: 500 });
  }
}

