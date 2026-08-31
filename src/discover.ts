import { readdir } from "node:fs/promises";
import path from "node:path";
import picomatch from "picomatch";
import type { ResolvedConfig } from "./config.js";

type GlobMatcher = (rel: string) => boolean;

const SKIP_DIRS = new Set(["node_modules", ".git", "dist"]);

export async function discoverXsFiles(options: {
  config: ResolvedConfig;
  cwd: string;
  cliPaths: string[];
}): Promise<string[]> {
  const { config, cwd, cliPaths } = options;
  const root = config.configDir;
  const include = config.included.map((pattern) => compileGlob(pattern));
  const exclude = config.excluded.map((pattern) => compileGlob(pattern));

  const discovered: string[] = [];
  await walk(root, root, include, exclude, discovered);
  discovered.sort();

  if (cliPaths.length === 0) {
    return discovered;
  }

  const resolvedCli = cliPaths.map((p) => path.resolve(cwd, p));
  return discovered.filter((file) => matchesCliPath(file, resolvedCli));
}

async function walk(
  dir: string,
  root: string,
  include: GlobMatcher[],
  exclude: GlobMatcher[],
  out: string[],
): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) {
        continue;
      }
      await walk(full, root, include, exclude, out);
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    const rel = toPosix(path.relative(root, full));
    if (isExcluded(rel, exclude)) {
      continue;
    }
    if (!isIncluded(rel, include)) {
      continue;
    }
    out.push(full);
  }
}

function compileGlob(pattern: string): GlobMatcher {
  const match = picomatch(pattern, { dot: true });
  if (pattern.startsWith("**/")) {
    const basenameMatch = picomatch(pattern.slice(3), { dot: true });
    return (rel: string) => Boolean(match(rel) || basenameMatch(rel));
  }
  return (rel: string) => Boolean(match(rel));
}

function isIncluded(rel: string, include: GlobMatcher[]): boolean {
  return include.some((match) => match(rel));
}

function isExcluded(rel: string, exclude: GlobMatcher[]): boolean {
  return exclude.some((match) => match(rel));
}

function matchesCliPath(file: string, cliPaths: string[]): boolean {
  return cliPaths.some((cliPath) => {
    if (file === cliPath) {
      return true;
    }
    const prefix = cliPath.endsWith(path.sep) ? cliPath : cliPath + path.sep;
    return file.startsWith(prefix);
  });
}

function toPosix(rel: string): string {
  return rel.split(path.sep).join("/");
}

