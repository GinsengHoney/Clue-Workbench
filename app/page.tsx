"use client";

import { useCallback, useMemo, useState } from "react";
import type {
  ClaimCard,
  Material,
  SourceCandidate,
  Step2Result,
  Step3Result,
  Step4Result,
  Step5Result,
} from "@/lib/types";
import { segmentMaterials } from "@/lib/segment";

const STEPS = [
  { n: 1, title: "放入材料", sub: "输入关键词检索文献，勾选后自动抓取正文" },
  { n: 2, title: "实体与事实", sub: "谁、何时、多少——仅基于材料" },
  { n: 3, title: "线索卡", sub: "主张 + 证据片段 + 矛盾对" },
  { n: 4, title: "时间线与叙事", sub: "串起来看，标出缺口" },
  { n: 5, title: "一页摘要", sub: "交付物 + 引用列表" },
] as const;

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export default function Home() {
  const [step, setStep] = useState(1);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [keyword, setKeyword] = useState("");
  const [sources, setSources] = useState<SourceCandidate[]>([]);
  const [pickedIds, setPickedIds] = useState<string[]>([]);
  const [manualUrl, setManualUrl] = useState("");
  const [manualTitle, setManualTitle] = useState("");
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [loadingMaterialize, setLoadingMaterialize] = useState(false);
  const [loading, setLoading] = useState(false);
  const [apiMode, setApiMode] = useState<"mock" | "llm" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [s2, setS2] = useState<Step2Result | null>(null);
  const [s3, setS3] = useState<Step3Result | null>(null);
  const [s4, setS4] = useState<Step4Result | null>(null);
  const [s5, setS5] = useState<Step5Result | null>(null);

  const preview = useMemo(
    () => segmentMaterials(materials),
    [materials]
  );

  const searchSources = useCallback(async () => {
    const kw = keyword.trim();
    if (!kw) {
      setErr("请先输入关键词");
      return;
    }
    setLoadingSearch(true);
    setErr(null);
    try {
      const res = await fetch("/api/source-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: kw }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || res.statusText);
      setSources(json.sources || []);
      setPickedIds([]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "检索失败");
    } finally {
      setLoadingSearch(false);
    }
  }, [keyword]);

  const addManualLink = () => {
    const url = manualUrl.trim();
    if (!/^https?:\/\//.test(url)) {
      setErr("请填写有效链接（http/https 开头）");
      return;
    }
    const item: SourceCandidate = {
      id: uid(),
      title: manualTitle.trim() || "手动添加链接",
      url,
      reason: "用户手动添加",
    };
    setSources((prev) => [item, ...prev]);
    setPickedIds((prev) => [item.id, ...prev]);
    setManualUrl("");
    setManualTitle("");
    setErr(null);
  };

  const materializeAndContinue = useCallback(async () => {
    const selected = sources.filter((s) => pickedIds.includes(s.id));
    if (!selected.length) {
      setErr("请至少选择一条文献");
      return;
    }
    setLoadingMaterialize(true);
    setErr(null);
    try {
      const res = await fetch("/api/materialize-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selected }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || res.statusText);
      setMaterials(json.materials || []);
      setStep(2);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "抓取文献失败");
    } finally {
      setLoadingMaterialize(false);
    }
  }, [pickedIds, sources]);

  const runStep = useCallback(
    async (target: 2 | 3 | 4 | 5) => {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch("/api/workbench", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            step: target,
            materials,
            step2: s2,
            step3: s3,
            step4: s4,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || res.statusText);
        setApiMode(json.mode ?? null);
        if (json.warning && typeof json.warning === "string") setErr(json.warning);
        if (target === 2) setS2(json.data as Step2Result);
        if (target === 3) setS3(json.data as Step3Result);
        if (target === 4) setS4(json.data as Step4Result);
        if (target === 5) setS5(json.data as Step5Result);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "请求失败");
      } finally {
        setLoading(false);
      }
    },
    [materials, s2, s3, s4]
  );

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 pb-24">
      <header className="mb-10 border-b border-mist pb-8">
        <p className="text-sm font-medium uppercase tracking-widest text-rust">
          Clue Workbench
        </p>
        <h1 className="font-display mt-2 text-3xl font-semibold text-ink md:text-4xl">
          线索工作台
        </h1>
        <p className="mt-3 max-w-xl text-ink/75">
          分步整理材料 → 实体与事实 → 线索卡 → 时间线 → 摘要。配置 LLM 后走真实生成；未配置时使用内置演示数据，仍可完整点通流程。
        </p>
      </header>

      <nav className="mb-8 flex flex-wrap gap-2">
        {STEPS.map((s) => (
          <button
            key={s.n}
            type="button"
            onClick={() => setStep(s.n)}
            className={`rounded-full px-3 py-1 text-sm transition ${
              step === s.n
                ? "bg-moss text-white"
                : "bg-mist/80 text-ink/80 hover:bg-mist"
            }`}
          >
            {s.n}. {s.title}
          </button>
        ))}
      </nav>

      {apiMode && (
        <p className="mb-4 rounded-lg border border-mist bg-white/50 px-3 py-2 text-sm text-ink/70">
          上次请求模式：<strong>{apiMode === "llm" ? "LLM 生成" : "演示数据"}</strong>
        </p>
      )}

      {err && (
        <p className="mb-4 rounded-lg border border-rust/40 bg-rust/10 px-3 py-2 text-sm text-rust">
          {err}
        </p>
      )}

      {/* Step 1 */}
      {step === 1 && (
        <section className="space-y-6">
          <div>
            <h2 className="font-display text-xl font-semibold text-ink">
              {STEPS[0].title}
            </h2>
            <p className="mt-1 text-sm text-ink/65">{STEPS[0].sub}</p>
          </div>
          <div className="rounded-xl border border-mist bg-white/40 p-4 shadow-sm">
            <label className="block text-sm font-medium text-ink/80">关键词</label>
            <div className="mt-1 flex gap-2">
              <input
                className="w-full rounded border border-mist bg-paper px-3 py-2 text-sm"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="如：教育创业 失败案例 / AI 创业 融资受挫"
              />
              <button
                type="button"
                onClick={searchSources}
                disabled={loadingSearch}
                className="rounded-lg bg-moss px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {loadingSearch ? "检索中…" : "AI检索文献"}
              </button>
            </div>
            <p className="mt-2 text-xs text-ink/55">
              检索结果可勾选；也可手动补充链接。
            </p>
            <div className="mt-4 grid gap-2 md:grid-cols-[1fr,1fr,auto]">
              <input
                className="rounded border border-mist bg-paper px-3 py-2 text-sm"
                value={manualTitle}
                onChange={(e) => setManualTitle(e.target.value)}
                placeholder="手动标题（可选）"
              />
              <input
                className="rounded border border-mist bg-paper px-3 py-2 text-sm"
                value={manualUrl}
                onChange={(e) => setManualUrl(e.target.value)}
                placeholder="https://..."
              />
              <button
                type="button"
                onClick={addManualLink}
                className="rounded-lg border border-moss px-3 py-2 text-sm text-moss hover:bg-moss/5"
              >
                添加链接
              </button>
            </div>
          </div>
          <ul className="space-y-3">
            {sources.map((s) => (
              <li key={s.id} className="rounded-xl border border-mist bg-white/30 p-4">
                <div className="flex items-start justify-between gap-3">
                  <label className="flex cursor-pointer gap-3">
                    <input
                      type="checkbox"
                      checked={pickedIds.includes(s.id)}
                      onChange={(e) =>
                        setPickedIds((prev) =>
                          e.target.checked
                            ? [...prev, s.id]
                            : prev.filter((id) => id !== s.id)
                        )
                      }
                    />
                    <span>
                      <p className="font-medium text-ink">{s.title}</p>
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 block break-all text-xs text-moss hover:underline"
                      >
                        {s.url}
                      </a>
                      {s.reason && (
                        <p className="mt-1 text-xs text-ink/60">{s.reason}</p>
                      )}
                    </span>
                  </label>
                  <button
                    type="button"
                    className="text-xs text-rust hover:underline"
                    onClick={() => {
                      setSources((prev) => prev.filter((x) => x.id !== s.id));
                      setPickedIds((prev) => prev.filter((id) => id !== s.id));
                    }}
                  >
                    删除
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={materializeAndContinue}
              disabled={loadingMaterialize}
              className="rounded-lg bg-moss px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {loadingMaterialize ? "抓取正文中…" : "确定文献并进入整理 →"}
            </button>
            <span className="self-center text-xs text-ink/55">
              已选择 {pickedIds.length} 条
            </span>
          </div>

          {!!materials.length && (
            <>
          <ul className="space-y-3">
            {materials.map((m, i) => (
              <li
                key={m.id}
                className="rounded-xl border border-mist bg-white/30 p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-ink">{m.title}</span>
                  <button
                    type="button"
                    className="text-xs text-rust hover:underline"
                    onClick={() =>
                      setMaterials((list) => list.filter((x) => x.id !== m.id))
                    }
                  >
                    删除
                  </button>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-ink/75">
                  {m.content}
                </p>
                <p className="mt-2 text-xs text-ink/45">材料序号：第 {i + 1} 条</p>
              </li>
            ))}
          </ul>
          <div>
            <p className="text-sm font-medium text-ink/80">编号预览（引用用）</p>
            <pre className="mt-2 max-h-48 overflow-auto rounded-lg border border-mist bg-ink/[0.03] p-3 text-xs leading-relaxed text-ink/80">
              {preview}
            </pre>
          </div>
            </>
          )}
        </section>
      )}

      {step === 2 && (
        <StepPanel
          title={STEPS[1].title}
          sub={STEPS[1].sub}
          onBack={() => setStep(1)}
          onRun={() => runStep(2)}
          loading={loading}
          onNext={() => setStep(3)}
        >
          {s2 ? (
            <div className="space-y-4 text-sm">
              <h3 className="font-semibold text-ink">实体</h3>
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-mist text-ink/55">
                    <th className="py-2 pr-2">名称</th>
                    <th className="py-2 pr-2">类型</th>
                    <th className="py-2">出处</th>
                  </tr>
                </thead>
                <tbody>
                  {s2.entities.map((r, i) => (
                    <tr key={i} className="border-b border-mist/60">
                      <td className="py-2 pr-2">{r.name}</td>
                      <td className="py-2 pr-2">{r.type}</td>
                      <td className="py-2 font-mono text-xs">{r.sourceRef}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <h3 className="font-semibold text-ink">事实</h3>
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-mist text-ink/55">
                    <th className="py-2 pr-2">标签</th>
                    <th className="py-2 pr-2">值</th>
                    <th className="py-2">出处</th>
                  </tr>
                </thead>
                <tbody>
                  {s2.facts.map((r, i) => (
                    <tr key={i} className="border-b border-mist/60">
                      <td className="py-2 pr-2">{r.label}</td>
                      <td className="py-2 pr-2">{r.value}</td>
                      <td className="py-2 font-mono text-xs">{r.sourceRef}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-ink/60">点击「抽取实体与时间线素材」生成。</p>
          )}
        </StepPanel>
      )}

      {step === 3 && (
        <StepPanel
          title={STEPS[2].title}
          sub={STEPS[2].sub}
          onBack={() => setStep(2)}
          onRun={() => runStep(3)}
          loading={loading}
          onNext={() => setStep(4)}
        >
          {s3 ? (
            <div className="space-y-6 text-sm">
              <div className="space-y-3">
                {Array.isArray((s3 as any).claims) ? (
                  (s3 as any).claims.length === 0 ? (
                    <div className="rounded-lg border border-mist bg-white/40 p-3">
                      <p className="font-medium text-ink">没有生成线索卡</p>
                      <p className="mt-1 text-sm text-ink/70">
                        这次返回了 <span className="font-mono">claims: []</span>。常见原因是：
                      </p>
                      <ul className="mt-2 list-inside list-disc text-sm text-ink/70">
                        <li>抓取到的文献正文过短，或只抓到了 “404 / 未找到 / 需要登录”。</li>
                        <li>材料里缺少可提炼的事实句（全是导航、广告、评论区等噪声）。</li>
                        <li>模型偶发抽取失败（可重试一次）。</li>
                      </ul>
                      <p className="mt-2 text-sm text-ink/70">
                        建议：回到第 1 步换一个链接/关键词，或在第 1 步手动添加可直接打开的文章链接，然后重新抓取正文再生成。
                      </p>
                    </div>
                  ) : (
                    (s3 as any).claims.map((c: ClaimCard) => (
                  <div
                    key={c.id}
                    className="rounded-lg border border-mist bg-white/40 p-3"
                  >
                    <p className="font-medium text-ink">{c.claim}</p>
                    <p className="mt-1 text-xs text-moss">强度：{c.strength}</p>
                    <ul className="mt-2 space-y-1 text-ink/75">
                      {c.evidence.map((e, j) => (
                        <li key={j} className="text-xs">
                          <span className="font-mono text-moss">{e.ref}</span>{" "}
                          {e.quote}
                        </li>
                      ))}
                    </ul>
                  </div>
                    ))
                  )
                ) : (
                  <p className="text-sm text-ink/60">
                    返回数据结构异常：缺少 `claims` 列表。请重试生成一次，或稍后我可以帮你打印原始响应调试。
                  </p>
                )}
              </div>
              {Array.isArray((s3 as any).contradictions) &&
              (s3 as any).contradictions.length > 0 ? (
                <div>
                  <h3 className="font-semibold text-ink">矛盾线索</h3>
                  <ul className="mt-2 space-y-2">
                    {(s3 as any).contradictions.map((x: any, i: number) => (
                      <li
                        key={i}
                        className="rounded border border-rust/20 bg-rust/5 p-2 text-xs"
                      >
                        <p>A：{x.a}</p>
                        <p className="mt-1">B：{x.b}</p>
                        <p className="mt-1 font-mono text-ink/55">
                          {x.refA} / {x.refB}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-ink/60">点击「生成线索卡」。</p>
          )}
        </StepPanel>
      )}

      {step === 4 && (
        <StepPanel
          title={STEPS[3].title}
          sub={STEPS[3].sub}
          onBack={() => setStep(3)}
          onRun={() => runStep(4)}
          loading={loading}
          onNext={() => setStep(5)}
        >
          {s4 ? (
            <div className="space-y-4 text-sm">
              <h3 className="font-semibold text-ink">时间线</h3>
              <ul className="border-l-2 border-moss/40 pl-4">
                {s4.timeline.map((ev, i) => (
                  <li key={i} className="mb-3">
                    <span className="font-mono text-xs text-moss">{ev.date}</span>
                    <p className="font-medium">{ev.title}</p>
                    <p className="text-xs text-ink/50">
                      关联线索：{ev.claimIds?.join(", ")}
                    </p>
                  </li>
                ))}
              </ul>
              <h3 className="font-semibold text-ink">叙事草案</h3>
              {s4.narratives.map((n, i) => (
                <div key={i} className="rounded-lg border border-mist p-3">
                  <p className="font-medium">{n.title}</p>
                  <ul className="mt-2 list-inside list-disc text-ink/75">
                    {n.bullets.map((b, j) => (
                      <li key={j}>{b}</li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-rust">缺口：{n.gaps.join("；")}</p>
                </div>
              ))}
              <div>
                <h3 className="font-semibold text-ink">信息缺口</h3>
                <ul className="mt-1 list-inside list-disc text-ink/70">
                  {s4.gaps.map((g, i) => (
                    <li key={i}>{g}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <p className="text-sm text-ink/60">点击「生成时间线」。</p>
          )}
        </StepPanel>
      )}

      {step === 5 && (
        <StepPanel
          title={STEPS[4].title}
          sub={STEPS[4].sub}
          onBack={() => setStep(4)}
          onRun={() => runStep(5)}
          loading={loading}
        >
          {s5 ? (
            <div className="space-y-4 text-sm">
              <div className="rounded-xl border border-moss/30 bg-white/50 p-4">
                <h3 className="font-display text-lg font-semibold">执行摘要</h3>
                <p className="mt-2 text-ink/80">{s5.summary.background}</p>
                <SectionList title="关键事实" items={s5.summary.keyFacts} />
                <SectionList title="主要线索" items={s5.summary.mainClaims} />
                <SectionList
                  title="矛盾与待验证"
                  items={s5.summary.contradictions}
                />
                <SectionList title="缺口" items={s5.summary.gaps} />
                <SectionList title="建议下一步核实" items={s5.summary.nextChecks} />
              </div>
              <div>
                <h3 className="font-semibold">引用列表</h3>
                <ul className="mt-2 space-y-1 font-mono text-xs text-ink/70">
                  {s5.citations.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <p className="text-sm text-ink/60">点击「生成一页摘要」。</p>
          )}
        </StepPanel>
      )}

      <footer className="fixed bottom-0 left-0 right-0 border-t border-mist bg-paper/95 px-4 py-3 text-center text-xs text-ink/50 backdrop-blur">
        AI 辅助生成，请以原文引用为准；重要决策请人工核实。
      </footer>
    </main>
  );
}

function StepPanel({
  title,
  sub,
  children,
  onBack,
  onRun,
  onNext,
  loading,
}: {
  title: string;
  sub: string;
  children: React.ReactNode;
  onBack: () => void;
  onRun: () => void;
  onNext?: () => void;
  loading: boolean;
}) {
  const labels: Record<number, string> = {
    2: "抽取实体与时间线素材",
    3: "生成线索卡",
    4: "生成时间线",
    5: "生成一页摘要",
  };
  const stepNum =
    title === STEPS[1].title
      ? 2
      : title === STEPS[2].title
        ? 3
        : title === STEPS[3].title
          ? 4
          : 5;
  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-display text-xl font-semibold text-ink">{title}</h2>
        <p className="mt-1 text-sm text-ink/65">{sub}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-mist px-3 py-2 text-sm hover:bg-mist/50"
        >
          ← 上一步
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={onRun}
          className="rounded-lg bg-moss px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading ? "处理中…" : labels[stepNum]}
        </button>
        {onNext && (
          <button
            type="button"
            onClick={onNext}
            className="rounded-lg border border-moss px-3 py-2 text-sm text-moss hover:bg-moss/5"
          >
            下一步 →
          </button>
        )}
      </div>
      <div className="rounded-xl border border-mist bg-white/30 p-4">{children}</div>
    </section>
  );
}

function SectionList({ title, items }: { title: string; items: string[] }) {
  if (!items?.length) return null;
  return (
    <div className="mt-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink/45">
        {title}
      </p>
      <ul className="mt-1 list-inside list-disc text-ink/80">
        {items.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
    </div>
  );
}
