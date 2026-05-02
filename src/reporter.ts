import type { ScanResult, RuleName, ESTCCoverage } from "./types.js";

const RULE_DISPLAY_NAMES: Record<RuleName, string> = {
  "state-as-text": "State as Text",
  "transition-less-action": "Transition-less Action",
  "guard-as-prompt": "Guard as Prompt",
  "belief-commit-confusion": "Belief-Commit Confusion",
  "no-verdict-contract": "No Verdict Contract",
  "tool-call-as-commit": "Tool Call as Commit",
  "hidden-ssot": "Hidden SSOT",
  "approval-as-chat": "Approval as Chat",
  "audit-as-afterthought": "Audit as Afterthought",
  "worldless-orchestration": "Worldless Orchestration",
};

const RECOMMENDATIONS: Record<RuleName, string> = {
  "state-as-text": "Replace vague state language with committed, typed state from a world model.",
  "transition-less-action": "Declare source and target states for every action in tool configs.",
  "guard-as-prompt": "Move prompt-only constraints into executable guards with structured ALLOW/DENY output.",
  "belief-commit-confusion": "Separate belief state (inferred) from committed state (persisted).",
  "no-verdict-contract": "Return structured ALLOW / DENY / ESCALATE verdicts from agent decision points.",
  "tool-call-as-commit": "Treat tool calls as intents, not commits — add audit_ref and state transition on success.",
  "hidden-ssot": "Declare a canonical_state source and make all agents read from it.",
  "approval-as-chat": "Replace chat-based approval with a declared approval_state and escalation path.",
  "audit-as-afterthought": "Emit an audit event for every state-changing action.",
  "worldless-orchestration": "Define a shared world model (entity, state, transition, constraint) for all agents.",
};

function scoreBar(score: number): string {
  const filled = Math.round(score / 5);
  const bar = "█".repeat(filled) + "░".repeat(20 - filled);
  return `[${bar}] ${score}/100`;
}

function estcLabel(value: string): string {
  return value.padEnd(12);
}

export function formatText(result: ScanResult): string {
  const lines: string[] = [];

  lines.push("");
  lines.push(`World Debt Score: ${scoreBar(result.score)}`);
  lines.push("");

  const activeRules = result.ruleResults.filter((r) => r.findings.length > 0);

  if (activeRules.length === 0) {
    lines.push("No anti-patterns detected.");
  } else {
    lines.push("Detected anti-patterns:");
    for (const r of activeRules) {
      const name = RULE_DISPLAY_NAMES[r.rule];
      const count = r.findings.length;
      lines.push(`  - ${name}: ${count} occurrence${count !== 1 ? "s" : ""}`);
    }
  }

  lines.push("");
  lines.push("ESTC coverage:");
  const e = result.estc;
  lines.push(`  Entity:     ${estcLabel(e.entity)}`);
  lines.push(`  State:      ${estcLabel(e.state)}`);
  lines.push(`  Transition: ${estcLabel(e.transition)}`);
  lines.push(`  Constraint: ${estcLabel(e.constraint)}`);
  lines.push(`  Verdict:    ${estcLabel(e.verdict)}`);
  lines.push(`  Audit:      ${estcLabel(e.audit)}`);

  // Top findings — pick most actionable (highest severity first, then rule priority order)
  const allFindings = result.findings
    .filter((f) => f.file !== "(directory)")
    .sort((a, b) => {
      const sv = { high: 0, medium: 1, low: 2 };
      return sv[a.severity] - sv[b.severity];
    })
    .slice(0, 5);

  const directoryFindings = result.findings.filter((f) => f.file === "(directory)");
  const topFindings = [...allFindings, ...directoryFindings].slice(0, 5);

  if (topFindings.length > 0) {
    lines.push("");
    lines.push("Top findings:");
    topFindings.forEach((f, i) => {
      const loc = f.file === "(directory)" ? f.file : f.line ? `${f.file}:${f.line}` : f.file;
      lines.push(`  ${i + 1}. ${loc}: "${f.excerpt}"`);
    });
  }

  const triggeredRules = new Set(activeRules.map((r) => r.rule));
  if (triggeredRules.size > 0) {
    lines.push("");
    lines.push("Recommendations:");
    for (const rule of triggeredRules) {
      lines.push(`  - ${RECOMMENDATIONS[rule]}`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

export function formatJson(result: ScanResult): string {
  return JSON.stringify(
    {
      path: result.path,
      score: result.score,
      estc: result.estc,
      antiPatterns: result.ruleResults
        .filter((r) => r.findings.length > 0)
        .map((r) => ({
          rule: r.rule,
          displayName: RULE_DISPLAY_NAMES[r.rule],
          occurrences: r.findings.length,
          findings: r.findings.map((f) => ({
            file: f.file,
            line: f.line ?? null,
            excerpt: f.excerpt,
            severity: f.severity,
          })),
        })),
    },
    null,
    2
  );
}
