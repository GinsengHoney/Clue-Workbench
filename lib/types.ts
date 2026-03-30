export type Material = {
  id: string;
  title: string;
  content: string;
};

export type SourceCandidate = {
  id: string;
  title: string;
  url: string;
  reason?: string;
};

export type EntityRow = { name: string; type: string; sourceRef: string };
export type FactRow = { label: string; value: string; sourceRef: string };
export type ClaimCard = {
  id: string;
  claim: string;
  evidence: { ref: string; quote: string }[];
  strength: "强" | "中" | "弱";
};
export type Contradiction = {
  a: string;
  b: string;
  refA: string;
  refB: string;
};
export type TimelineEvent = {
  date: string;
  title: string;
  claimIds: string[];
};
export type Narrative = { title: string; bullets: string[]; gaps: string[] };
export type SummaryPack = {
  background: string;
  keyFacts: string[];
  mainClaims: string[];
  contradictions: string[];
  gaps: string[];
  nextChecks: string[];
};

export type Step2Result = { entities: EntityRow[]; facts: FactRow[] };
export type Step3Result = { claims: ClaimCard[]; contradictions: Contradiction[] };
export type Step4Result = {
  timeline: TimelineEvent[];
  narratives: Narrative[];
  gaps: string[];
};
export type Step5Result = { summary: SummaryPack; citations: string[] };
