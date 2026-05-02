#!/usr/bin/env node
import { Command } from "commander";
import { scanDirectory } from "./scanner.js";
import { runAllRules } from "./rules.js";
import { calculateScore, computeESTCCoverage } from "./scoring.js";
import { formatText, formatJson } from "./reporter.js";
import type { ScanResult, ScanOptions } from "./types.js";

const program = new Command();

program
  .name("world-debt")
  .description("Detect implicit world-model debt in AI agent systems.")
  .version("0.1.0");

program
  .command("scan <path>")
  .description("Scan a directory or file for world-model debt.")
  .option("--json", "Output machine-readable JSON", false)
  .option("--fail-on <score>", "Exit with code 1 if score >= threshold", parseInt)
  .option("--include <glob>", "Glob pattern of files to include")
  .option("--exclude <glob>", "Glob pattern of files to exclude")
  .action(async (targetPath: string, opts: ScanOptions & { failOn?: number }) => {
    try {
      const files = await scanDirectory(targetPath, opts.include, opts.exclude);

      if (files.length === 0) {
        console.error("No files found to scan.");
        process.exit(1);
      }

      const ruleResults = runAllRules(files);
      const allFindings = ruleResults.flatMap((r) => r.findings);
      const score = calculateScore(ruleResults);
      const estc = computeESTCCoverage(files);

      const result: ScanResult = {
        path: targetPath,
        score,
        findings: allFindings,
        estc,
        ruleResults,
      };

      if (opts.json) {
        console.log(formatJson(result));
      } else {
        console.log(formatText(result));
      }

      if (opts.failOn !== undefined && score >= opts.failOn) {
        process.exit(1);
      }
    } catch (err) {
      console.error((err as Error).message);
      process.exit(1);
    }
  });

program.parse(process.argv);
