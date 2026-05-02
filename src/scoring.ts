import type { RuleResult, ESTCCoverage, Finding, RuleName } from "./types.js";
import type { ScannedFile } from "./scanner.js";

interface RuleWeight {
  points: number;
  cap: number;
}

const RULE_WEIGHTS: Record<RuleName, RuleWeight> = {
  "state-as-text": { points: 8, cap: 24 },
  "guard-as-prompt": { points: 10, cap: 30 },
  "no-verdict-contract": { points: 15, cap: 15 },
  "belief-commit-confusion": { points: 10, cap: 20 },
  "tool-call-as-commit": { points: 8, cap: 16 },
  "hidden-ssot": { points: 5, cap: 10 },
  "approval-as-chat": { points: 5, cap: 10 },
  "audit-as-afterthought": { points: 5, cap: 10 },
  "transition-less-action": { points: 8, cap: 24 },
  "worldless-orchestration": { points: 5, cap: 10 },
};

export function calculateScore(ruleResults: RuleResult[]): number {
  let total = 0;

  for (const result of ruleResults) {
    const weight = RULE_WEIGHTS[result.rule];
    const raw = result.findings.length * weight.points;
    total += Math.min(raw, weight.cap);
  }

  return Math.min(total, 100);
}

export function computeESTCCoverage(files: ScannedFile[]): ESTCCoverage {
  const allContent = files.map((f) => f.content).join("\n");

  // Entity
  const hasEntityDecl = /\b(entity|entities):\s*\n/i.test(allContent) || /\bEntityDecl\b/i.test(allContent);
  const hasEntityMention = /\bentit(y|ies)\b/i.test(allContent);
  const entity: ESTCCoverage["entity"] = hasEntityDecl ? "present" : hasEntityMention ? "partial" : "missing";

  // State
  const hasStateMachine = /\bstate_machine\b|states:\s*\n/i.test(allContent);
  const hasStateDecl = /\bstate:\s*\w/i.test(allContent) || /\bcurrent_state\b/i.test(allContent);
  const hasStateText = /\bseems|looks (delivered|completed?|approved?)\b/i.test(allContent);
  const state: ESTCCoverage["state"] = hasStateMachine
    ? "present"
    : hasStateDecl
    ? "partial"
    : hasStateText
    ? "weak"
    : "missing";

  // Transition
  const hasTransitionDecl = /\btransitions?:\s*\n/i.test(allContent) || /\bfrom_state|to_state|source_state|target_state\b/i.test(allContent);
  const hasTransitionMention = /\btransition\b/i.test(allContent);
  const transition: ESTCCoverage["transition"] = hasTransitionDecl
    ? "present"
    : hasTransitionMention
    ? "weak"
    : "missing";

  // Constraint
  const hasCodeConstraint = /\bguard\s*:|constraint\s*:|failed_guards\b/i.test(allContent);
  const hasPromptConstraint = /\b(must not|never|only if|unless)\b/i.test(allContent);
  const constraint: ESTCCoverage["constraint"] = hasCodeConstraint
    ? "present"
    : hasPromptConstraint
    ? "prompt-only"
    : "missing";

  // Verdict
  const hasVerdict = /\b(ALLOW|DENY|ESCALATE|verdict|failed_guards|next_state)\b/g.test(allContent);
  const hasPartialVerdict = /\b(approved|denied|rejected)\b/i.test(allContent);
  const verdict: ESTCCoverage["verdict"] = hasVerdict ? "present" : hasPartialVerdict ? "partial" : "missing";

  // Audit
  const hasAuditDecl = /\baudit_ref\b|audit:\s*\w/i.test(allContent);
  const hasAuditMention = /\b(audit|trace|log entry|event log)\b/i.test(allContent);
  const audit: ESTCCoverage["audit"] = hasAuditDecl ? "present" : hasAuditMention ? "partial" : "missing";

  return { entity, state, transition, constraint, verdict, audit };
}

export { RULE_WEIGHTS };
