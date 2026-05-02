export type FileType =
  | "prompt"
  | "tool"
  | "workflow"
  | "doc"
  | "world"
  | "verdict"
  | "unknown";

export type Severity = "high" | "medium" | "low";

export interface Finding {
  rule: RuleName;
  file: string;
  line?: number;
  excerpt: string;
  severity: Severity;
}

export type RuleName =
  | "state-as-text"
  | "transition-less-action"
  | "guard-as-prompt"
  | "belief-commit-confusion"
  | "no-verdict-contract"
  | "tool-call-as-commit"
  | "hidden-ssot"
  | "approval-as-chat"
  | "audit-as-afterthought"
  | "worldless-orchestration";

export interface RuleResult {
  rule: RuleName;
  findings: Finding[];
}

export interface ESTCCoverage {
  entity: "missing" | "partial" | "present";
  state: "missing" | "weak" | "partial" | "present";
  transition: "missing" | "weak" | "partial" | "present";
  constraint: "missing" | "prompt-only" | "partial" | "present";
  verdict: "missing" | "partial" | "present";
  audit: "missing" | "partial" | "present";
}

export interface ScanResult {
  path: string;
  score: number;
  findings: Finding[];
  estc: ESTCCoverage;
  ruleResults: RuleResult[];
}

export interface ScanOptions {
  include?: string;
  exclude?: string;
  failOn?: number;
  json?: boolean;
}
