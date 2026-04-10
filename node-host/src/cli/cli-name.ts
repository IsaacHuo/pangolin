import path from "node:path";

export const DEFAULT_CLI_NAME = "pangolin";
export const LEGACY_CLI_NAME = "agent-shield";

const KNOWN_CLI_NAMES = new Set([DEFAULT_CLI_NAME, LEGACY_CLI_NAME]);
const CLI_PREFIX_RE = /^(?:((?:pnpm|npm|bunx|npx)\s+))?(agent-shield|pangolin)\b/;

function normalizeCliName(value: string): string | null {
  const normalized = value.trim().replace(/\.(?:mjs|cjs|js)$/i, "");
  if (!normalized) {
    return null;
  }
  return KNOWN_CLI_NAMES.has(normalized) ? normalized : null;
}

export function resolveCliName(argv: string[] = process.argv): string {
  const argv1 = argv[1];
  if (argv1) {
    const argv1Name = normalizeCliName(path.basename(argv1));
    if (argv1Name) {
      return argv1Name;
    }
  }

  const argv0 = argv[0];
  if (argv0) {
    const argv0Name = normalizeCliName(path.basename(argv0));
    if (argv0Name) {
      return argv0Name;
    }
  }

  return DEFAULT_CLI_NAME;
}

export function replaceCliName(command: string, cliName = resolveCliName()): string {
  if (!command.trim()) {
    return command;
  }
  if (!CLI_PREFIX_RE.test(command)) {
    return command;
  }
  return command.replace(CLI_PREFIX_RE, (_match, runner: string | undefined) => {
    return `${runner ?? ""}${cliName}`;
  });
}
