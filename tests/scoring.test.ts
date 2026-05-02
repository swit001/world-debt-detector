import { describe, it, expect } from "vitest";
import { calculateScore, RULE_WEIGHTS } from "../src/scoring.js";
import { formatJson } from "../src/reporter.js";
import { scanDirectory, classifyFile } from "../src/scanner.js";
import { runAllRules } from "../src/rules.js";
import { computeESTCCoverage } from "../src/scoring.js";
import type { RuleResult, ScanResult } from "../src/types.js";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BAD_AGENT_PATH = resolve(__dirname, "../examples/bad-agent");
const GOOD_AGENT_PATH = resolve(__dirname, "../examples/good-agent");

// ---------------------------------------------------------------------------
// Score calculation
// ---------------------------------------------------------------------------

describe("calculateScore", () => {
  it("returns 0 for no findings", () => {
    const results: RuleResult[] = [
      { rule: "state-as-text", findings: [] },
      { rule: "guard-as-prompt", findings: [] },
    ];
    expect(calculateScore(results)).toBe(0);
  });

  it("applies per-rule weights correctly", () => {
    const results: RuleResult[] = [
      {
        rule: "state-as-text",
        findings: [
          { rule: "state-as-text", file: "f.md", excerpt: "x", severity: "high" },
        ],
      },
    ];
    expect(calculateScore(results)).toBe(RULE_WEIGHTS["state-as-text"].points);
  });

  it("caps per-rule score at rule cap", () => {
    const weight = RULE_WEIGHTS["state-as-text"];
    const findings = Array.from({ length: 20 }, (_, i) => ({
      rule: "state-as-text" as const,
      file: `f${i}.md`,
      excerpt: "x",
      severity: "high" as const,
    }));
    const results: RuleResult[] = [{ rule: "state-as-text", findings }];
    expect(calculateScore(results)).toBe(weight.cap);
  });

  it("caps total score at 100", () => {
    const allRules = Object.keys(RULE_WEIGHTS) as Array<keyof typeof RULE_WEIGHTS>;
    const results: RuleResult[] = allRules.map((rule) => ({
      rule,
      findings: Array.from({ length: 20 }, (_, i) => ({
        rule,
        file: `f${i}.md`,
        excerpt: "x",
        severity: "high" as const,
      })),
    }));
    expect(calculateScore(results)).toBe(100);
  });

  it("combines multiple rules correctly", () => {
    const results: RuleResult[] = [
      {
        rule: "no-verdict-contract",
        findings: [{ rule: "no-verdict-contract", file: "(dir)", excerpt: "missing", severity: "high" }],
      },
      {
        rule: "guard-as-prompt",
        findings: [
          { rule: "guard-as-prompt", file: "f.md", excerpt: "x", severity: "high" },
          { rule: "guard-as-prompt", file: "f.md", excerpt: "y", severity: "high" },
        ],
      },
    ];
    const expected = 15 + 2 * 10; // 15 + 20 = 35
    expect(calculateScore(results)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// JSON output shape
// ---------------------------------------------------------------------------

describe("formatJson", () => {
  it("produces valid JSON with expected top-level keys", () => {
    const result: ScanResult = {
      path: "./test",
      score: 42,
      findings: [],
      estc: {
        entity: "missing",
        state: "weak",
        transition: "missing",
        constraint: "prompt-only",
        verdict: "missing",
        audit: "missing",
      },
      ruleResults: [
        {
          rule: "state-as-text",
          findings: [{ rule: "state-as-text", file: "f.md", line: 3, excerpt: "seems delivered", severity: "high" }],
        },
      ],
    };
    const json = JSON.parse(formatJson(result));
    expect(json).toHaveProperty("score", 42);
    expect(json).toHaveProperty("estc");
    expect(json).toHaveProperty("antiPatterns");
    expect(Array.isArray(json.antiPatterns)).toBe(true);
    expect(json.antiPatterns[0]).toHaveProperty("rule", "state-as-text");
    expect(json.antiPatterns[0]).toHaveProperty("occurrences", 1);
    expect(json.antiPatterns[0].findings[0]).toHaveProperty("file", "f.md");
    expect(json.antiPatterns[0].findings[0]).toHaveProperty("severity", "high");
  });
});

// ---------------------------------------------------------------------------
// File classifier
// ---------------------------------------------------------------------------

describe("classifyFile", () => {
  it("classifies system-prompt.md as prompt", () => {
    expect(classifyFile("system-prompt.md")).toBe("prompt");
  });

  it("classifies tools.yaml as tool", () => {
    expect(classifyFile("tools.yaml")).toBe("tool");
  });

  it("classifies workflow.md as workflow", () => {
    expect(classifyFile("workflow.md")).toBe("workflow");
  });

  it("classifies world.yaml as world", () => {
    expect(classifyFile("world.yaml")).toBe("world");
  });

  it("classifies verdict.json as verdict", () => {
    expect(classifyFile("verdict.json")).toBe("verdict");
  });

  it("classifies README.md as doc", () => {
    expect(classifyFile("README.md")).toBe("doc");
  });
});

// ---------------------------------------------------------------------------
// Integration: bad-agent scan
// ---------------------------------------------------------------------------

describe("bad-agent integration", () => {
  it("score lands between 60 and 90", async () => {
    const files = await scanDirectory(BAD_AGENT_PATH);
    const ruleResults = runAllRules(files);
    const score = calculateScore(ruleResults);
    console.log("bad-agent score:", score);
    expect(score).toBeGreaterThanOrEqual(60);
    expect(score).toBeLessThanOrEqual(90);
  });

  it("detects guard-as-prompt in system-prompt.md", async () => {
    const files = await scanDirectory(BAD_AGENT_PATH);
    const ruleResults = runAllRules(files);
    const guardRule = ruleResults.find((r) => r.rule === "guard-as-prompt");
    expect(guardRule?.findings.length).toBeGreaterThan(0);
  });

  it("detects no-verdict-contract", async () => {
    const files = await scanDirectory(BAD_AGENT_PATH);
    const ruleResults = runAllRules(files);
    const noVerdict = ruleResults.find((r) => r.rule === "no-verdict-contract");
    expect(noVerdict?.findings.length).toBe(1);
  });

  it("detects transition-less-action in tools.yaml", async () => {
    const files = await scanDirectory(BAD_AGENT_PATH);
    const ruleResults = runAllRules(files);
    const tlAction = ruleResults.find((r) => r.rule === "transition-less-action");
    expect(tlAction?.findings.length).toBeGreaterThan(0);
  });

  it("detects approval-as-chat", async () => {
    const files = await scanDirectory(BAD_AGENT_PATH);
    const ruleResults = runAllRules(files);
    const approval = ruleResults.find((r) => r.rule === "approval-as-chat");
    expect(approval?.findings.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Integration: good-agent scan (low score)
// ---------------------------------------------------------------------------

describe("good-agent integration", () => {
  it("scores significantly lower than bad-agent", async () => {
    const badFiles = await scanDirectory(BAD_AGENT_PATH);
    const goodFiles = await scanDirectory(GOOD_AGENT_PATH);
    const badScore = calculateScore(runAllRules(badFiles));
    const goodScore = calculateScore(runAllRules(goodFiles));
    console.log("good-agent score:", goodScore, "bad-agent score:", badScore);
    expect(goodScore).toBeLessThan(badScore);
  });
});
