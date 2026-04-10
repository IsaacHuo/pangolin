#!/usr/bin/env node

import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const DEFAULT_SCAN_ROOTS = [
  "src",
  "apps",
  "docs",
  ".github",
  "scripts",
  "README.md",
  "INTEGRATION_PLAN.md",
  "package.json",
  "pnpm-workspace.yaml",
];

const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "coverage",
  ".next",
  ".nuxt",
  "vendor",
  ".pnpm-store",
]);

const TEXT_FILE_EXTENSIONS = new Set([
  ".md",
  ".mdx",
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".json",
  ".yml",
  ".yaml",
  ".toml",
  ".sh",
  ".py",
  ".vue",
  ".css",
  ".html",
]);

const EXCLUDED_RELATIVE_PATHS = new Set([
  "scripts/phase6-legacy-path-audit.mjs",
  "docs/refactor/phase6-repo-consolidation.md",
]);

const PATTERNS = ["ai-protector-main", "promptfoo-main", "pangolin/"];

function parseArgs(argv) {
  return {
    strict: argv.includes("--strict"),
    json: argv.includes("--json"),
  };
}

function shouldScanFile(filePath) {
  const normalizedPath = filePath.split(path.sep).join(path.posix.sep);
  if (EXCLUDED_RELATIVE_PATHS.has(normalizedPath)) {
    return false;
  }

  const ext = path.extname(filePath).toLowerCase();
  return TEXT_FILE_EXTENSIONS.has(ext) || path.basename(filePath) === "package.json";
}

async function collectFiles(rootDir, relativeTarget, output) {
  const absoluteTarget = path.join(rootDir, relativeTarget);
  let targetStat;

  try {
    targetStat = await stat(absoluteTarget);
  } catch {
    return;
  }

  if (targetStat.isFile()) {
    if (shouldScanFile(relativeTarget)) {
      output.push(relativeTarget);
    }
    return;
  }

  if (!targetStat.isDirectory()) {
    return;
  }

  const entries = await readdir(absoluteTarget, { withFileTypes: true });
  for (const entry of entries) {
    const childRelative = path.posix.join(
      relativeTarget.split(path.sep).join(path.posix.sep),
      entry.name,
    );
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) {
        continue;
      }
      await collectFiles(rootDir, childRelative, output);
      continue;
    }

    if (entry.isFile() && shouldScanFile(childRelative)) {
      output.push(childRelative);
    }
  }
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const rootDir = process.cwd();

  const filesToScan = [];
  for (const target of DEFAULT_SCAN_ROOTS) {
    await collectFiles(rootDir, target, filesToScan);
  }

  const results = new Map(PATTERNS.map((pattern) => [pattern, []]));

  for (const relativeFilePath of filesToScan) {
    const absoluteFilePath = path.join(rootDir, relativeFilePath);
    let content;

    try {
      content = await readFile(absoluteFilePath, "utf8");
    } catch {
      continue;
    }

    for (const pattern of PATTERNS) {
      if (content.includes(pattern)) {
        const list = results.get(pattern);
        if (list) {
          list.push(relativeFilePath);
        }
      }
    }
  }

  const summary = {
    scannedFileCount: filesToScan.length,
    patternHits: PATTERNS.map((pattern) => ({
      pattern,
      count: results.get(pattern)?.length ?? 0,
      files: (results.get(pattern) ?? []).toSorted((left, right) => left.localeCompare(right)),
    })),
  };

  const totalHits = summary.patternHits.reduce((sum, item) => sum + item.count, 0);

  if (args.json) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } else {
    process.stdout.write(`Scanned files: ${summary.scannedFileCount}\n`);
    process.stdout.write("Legacy path references:\n");
    for (const item of summary.patternHits) {
      process.stdout.write(`- ${item.pattern}: ${item.count}\n`);
      for (const filePath of item.files) {
        process.stdout.write(`  - ${filePath}\n`);
      }
    }
    process.stdout.write(`Total references: ${totalHits}\n`);
  }

  if (args.strict && totalHits > 0) {
    process.exitCode = 1;
  }
}

await run();
