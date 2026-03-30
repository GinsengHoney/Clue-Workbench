import type {
  Step2Result,
  Step3Result,
  Step4Result,
  Step5Result,
} from "./types";

/** 无 API Key 时的演示数据，保证项目可运行 */
export function mockStep2(): Step2Result {
  return {
    entities: [
      { name: "示例科技", type: "公司", sourceRef: "P1-1" },
      { name: "张某", type: "人", sourceRef: "P1-2" },
    ],
    facts: [
      { label: "成立时间", value: "2021-03", sourceRef: "P1-1" },
      { label: "公开融资", value: "未披露", sourceRef: "—" },
    ],
  };
}

export function mockStep3(): Step3Result {
  return {
    claims: [
      {
        id: "c1",
        claim: "公司主打 ToB SaaS 订阅模式。",
        evidence: [
          { ref: "P1-1", quote: "…以年费订阅服务企业客户…" },
        ],
        strength: "中",
      },
      {
        id: "c2",
        claim: "2024 年曾传出裁员，规模未证实。",
        evidence: [{ ref: "P1-2", quote: "…业内消息称团队收缩…" }],
        strength: "弱",
      },
    ],
    contradictions: [
      {
        a: "媒体报道称增长稳健",
        b: "同一时期有裁员传闻",
        refA: "P1-1",
        refB: "P1-2",
      },
    ],
  };
}

export function mockStep4(): Step4Result {
  return {
    timeline: [
      { date: "2021-03", title: "公司成立", claimIds: ["c1"] },
      { date: "2024-06", title: "裁员传闻（待核实）", claimIds: ["c2"] },
    ],
    narratives: [
      {
        title: "叙事 A：正常增长期调整",
        bullets: ["订阅收入支撑运营", "人员优化属常规"],
        gaps: ["缺少财报或官方说明"],
      },
      {
        title: "叙事 B：增长承压",
        bullets: ["裁员传闻若属实可能反映现金流压力"],
        gaps: ["传闻未获官方证实"],
      },
    ],
    gaps: ["竞品份额", "实际续约率", "监管环境"],
  };
}

export function mockStep5(): Step5Result {
  return {
    summary: {
      background: "基于已粘贴的示例材料整理的演示摘要。",
      keyFacts: ["2021-03 成立", "商业模式为 ToB 订阅（材料内描述）"],
      mainClaims: ["订阅制 ToB", "存在未证实裁员传闻"],
      contradictions: ["增长表述与裁员传闻需交叉验证"],
      gaps: ["融资细节、客户数、官方回应"],
      nextChecks: ["检索近一年权威报道", "核对工商变更与招聘趋势"],
    },
    citations: ["P1-1 材料片段一", "P1-2 材料片段二"],
  };
}
