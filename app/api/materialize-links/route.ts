import { NextRequest, NextResponse } from "next/server";

type SourceCandidate = {
  id: string;
  title: string;
  url: string;
};

type Material = {
  id: string;
  title: string;
  content: string;
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
    const m = await fetchWithTimeout(mirror, 18000);
    if (m.ok) {
      const txt = await m.text();
      if (txt.trim().length > 200) return txt.trim();
    }
  } catch {
    // fallback below
  }

  const res = await fetchWithTimeout(url, 18000);
  const raw = await res.text();
  return htmlToText(raw);
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { selected: SourceCandidate[] };
    const selected = Array.isArray(body.selected) ? body.selected : [];
    if (!selected.length) {
      return NextResponse.json({ error: "请至少选择一条文献" }, { status: 400 });
    }

    const materials: Material[] = [];
    for (let i = 0; i < selected.length; i += 1) {
      const s = selected[i];
      if (!/^https?:\/\//.test(s.url)) continue;
      let text = "";
      try {
        text = await fetchReadableText(s.url);
      } catch {
        text = "";
      }
      materials.push({
        id: `m${i + 1}`,
        title: s.title || `文献 ${i + 1}`,
        content: text
          ? `来源链接：${s.url}\n\n${text.slice(0, 18000)}`
          : `来源链接：${s.url}\n\n（抓取失败：该页面可能需要登录、反爬或动态渲染）`,
      });
    }

    return NextResponse.json({ ok: true, materials });
  } catch {
    return NextResponse.json({ error: "生成材料失败" }, { status: 500 });
  }
}

