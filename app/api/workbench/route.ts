import { NextRequest, NextResponse } from "next/server";
import { segmentMaterials } from "@/lib/segment";
import { getLlmConfig } from "@/lib/llmConfig";
import type { Material } from "@/lib/types";
import {
  mockStep2,
  mockStep3,
  mockStep4,
  mockStep5,
} from "@/lib/mock";

type Body = {
  step: 2 | 3 | 4 | 5;
  materials: Material[];
  step2?: unknown;
  step3?: unknown;
  step4?: unknown;
};

type Step3Claim = {
  id: string;
  claim: string;
  evidence: { ref: string; quote: string }[];
  strength: "强" | "中" | "弱";
};

type Step3Data = {
  claims: Step3Claim[];
  contradictions: { a: string; b: string; refA: string; refB: string }[];
};

function parseJsonFromModel(text: string): unknown {
  const t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence ? fence[1].trim() : t;
  return JSON.parse(raw);
}

function buildClaimsFromMaterials(materials: Material[]): Step3Data {
  const candidates: { ref: string; text: string }[] = [];

  for (let mi = 0; mi < materials.length; mi += 1) {
    const m = materials[mi];
    const paras = m.content
      .split(/\n\s*\n/)
      .map((x) => x.trim())
      .filter(Boolean);
    for (let pi = 0; pi < paras.length; pi += 1) {
      const p = paras[pi]
        .replace(/\s+/g, " ")
        .replace(/^来源链接：\S+\s*/g, "")
        .trim();
      if (!p) continue;
      candidates.push({ ref: `P${mi + 1}-${pi + 1}`, text: p });
    }
  }

  // 过滤噪声段落（404、登录提示、过短内容）
  const filtered = candidates.filter(({ text }) => {
    if (text.length < 20) return false;
    if (
      /404|not found|页面不存在|需要登录|验证码|访问过于频繁|url source|markdown content|\[.*\]\(https?:\/\/|注册|登录|首页|关闭|网站有错误/i.test(
        text
      )
    ) {
      return false;
    }
    return true;
  });

  const claims: Step3Claim[] = filtered.slice(0, 8).map((x, i) => {
    const sentence = x.text
      .split(/[。！？.!?；;]/)[0]
      ?.trim()
      .slice(0, 120);
    const claim = sentence || x.text.slice(0, 120);
    return {
      id: `c${i + 1}`,
      claim,
      evidence: [{ ref: x.ref, quote: x.text.slice(0, 90) }],
      strength: "中",
    };
  });

  return { claims, contradictions: [] };
}

function buildClaimsFromStep2(step2: unknown): Step3Data {
  const obj = (step2 ?? {}) as {
    facts?: Array<{ label?: string; value?: string; sourceRef?: string }>;
  };
  if (!Array.isArray(obj.facts) || obj.facts.length === 0) {
    return { claims: [], contradictions: [] };
  }

  const claims: Step3Claim[] = obj.facts
    .filter((f) => {
      const label = (f.label || "").trim();
      const value = (f.value || "").trim();
      if (!label || !value) return false;
      if (
        /url|source|markdown|注册|登录|首页|关闭|网站有错误|404|not found|未披露/i.test(
          `${label} ${value}`
        )
      ) {
        return false;
      }
      return true;
    })
    .slice(0, 8)
    .map((f, i) => ({
      id: `c${i + 1}`,
      claim: `${(f.label || "").trim()}：${(f.value || "").trim()}`,
      evidence: [
        {
          ref: (f.sourceRef || "P1-1").trim(),
          quote: `${(f.label || "").trim()} = ${(f.value || "").trim()}`,
        },
      ],
      strength: "中" as const,
    }));

  return { claims, contradictions: [] };
}

function normalizeStep3Data(
  input: unknown,
  materials: Material[],
  step2: unknown
): Step3Data {
  const obj = (input ?? {}) as {
    claims?: Array<{
      id?: string;
      claim?: string;
      evidence?: Array<{ ref?: string; quote?: string }>;
      strength?: "强" | "中" | "弱";
    }>;
    contradictions?: Array<{
      a?: string;
      b?: string;
      refA?: string;
      refB?: string;
    }>;
  };

  const claims: Step3Claim[] = Array.isArray(obj.claims)
    ? obj.claims
        .map((c, i) => {
          const strength: "强" | "中" | "弱" =
            c.strength === "强" || c.strength === "弱" ? c.strength : "中";
          return {
            id: (c.id || `c${i + 1}`).trim(),
            claim: (c.claim || "").trim(),
            evidence: Array.isArray(c.evidence)
              ? c.evidence
                  .map((e) => ({
                    ref: (e.ref || "P1-1").trim(),
                    quote: (e.quote || "").trim(),
                  }))
                  .filter((e) => e.quote.length > 0)
              : [],
            strength,
          };
        })
        .filter((c) => c.claim.length > 0)
    : [];

  const contradictions = Array.isArray(obj.contradictions)
    ? obj.contradictions
        .map((x) => ({
          a: (x.a || "").trim(),
          b: (x.b || "").trim(),
          refA: (x.refA || "P1-1").trim(),
          refB: (x.refB || "P1-1").trim(),
        }))
        .filter((x) => x.a && x.b)
    : [];

  // 关键兜底：
  // 1) 优先从第2步 facts 直接归纳线索（质量更稳）
  // 2) facts 不足再从原文材料归纳
  if (claims.length === 0) {
    const fromFacts = buildClaimsFromStep2(step2);
    if (fromFacts.claims.length > 0) return fromFacts;
    return buildClaimsFromMaterials(materials);
  }

  return { claims, contradictions };
}

async function callOpenAICompatible(
  messages: { role: string; content: string }[],
  cfg: { apiKey: string; baseUrl: string; model: string }
) {
  // 防止 LLM 调用偶发长时间无响应：超时后抛错，外层会回退演示数据。
  const controller = new AbortController();
  const timeoutMs = 45_000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0.2,
        messages,
      }),
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || `LLM HTTP ${res.status}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return data.choices?.[0]?.message?.content ?? null;
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.materials?.length) {
    return NextResponse.json(
      { error: "请至少提供一条材料" },
      { status: 400 }
    );
  }

  const bundled = segmentMaterials(body.materials);

  const system = `你是中文研究助理，只做「材料内」信息整理。禁止编造材料中未出现的事实；未知写「未披露」。输出必须是合法 JSON，不要 Markdown 正文。引用片段编号须来自用户提供的 P数字-数字 格式。`;

  const llm = getLlmConfig();
  const useLLM = Boolean(llm);

  try {
    if (body.step === 2) {
      if (!useLLM || !llm) {
        return NextResponse.json({ ok: true, mode: "mock", data: mockStep2() });
      }
      const user = `以下编号段落为唯一信源：\n\n${bundled}\n\n请输出 JSON：\n{\n  "entities": [{"name":"名称","type":"公司|人|机构|产品|其他","sourceRef":"P1-1"}],\n  "facts": [{"label":"标签","value":"值或未披露","sourceRef":"P1-1"}]\n}`;
      try {
        const text = await callOpenAICompatible(
          [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          llm
        );
        if (!text) {
          return NextResponse.json({ ok: true, mode: "mock", data: mockStep2() });
        }
        const data = parseJsonFromModel(text);
        return NextResponse.json({ ok: true, mode: "llm", data });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "LLM 请求失败";
        return NextResponse.json({
          ok: true,
          mode: "mock",
          data: mockStep2(),
          warning: `LLM 生成失败，已回退演示数据：${msg}`,
        });
      }
    }

    if (body.step === 3) {
      if (!useLLM || !llm) {
        const fromFacts = buildClaimsFromStep2(body.step2);
        return NextResponse.json({
          ok: true,
          mode: "llm",
          data:
            fromFacts.claims.length > 0
              ? fromFacts
              : buildClaimsFromMaterials(body.materials),
          warning: "未配置 LLM，已使用自动归纳生成线索卡。",
        });
      }
      const user = `信源：\n\n${bundled}\n\n已抽取事实（用于归纳主张，优先使用）：${JSON.stringify(
        body.step2 ?? {}
      )}\n\n请输出 JSON：\n{\n  "claims": [{"id":"c1","claim":"一句话主张","evidence":[{"ref":"P1-1","quote":"短引文"}],"strength":"强|中|弱"}],\n  "contradictions": [{"a":"主张A","b":"主张B","refA":"P1-1","refB":"P1-2"}]\n}\n要求：不要输出导航词（如 URL Source、首页、注册、登录、关闭、404）。`;
      try {
        const text = await callOpenAICompatible(
          [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          llm
        );
        if (!text) {
          const fromFacts = buildClaimsFromStep2(body.step2);
          return NextResponse.json({
            ok: true,
            mode: "llm",
            data:
              fromFacts.claims.length > 0
                ? fromFacts
                : buildClaimsFromMaterials(body.materials),
            warning: "LLM 返回为空，已自动归纳生成线索卡。",
          });
        }
        const parsed = parseJsonFromModel(text);
        const normalized = normalizeStep3Data(
          parsed,
          body.materials,
          body.step2
        );
        return NextResponse.json({
          ok: true,
          mode: "llm",
          data: normalized,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "LLM 请求失败";
        const fromFacts = buildClaimsFromStep2(body.step2);
        return NextResponse.json({
          ok: true,
          mode: "llm",
          data:
            fromFacts.claims.length > 0
              ? fromFacts
              : buildClaimsFromMaterials(body.materials),
          warning: `LLM 线索抽取失败，已自动归纳生成线索卡：${msg}`,
        });
      }
    }

    if (body.step === 4) {
      if (!useLLM || !llm) {
        return NextResponse.json({ ok: true, mode: "mock", data: mockStep4() });
      }
      const ctx = JSON.stringify(body.step3 ?? {}, null, 0);
      const user = `信源：\n\n${bundled}\n\n已有线索卡 JSON：${ctx}\n\n请输出 JSON：\n{\n  "timeline": [{"date":"YYYY-MM 或 约YYYY","title":"事件","claimIds":["c1"]}],\n  "narratives": [{"title":"叙事标题","bullets":["…"],"gaps":["…"]}],\n  "gaps": ["信息缺口"]\n}`;
      try {
        const text = await callOpenAICompatible(
          [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          llm
        );
        if (!text) {
          return NextResponse.json({ ok: true, mode: "mock", data: mockStep4() });
        }
        return NextResponse.json({
          ok: true,
          mode: "llm",
          data: parseJsonFromModel(text),
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "LLM 请求失败";
        return NextResponse.json({
          ok: true,
          mode: "mock",
          data: mockStep4(),
          warning: `LLM 生成失败，已回退演示数据：${msg}`,
        });
      }
    }

    if (body.step === 5) {
      if (!useLLM || !llm) {
        return NextResponse.json({ ok: true, mode: "mock", data: mockStep5() });
      }
      const user = `信源：\n\n${bundled}\n\n前序结构化结果 step3:${JSON.stringify(body.step3)} step4:${JSON.stringify(body.step4)}\n\n请输出 JSON：\n{\n  "summary": {\n    "background":"一段",\n    "keyFacts":["…"],\n    "mainClaims":["…"],\n    "contradictions":["…"],\n    "gaps":["…"],\n    "nextChecks":["…"]\n  },\n  "citations": ["P1-1 简述", "…"]\n}`;
      try {
        const text = await callOpenAICompatible(
          [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          llm
        );
        if (!text) {
          return NextResponse.json({ ok: true, mode: "mock", data: mockStep5() });
        }
        return NextResponse.json({
          ok: true,
          mode: "llm",
          data: parseJsonFromModel(text),
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "LLM 请求失败";
        return NextResponse.json({
          ok: true,
          mode: "mock",
          data: mockStep5(),
          warning: `LLM 生成失败，已回退演示数据：${msg}`,
        });
      }
    }

    return NextResponse.json({ error: "Invalid step" }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { error: msg, fallback: "可删除 .env 中 LLM 配置以使用演示数据" },
      { status: 502 }
    );
  }
}
