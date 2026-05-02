# World Debt Detector

**Detect implicit world-model debt in AI agent systems.**

---

> Your agent may work.
> Your world may not.

---

World Debt Detector scans prompts, tools, configs, and workflows for hidden world-model assumptions.

**World debt** is the hidden cost of letting agents rely on implicit assumptions about entities, states, transitions, constraints, approvals, and audit trails. The more your agent system depends on these assumptions, the harder it is to reason about, audit, or safely extend.

---

## Quickstart

```bash
npx world-debt-detector scan ./examples/bad-agent
```

Or install globally:

```bash
npm install -g world-debt-detector
wdebt scan ./agents
```

---

## Sample Output

```
World Debt Score: [█████████████████░░░] 87/100

Detected anti-patterns:
  - State as Text: 1 occurrence
  - Transition-less Action: 4 occurrences
  - Guard as Prompt: 2 occurrences
  - Belief-Commit Confusion: 1 occurrence
  - No Verdict Contract: 1 occurrence
  - Approval as Chat: 1 occurrence
  - Audit as Afterthought: 1 occurrence

ESTC coverage:
  Entity:     missing     
  State:      weak        
  Transition: missing     
  Constraint: prompt-only 
  Verdict:    missing     
  Audit:      missing     

Top findings:
  1. system-prompt.md:26: "1. Pull up the order. If it seems delivered, ask the customer to confirm receipt."
  2. tools.yaml:2: "- name: refundPayment"
  3. tools.yaml:15: "- name: cancelOrder"
  4. workflow.md:12: "4. If eligible, the agent calls `refundPayment` with the order ID and amount."
  5. workflow.md:19: "3. If the order is still open, the agent calls `cancelOrder`."

Recommendations:
  - Replace vague state language with committed, typed state from a world model.
  - Declare source and target states for every action in tool configs.
  - Move prompt-only constraints into executable guards with structured ALLOW/DENY output.
  - Separate belief state (inferred) from committed state (persisted).
  - Return structured ALLOW / DENY / ESCALATE verdicts from agent decision points.
  - Replace chat-based approval with a declared approval_state and escalation path.
  - Emit an audit event for every state-changing action.
```

---

## Usage

```
world-debt scan <path> [options]

Arguments:
  path                 Directory or file to scan

Options:
  --json               Output machine-readable JSON
  --fail-on <score>    Exit with code 1 if score >= threshold (useful in CI)
  --include <glob>     Only scan files matching this glob pattern
  --exclude <glob>     Skip files matching this glob pattern
  -h, --help           Show help
  -V, --version        Show version
```

### Examples

```bash
# Scan a directory
wdebt scan ./agents

# Fail CI if score >= 50
wdebt scan ./agents --fail-on 50

# JSON output for downstream tooling
wdebt scan ./agents --json | jq '.score'

# Only scan prompt files
wdebt scan ./agents --include "**/*.prompt.md"
```

---

## Scoring Model

The **World Debt Score** is 0–100. Higher means more debt.

| Anti-Pattern           | Points per Finding | Cap |
|------------------------|--------------------|-----|
| Guard as Prompt        | 10                 | 30  |
| No Verdict Contract    | 15 (binary)        | 15  |
| Belief-Commit Confusion| 10                 | 20  |
| State as Text          | 8                  | 24  |
| Transition-less Action | 8                  | 24  |
| Tool Call as Commit    | 8                  | 16  |
| Hidden SSOT            | 5                  | 10  |
| Approval as Chat       | 5                  | 10  |
| Audit as Afterthought  | 5                  | 10  |
| Worldless Orchestration| 5                  | 10  |

Total is capped at 100.

---

## ESTC Coverage

Each scan also reports coverage across six dimensions of a world model:

| Dimension  | Levels |
|------------|--------|
| Entity     | missing / partial / present |
| State      | missing / weak / partial / present |
| Transition | missing / weak / partial / present |
| Constraint | missing / prompt-only / partial / present |
| Verdict    | missing / partial / present |
| Audit      | missing / partial / present |

**ESTC** = Entity, State, Transition, Constraint — the four primitives of an explicit world model.

---

## Detected Anti-Patterns

### 1. State as Text
Vague state language like _"seems delivered"_, _"looks completed"_, or _"assume the order is"_ inside prompts or workflows. These create invisible branches that the world model cannot track.

### 2. Transition-less Action
Tool or action definitions (e.g. `refundPayment`, `cancelOrder`) without declared `from_state` / `to_state`. Without transitions, the world model cannot validate pre-conditions or enforce post-conditions.

### 3. Guard as Prompt
Business constraints expressed as natural-language instructions (_"never refund after 7 days"_, _"only approve if..."_) instead of executable guards that return structured verdicts.

### 4. Belief-Commit Confusion
Belief language (_"I believe"_, _"probably"_, _"inferred state"_) appearing near commit/action language (_"mark complete"_, _"approve"_, _"refund"_). Agents that act on belief instead of committed state are unreliable.

### 5. No Verdict Contract
Agent workflows with no `ALLOW` / `DENY` / `ESCALATE` / `verdict` / `failed_guards` / `next_state` anywhere. Without structured verdicts, callers cannot handle decisions programmatically.

### 6. Tool Call as Commit
Treating tool-call success as ground truth (_"tool call completed"_, _"mark complete"_, _"update record"_) without an audit reference or state transition. Tool calls are intents, not commits.

### 7. Hidden SSOT
Multiple data sources (database, CRM, spreadsheet) referenced without a declared `SSOT` or `canonical_state`. Agents reading from multiple implicit sources diverge silently.

### 8. Approval as Chat
Approval encoded as conversational steps (_"ask manager"_, _"wait for approval"_, _"manager says yes"_) rather than a declared `approval_state` and escalation path.

### 9. Audit as Afterthought
State-changing actions in agent workflows without any `audit`, `trace`, `log`, `audit_ref`, or `event` terms. Compliance and debugging require a complete audit trail.

### 10. Worldless Orchestration
Multi-agent systems with orchestration roles (planner, executor, reviewer) but no shared world model with `entity`, `state`, `transition`, or `constraint` definitions.

---

## File Classification

Rules are applied based on file type to reduce false positives:

| File Pattern | Type |
|---|---|
| `system-prompt.md`, `*.prompt.md`, `prompts/*.md` | prompt |
| `tools.yaml`, `tools.json`, `agent-config.*` | tool |
| `workflow.md`, `workflows/*.md`, `*.workflow.yaml` | workflow |
| `world.yaml`, `world.json` | world |
| `verdict.json`, `verdict.yaml` | verdict |
| `README.md`, `*.md` (other) | doc |

---

## Related Projects

- [World Model Anti-Patterns](https://github.com/swit001/world-model-anti-patterns) — the catalog of anti-patterns this tool detects
- [Agentic World Model](https://github.com/swit001/agentic-world-model) — the theoretical framework
- [ESTC World Model Runtime](https://github.com/swit001/estc-world-model) — a runtime implementation of ESTC

---

## License

Apache-2.0 © Josh Lee
