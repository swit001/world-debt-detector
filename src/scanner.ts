import { readFileSync, existsSync, statSync } from "node:fs";
import { resolve, relative, basename, extname, dirname } from "node:path";
import fg from "fast-glob";
import type { FileType } from "./types.js";

export interface ScannedFile {
  absolutePath: string;
  relativePath: string;
  content: string;
  fileType: FileType;
}

const PROMPT_PATTERNS = [
  /system[-_]prompt\.(md|txt)$/i,
  /\.prompt\.(md|txt)$/i,
  /^prompts[\\/].+\.(md|txt)$/i,
];

const TOOL_PATTERNS = [
  /^tools?\.(yaml|yml|json)$/i,
  /agent[-_]config\.(yaml|yml|json)$/i,
  /\.tools\.(yaml|yml|json)$/i,
];

const WORKFLOW_PATTERNS = [
  /^workflow(s)?\.md$/i,
  /^workflows[\\/].+\.md$/i,
  /\.workflow\.(yaml|yml)$/i,
];

const WORLD_PATTERNS = [/^world\.(yaml|yml|json)$/i];

const VERDICT_PATTERNS = [/^verdict\.(json|yaml|yml)$/i];

export function classifyFile(relativePath: string): FileType {
  const name = basename(relativePath);
  const full = relativePath.replace(/\\/g, "/");

  for (const p of WORLD_PATTERNS) if (p.test(name)) return "world";
  for (const p of VERDICT_PATTERNS) if (p.test(name)) return "verdict";
  for (const p of PROMPT_PATTERNS) if (p.test(name) || p.test(full)) return "prompt";
  for (const p of TOOL_PATTERNS) if (p.test(name) || p.test(full)) return "tool";
  for (const p of WORKFLOW_PATTERNS) if (p.test(name) || p.test(full)) return "workflow";

  const ext = extname(name).toLowerCase();
  if (name.toLowerCase() === "readme.md" || name.toLowerCase().endsWith(".readme.md")) return "doc";
  if (ext === ".md" || ext === ".txt") return "doc";

  return "unknown";
}

export async function scanDirectory(
  targetPath: string,
  includeGlob?: string,
  excludeGlob?: string
): Promise<ScannedFile[]> {
  const resolved = resolve(targetPath);

  if (!existsSync(resolved)) {
    throw new Error(`Path does not exist: ${resolved}`);
  }

  const isFile = statSync(resolved).isFile();

  let filePaths: string[];

  if (isFile) {
    filePaths = [resolved];
  } else {
    const defaultPatterns = ["**/*.md", "**/*.txt", "**/*.yaml", "**/*.yml", "**/*.json"];
    const patterns = includeGlob ? [includeGlob] : defaultPatterns;
    const ignore = [
      "**/node_modules/**",
      "**/.git/**",
      "**/dist/**",
      "**/.cache/**",
      excludeGlob,
    ].filter(Boolean) as string[];

    filePaths = await fg(patterns, {
      cwd: resolved,
      absolute: true,
      ignore,
      dot: false,
    });
  }

  const files: ScannedFile[] = [];

  for (const absPath of filePaths) {
    try {
      const content = readFileSync(absPath, "utf-8");
      const rel = isFile ? basename(absPath) : relative(resolved, absPath);
      files.push({
        absolutePath: absPath,
        relativePath: rel,
        content,
        fileType: classifyFile(rel),
      });
    } catch {
      // skip unreadable files
    }
  }

  return files;
}
