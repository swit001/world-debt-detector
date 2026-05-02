import type { ScannedFile } from "./scanner.js";
import type { Finding, RuleName, RuleResult, Severity } from "./types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findAll(
  content: string,
  pattern: RegExp,
  file: string,
  rule: RuleName,
  severity: Severity,
  excerptFn?: (match: RegExpExecArray) => string
): Finding[] {
  const findings: Finding[] = [];
  const lines = content.split("\n");
  const global = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g");
  let m: RegExpExecArray | null;

  while ((m = global.exec(content)) !== null) {
    const lineIndex = content.slice(0, m.index).split("\n").length;
    const excerpt = excerptFn ? excerptFn(m) : lines[lineIndex - 1]?.trim() ?? m[0];
    findings.push({ rule, file, line: lineIndex, excerpt: excerpt.slice(0, 120), severity });
  }

  return findings;
}

function windowNear(content: string, anchorPattern: RegExp, nearPattern: RegExp, windowChars = 300): boolean {
  const global = new RegExp(anchorPattern.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = global.exec(content)) !== null) {
    const start = Math.max(0, m.index - windowChars);
    const end = Math.min(content.length, m.index + windowChars);
    const window = content.slice(start, end);
    if (nearPattern.test(window)) return true;
  }
  return false;
}

function findNear(
  content: string,
  anchorPattern: RegExp,
  nearPattern: RegExp,
  file: string,
  rule: RuleName,
  severity: Severity,
  windowChars = 300
): Finding[] {
  const findings: Finding[] = [];
  const lines = content.split("\n");
  const global = new RegExp(anchorPattern.source, "gi");
  let m: RegExpExecArray | null;

  while ((m = global.exec(content)) !== null) {
    const start = Math.max(0, m.index - windowChars);
    const end = Math.min(content.length, m.index + windowChars);
    const window = content.slice(start, end);
    if (nearPattern.test(window)) {
      const lineIndex = content.slice(0, m.index).split("\n").length;
      const excerpt = lines[lineIndex - 1]?.trim() ?? m[0];
      findings.push({ rule, file, line: lineIndex, excerpt: excerpt.slice(0, 120), severity });
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Rule 1: State as Text
// ---------------------------------------------------------------------------

const STATE_AS_TEXT_PATTERNS = [
  /seems (delivered|completed?|approved?|done|finished|ready)/gi,
  /looks (delivered|completed?|approved?|done|finished|ready)/gi,
  /probably (approved?|delivered|completed?|done|finished)/gi,
  /assume[sd]? the (order|item|request|task|payment|shipment) is/gi,
  /status appears? to be/gi,
];

export function ruleStateAsText(files: ScannedFile[]): RuleResult {
  const findings: Finding[] = [];

  for (const f of files) {
    if (f.fileType === "unknown" || f.fileType === "world" || f.fileType === "verdict") continue;

    const isPromptOrWorkflow = f.fileType === "prompt" || f.fileType === "workflow";
    const severity: Severity = isPromptOrWorkflow ? "high" : "medium";

    if (f.fileType === "doc") {
      // Only flag docs when near action/commit language
      const hasActionLanguage = /\b(mark|commit|update record|approve|refund|cancel|launch|send)\b/i.test(f.content);
      if (!hasActionLanguage) continue;
    }

    for (const pattern of STATE_AS_TEXT_PATTERNS) {
      findings.push(...findAll(f.content, pattern, f.relativePath, "state-as-text", severity));
    }
  }

  return { rule: "state-as-text", findings };
}

// ---------------------------------------------------------------------------
// Rule 2: Transition-less Action
// ---------------------------------------------------------------------------

const ACTION_TOOL_NAMES = [
  /\brefundPayment\b/g,
  /\bcancelOrder\b/g,
  /\bapproveOffer\b/g,
  /\blaunchCampaign\b/g,
  /\bpauseCampaign\b/g,
  /\bsendEmail\b/g,
  /\bdeleteRecord\b/g,
  /\bcommitTransaction\b/g,
  /\bprocessPayment\b/g,
];

const TRANSITION_INDICATORS = /\b(from_state|to_state|source_state|target_state|transition|from:|to:)\b/i;

export function ruleTransitionlessAction(files: ScannedFile[]): RuleResult {
  const findings: Finding[] = [];

  for (const f of files) {
    if (f.fileType !== "tool" && f.fileType !== "workflow" && f.fileType !== "prompt") continue;

    for (const pattern of ACTION_TOOL_NAMES) {
      const global = new RegExp(pattern.source, "g");
      let m: RegExpExecArray | null;
      while ((m = global.exec(f.content)) !== null) {
        const start = Math.max(0, m.index - 400);
        const end = Math.min(f.content.length, m.index + 400);
        const window = f.content.slice(start, end);
        if (!TRANSITION_INDICATORS.test(window)) {
          const lineIndex = f.content.slice(0, m.index).split("\n").length;
          const lines = f.content.split("\n");
          const excerpt = lines[lineIndex - 1]?.trim() ?? m[0];
          findings.push({
            rule: "transition-less-action",
            file: f.relativePath,
            line: lineIndex,
            excerpt: excerpt.slice(0, 120),
            severity: "high",
          });
        }
      }
    }
  }

  return { rule: "transition-less-action", findings };
}

// ---------------------------------------------------------------------------
// Rule 3: Guard as Prompt
// ---------------------------------------------------------------------------

const STRONG_GUARD_PATTERNS = [
  /\b(must not|must never)\s+(approve|refund|launch|cancel|send|update|delete|commit)\b/gi,
  /\b(do not|don't|never)\s+(approve|refund|launch|cancel|send|update|delete|commit)\b/gi,
  /\bonly\s+(refund|approve|launch|cancel|send|update|delete|commit)\s+if\b/gi,
  /\bunless (approved|authorized|confirmed)\b/gi,
];

// "only if" and "unless" only in prompt files
const PROMPT_ONLY_GUARD_PATTERNS = [
  /\bonly\s+(refund|approve|launch|cancel|send|update|delete|commit)\s+if\b/gi,
  /\bunless (approved|authorized|confirmed)\b/gi,
];

export function ruleGuardAsPrompt(files: ScannedFile[]): RuleResult {
  const findings: Finding[] = [];

  for (const f of files) {
    if (f.fileType === "world" || f.fileType === "verdict" || f.fileType === "unknown") continue;

    const isPrompt = f.fileType === "prompt";
    const isDoc = f.fileType === "doc";

    if (isDoc) {
      // Only flag docs with strong "must not <action>" patterns
      const mustNotAction = /\b(must not|must never)\s+(approve|refund|launch|cancel|send|update|delete|commit)\b/gi;
      findings.push(...findAll(f.content, mustNotAction, f.relativePath, "guard-as-prompt", "medium"));
      continue;
    }

    if (isPrompt) {
      for (const p of STRONG_GUARD_PATTERNS) {
        findings.push(...findAll(f.content, p, f.relativePath, "guard-as-prompt", "high"));
      }
    } else {
      // tool/workflow: only flag "must not <action>" patterns
      const mustNotAction = /\b(must not|must never)\s+(approve|refund|launch|cancel|send|update|delete|commit)\b/gi;
      findings.push(...findAll(f.content, mustNotAction, f.relativePath, "guard-as-prompt", "medium"));
    }
  }

  return { rule: "guard-as-prompt", findings };
}

// ---------------------------------------------------------------------------
// Rule 4: Belief-Commit Confusion
// ---------------------------------------------------------------------------

const BELIEF_PATTERNS = /\b(I believe|probably|likely|inferred state|assume[sd]? state|looks delivered|seems completed?)\b/gi;
const COMMIT_PATTERNS = /\b(mark(ed)? (as )?(done|complete)|update record|commit|approve|refund|cancel|launch|send)\b/gi;

export function ruleBeliefCommitConfusion(files: ScannedFile[]): RuleResult {
  const findings: Finding[] = [];

  for (const f of files) {
    if (f.fileType === "world" || f.fileType === "verdict" || f.fileType === "unknown") continue;

    // Standalone belief/commit in docs — skip unless near each other
    findings.push(...findNear(f.content, BELIEF_PATTERNS, COMMIT_PATTERNS, f.relativePath, "belief-commit-confusion", "high", 400));
  }

  return { rule: "belief-commit-confusion", findings };
}

// ---------------------------------------------------------------------------
// Rule 5: No Verdict Contract (binary, directory-level)
// ---------------------------------------------------------------------------

const VERDICT_TERMS = /\b(ALLOW|DENY|ESCALATE|verdict|failed_guards|next_state)\b/g;
const AGENT_PRESENCE = /\b(agent|tool|workflow|prompt|orchestrat)\b/gi;

export function ruleNoVerdictContract(files: ScannedFile[]): RuleResult {
  const hasAgentFiles = files.some(
    (f) => f.fileType === "prompt" || f.fileType === "tool" || f.fileType === "workflow"
  );

  if (!hasAgentFiles) return { rule: "no-verdict-contract", findings: [] };

  const allContent = files.map((f) => f.content).join("\n");
  if (VERDICT_TERMS.test(allContent)) return { rule: "no-verdict-contract", findings: [] };

  return {
    rule: "no-verdict-contract",
    findings: [
      {
        rule: "no-verdict-contract",
        file: "(directory)",
        excerpt: "No ALLOW / DENY / ESCALATE / verdict / failed_guards / next_state found across agent files",
        severity: "high",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Rule 6: Tool Call as Commit
// ---------------------------------------------------------------------------

const TOOL_COMMIT_PATTERNS = [
  /\b(tool call completed|API call succeeded|api call succeeded)\b/gi,
  /\bmark(ed)?\s+(as\s+)?(complete|done|finished)\b/gi,
  /\bupdate\s+record\b/gi,
];

const AUDIT_COMMIT_NEARBY = /\b(audit|commit|rollback|state transition|audit_ref|event|log entry)\b/gi;

export function ruleToolCallAsCommit(files: ScannedFile[]): RuleResult {
  const findings: Finding[] = [];

  for (const f of files) {
    if (f.fileType === "world" || f.fileType === "verdict" || f.fileType === "unknown") continue;

    for (const p of TOOL_COMMIT_PATTERNS) {
      const global = new RegExp(p.source, "gi");
      let m: RegExpExecArray | null;
      while ((m = global.exec(f.content)) !== null) {
        const start = Math.max(0, m.index - 300);
        const end = Math.min(f.content.length, m.index + 300);
        const window = f.content.slice(start, end);
        if (!AUDIT_COMMIT_NEARBY.test(window)) {
          const lineIndex = f.content.slice(0, m.index).split("\n").length;
          const lines = f.content.split("\n");
          const excerpt = lines[lineIndex - 1]?.trim() ?? m[0];
          findings.push({
            rule: "tool-call-as-commit",
            file: f.relativePath,
            line: lineIndex,
            excerpt: excerpt.slice(0, 120),
            severity: "medium",
          });
        }
      }
    }
  }

  return { rule: "tool-call-as-commit", findings };
}

// ---------------------------------------------------------------------------
// Rule 7: Hidden SSOT
// ---------------------------------------------------------------------------

const SSOT_SOURCE_PATTERNS = [
  /\bdatabase\b/gi,
  /\bCRM\b/g,
  /\bspreadsheet\b/gi,
  /\bsource of truth\b/gi,
  /\bsystem of record\b/gi,
];

const SSOT_DECLARED = /\b(SSOT|canonical_state|single source of truth|authoritative source)\b/gi;

export function ruleHiddenSSOT(files: ScannedFile[]): RuleResult {
  const allContent = files.map((f) => f.content).join("\n");

  const matches = SSOT_SOURCE_PATTERNS.filter((p) => new RegExp(p.source, "gi").test(allContent));
  if (matches.length < 2) return { rule: "hidden-ssot", findings: [] };
  if (new RegExp(SSOT_DECLARED.source, "gi").test(allContent)) return { rule: "hidden-ssot", findings: [] };

  // Find the file(s) mentioning multiple sources
  const findings: Finding[] = [];
  for (const f of files) {
    const matched = SSOT_SOURCE_PATTERNS.filter((p) => new RegExp(p.source, "gi").test(f.content));
    if (matched.length >= 2 || (matched.length >= 1 && matches.length >= 2)) {
      findings.push({
        rule: "hidden-ssot",
        file: f.relativePath,
        excerpt: "Multiple data sources referenced without declared SSOT or canonical_state",
        severity: "medium",
      });
      break; // one finding per scan is enough
    }
  }

  if (findings.length === 0) {
    findings.push({
      rule: "hidden-ssot",
      file: "(directory)",
      excerpt: "Multiple data sources referenced without declared SSOT or canonical_state",
      severity: "medium",
    });
  }

  return { rule: "hidden-ssot", findings };
}

// ---------------------------------------------------------------------------
// Rule 8: Approval as Chat
// ---------------------------------------------------------------------------

const APPROVAL_CHAT_PATTERNS = [
  /\b(ask (the )?manager|get approval|wait for approval|manager says yes)\b/gi,
];

const APPROVAL_FORMAL = /\b(approval_state|approver|approval_required|escalation|escalate)\b/gi;

export function ruleApprovalAsChat(files: ScannedFile[]): RuleResult {
  const findings: Finding[] = [];

  for (const f of files) {
    if (f.fileType === "world" || f.fileType === "verdict" || f.fileType === "unknown") continue;

    for (const p of APPROVAL_CHAT_PATTERNS) {
      const global = new RegExp(p.source, "gi");
      let m: RegExpExecArray | null;
      while ((m = global.exec(f.content)) !== null) {
        const start = Math.max(0, m.index - 400);
        const end = Math.min(f.content.length, m.index + 400);
        const window = f.content.slice(start, end);
        if (!new RegExp(APPROVAL_FORMAL.source, "gi").test(window)) {
          const lineIndex = f.content.slice(0, m.index).split("\n").length;
          const lines = f.content.split("\n");
          const excerpt = lines[lineIndex - 1]?.trim() ?? m[0];
          findings.push({
            rule: "approval-as-chat",
            file: f.relativePath,
            line: lineIndex,
            excerpt: excerpt.slice(0, 120),
            severity: "medium",
          });
        }
      }
    }
  }

  return { rule: "approval-as-chat", findings };
}

// ---------------------------------------------------------------------------
// Rule 9: Audit as Afterthought
// ---------------------------------------------------------------------------

const STATE_CHANGE_VERBS = /\b(refund|cancel|approve|launch|send|update|delete|commit|mark complete|mark as done)\b/gi;
const AUDIT_INDICATORS = /\b(audit|audit_ref|audit_trail|trace|log|event_log|activity_log)\b/gi;

export function ruleAuditAsAfterthought(files: ScannedFile[]): RuleResult {
  const workflowAndPromptFiles = files.filter(
    (f) => f.fileType === "workflow" || f.fileType === "prompt" || f.fileType === "tool"
  );

  if (workflowAndPromptFiles.length === 0) return { rule: "audit-as-afterthought", findings: [] };

  const allContent = workflowAndPromptFiles.map((f) => f.content).join("\n");

  const hasStateChanges = new RegExp(STATE_CHANGE_VERBS.source, "gi").test(allContent);
  if (!hasStateChanges) return { rule: "audit-as-afterthought", findings: [] };

  if (new RegExp(AUDIT_INDICATORS.source, "gi").test(allContent)) return { rule: "audit-as-afterthought", findings: [] };

  return {
    rule: "audit-as-afterthought",
    findings: [
      {
        rule: "audit-as-afterthought",
        file: "(directory)",
        excerpt: "State-changing actions found but no audit / trace / log / audit_ref / event terms",
        severity: "medium",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Rule 10: Worldless Orchestration
// ---------------------------------------------------------------------------

const ORCHESTRATION_TERMS = /\b(planner|executor|reviewer|orchestrat|multi.?agent|sub.?agent)\b/gi;
const WORLD_TERMS = /\b(world|entity|entities|state|transition|constraint)\b/gi;

export function ruleWorldlessOrchestration(files: ScannedFile[]): RuleResult {
  const allContent = files.map((f) => f.content).join("\n");

  const orchestrationMatches = (allContent.match(new RegExp(ORCHESTRATION_TERMS.source, "gi")) ?? []).length;
  if (orchestrationMatches < 2) return { rule: "worldless-orchestration", findings: [] };

  if (new RegExp(WORLD_TERMS.source, "gi").test(allContent)) return { rule: "worldless-orchestration", findings: [] };

  return {
    rule: "worldless-orchestration",
    findings: [
      {
        rule: "worldless-orchestration",
        file: "(directory)",
        excerpt: "Multiple orchestration terms found but no world / entity / state / transition / constraint terms",
        severity: "medium",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Run all rules
// ---------------------------------------------------------------------------

export function runAllRules(files: ScannedFile[]): RuleResult[] {
  return [
    ruleStateAsText(files),
    ruleTransitionlessAction(files),
    ruleGuardAsPrompt(files),
    ruleBeliefCommitConfusion(files),
    ruleNoVerdictContract(files),
    ruleToolCallAsCommit(files),
    ruleHiddenSSOT(files),
    ruleApprovalAsChat(files),
    ruleAuditAsAfterthought(files),
    ruleWorldlessOrchestration(files),
  ];
}
