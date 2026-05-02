import { describe, it, expect } from "vitest";
import {
  ruleStateAsText,
  ruleGuardAsPrompt,
  ruleBeliefCommitConfusion,
  ruleNoVerdictContract,
  ruleToolCallAsCommit,
  ruleTransitionlessAction,
  ruleApprovalAsChat,
  ruleWorldlessOrchestration,
} from "../src/rules.js";
import type { ScannedFile } from "../src/scanner.js";

function makeFile(content: string, fileType: ScannedFile["fileType"] = "prompt", name = "system-prompt.md"): ScannedFile {
  return { absolutePath: `/tmp/${name}`, relativePath: name, content, fileType };
}

// ---------------------------------------------------------------------------
// Rule 1: State as Text
// ---------------------------------------------------------------------------

describe("ruleStateAsText", () => {
  it("flags 'seems delivered' in a prompt file", () => {
    const f = makeFile("The order seems delivered so we can close the case.", "prompt");
    const result = ruleStateAsText([f]);
    expect(result.findings.length).toBeGreaterThan(0);
  });

  it("flags 'status appears to be' in a workflow file", () => {
    const f = makeFile("The status appears to be pending. Proceed with cancellation.", "workflow");
    const result = ruleStateAsText([f]);
    expect(result.findings.length).toBeGreaterThan(0);
  });

  it("does NOT flag generic docs without action language", () => {
    const f = makeFile("The deployment looks completed after the rollout.", "doc");
    const result = ruleStateAsText([f]);
    expect(result.findings.length).toBe(0);
  });

  it("DOES flag docs when near action language", () => {
    const f = makeFile("The order seems delivered. Mark as done and commit the record.", "doc");
    const result = ruleStateAsText([f]);
    expect(result.findings.length).toBeGreaterThan(0);
  });

  it("does not flag world or verdict files", () => {
    const f = makeFile("status appears to be approved", "world");
    const result = ruleStateAsText([f]);
    expect(result.findings.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Rule 3: Guard as Prompt
// ---------------------------------------------------------------------------

describe("ruleGuardAsPrompt", () => {
  it("flags 'never refund' in a prompt file", () => {
    const f = makeFile("Never refund after 7 days without manager approval.", "prompt");
    const result = ruleGuardAsPrompt([f]);
    expect(result.findings.length).toBeGreaterThan(0);
  });

  it("flags 'only refund if' in a prompt file", () => {
    const f = makeFile("Only refund if the customer has a valid receipt.", "prompt");
    const result = ruleGuardAsPrompt([f]);
    expect(result.findings.length).toBeGreaterThan(0);
  });

  it("flags 'unless authorized' in a prompt file", () => {
    const f = makeFile("Unless authorized by a manager, do not approve large refunds.", "prompt");
    const result = ruleGuardAsPrompt([f]);
    expect(result.findings.length).toBeGreaterThan(0);
  });

  it("does NOT flag generic 'must not' in docs without action verb", () => {
    const f = makeFile("Contributors must not submit PRs without review.", "doc");
    const result = ruleGuardAsPrompt([f]);
    expect(result.findings.length).toBe(0);
  });

  it("DOES flag 'must not approve' in docs", () => {
    const f = makeFile("Agents must not approve requests without verification.", "doc");
    const result = ruleGuardAsPrompt([f]);
    expect(result.findings.length).toBeGreaterThan(0);
  });

  it("does NOT flag 'only if' in non-prompt files", () => {
    const f = makeFile("Only launch if the campaign budget is approved.", "workflow");
    const result = ruleGuardAsPrompt([f]);
    // workflow files only match "must not <action>" pattern, not "only X if"
    expect(result.findings.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Rule 4: Belief-Commit Confusion
// ---------------------------------------------------------------------------

describe("ruleBeliefCommitConfusion", () => {
  it("flags 'I believe' near 'mark complete'", () => {
    const f = makeFile("I believe the order is valid. Mark complete and update record.", "prompt");
    const result = ruleBeliefCommitConfusion([f]);
    expect(result.findings.length).toBeGreaterThan(0);
  });

  it("flags 'probably' near 'approve'", () => {
    const f = makeFile("The customer is probably eligible, so approve the refund.", "prompt");
    const result = ruleBeliefCommitConfusion([f]);
    expect(result.findings.length).toBeGreaterThan(0);
  });

  it("does NOT flag standalone 'I believe' in README without commit language", () => {
    const f = makeFile("I believe this pattern is common in enterprise systems.", "doc");
    const result = ruleBeliefCommitConfusion([f]);
    expect(result.findings.length).toBe(0);
  });

  it("does NOT flag standalone 'probably' without commit language", () => {
    const f = makeFile("This probably helps with onboarding. Review the docs carefully.", "doc");
    const result = ruleBeliefCommitConfusion([f]);
    expect(result.findings.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Rule 5: No Verdict Contract
// ---------------------------------------------------------------------------

describe("ruleNoVerdictContract", () => {
  it("flags when agent files exist but no verdict terms", () => {
    const files = [
      makeFile("You are a helpful agent. Handle refunds.", "prompt"),
      makeFile("tools:\n  - name: refundPayment", "tool", "tools.yaml"),
    ];
    const result = ruleNoVerdictContract(files);
    expect(result.findings.length).toBe(1);
  });

  it("does NOT flag when ALLOW/DENY is present", () => {
    const files = [
      makeFile("You are a helpful agent. Handle refunds.", "prompt"),
      makeFile('{"verdict": "DENY", "failed_guards": []}', "verdict", "verdict.json"),
    ];
    const result = ruleNoVerdictContract(files);
    expect(result.findings.length).toBe(0);
  });

  it("does NOT flag when there are no agent files", () => {
    const files = [makeFile("# README\nThis is a doc.", "doc", "README.md")];
    const result = ruleNoVerdictContract(files);
    expect(result.findings.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Rule 6: Tool Call as Commit
// ---------------------------------------------------------------------------

describe("ruleToolCallAsCommit", () => {
  it("flags 'tool call completed' without audit language", () => {
    const f = makeFile("The refund was issued — tool call completed. Next step: send email.", "workflow");
    const result = ruleToolCallAsCommit([f]);
    expect(result.findings.length).toBeGreaterThan(0);
  });

  it("does NOT flag when audit language is nearby", () => {
    const f = makeFile("tool call completed. audit_ref recorded. state transition logged.", "workflow");
    const result = ruleToolCallAsCommit([f]);
    expect(result.findings.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Rule 2: Transition-less Action
// ---------------------------------------------------------------------------

describe("ruleTransitionlessAction", () => {
  it("flags refundPayment in tool file without from/to state", () => {
    const f = makeFile("tools:\n  - name: refundPayment\n    description: Issues a refund.", "tool", "tools.yaml");
    const result = ruleTransitionlessAction([f]);
    expect(result.findings.length).toBeGreaterThan(0);
  });

  it("does NOT flag refundPayment when from_state is declared nearby", () => {
    const content = `
tools:
  - name: refundPayment
    from_state: DELIVERED
    to_state: REFUNDED
    description: Issues a refund.
`;
    const f = makeFile(content, "tool", "tools.yaml");
    const result = ruleTransitionlessAction([f]);
    expect(result.findings.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Rule 10: Worldless Orchestration
// ---------------------------------------------------------------------------

describe("ruleWorldlessOrchestration", () => {
  it("flags multiple orchestration terms without world model", () => {
    const f = makeFile(
      "The planner routes tasks. The executor runs them. The reviewer checks. This multi-agent system coordinates them all.",
      "workflow"
    );
    const result = ruleWorldlessOrchestration([f]);
    expect(result.findings.length).toBeGreaterThan(0);
  });

  it("does NOT flag when world model terms are present", () => {
    const f = makeFile(
      "The planner, executor, and reviewer share a world model with explicit entity, state, and transition definitions.",
      "workflow"
    );
    const result = ruleWorldlessOrchestration([f]);
    expect(result.findings.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Rule 8: Approval as Chat
// ---------------------------------------------------------------------------

describe("ruleApprovalAsChat", () => {
  it("flags 'ask manager' without formal approval terms", () => {
    const f = makeFile("If the refund is over $200, ask manager before proceeding.", "prompt");
    const result = ruleApprovalAsChat([f]);
    expect(result.findings.length).toBeGreaterThan(0);
  });

  it("does NOT flag when escalation path is declared nearby", () => {
    const f = makeFile("ask manager — approval_required: true, escalation: manager_queue", "prompt");
    const result = ruleApprovalAsChat([f]);
    expect(result.findings.length).toBe(0);
  });
});
