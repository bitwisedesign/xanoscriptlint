import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { builtinRules } from "./rules/index.js";
import type { RuleOptions, Severity } from "./rules/types.js";

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export const CONFIG_FILENAME = ".xanoscriptlint.yml";

const KNOWN_KEYS = new Set([
  "disabled_rules",
  "opt_in_rules",
  "only_rules",
  "included",
  "excluded",
  "custom_rules",
]);

export interface CustomRuleConfig {
  id: string;
  name: string;
  regex: string;
  pattern: RegExp;
  message: string;
  severity: Severity;
  included?: string[];
  excluded?: string[];
}

export interface ResolvedConfig {
  configDir: string;
  configPath: string | null;
  enabledRuleIds: Set<string>;
  ruleOptions: Map<string, RuleOptions>;
  included: string[];
  excluded: string[];
  customRules: CustomRuleConfig[];
}

interface RawCustomRule {
  name?: unknown;
  regex?: unknown;
  message?: unknown;
  severity?: unknown;
  included?: unknown;
  excluded?: unknown;
}

interface RawConfig {
  disabled_rules?: unknown;
  opt_in_rules?: unknown;
  only_rules?: unknown;
  included?: unknown;
  excluded?: unknown;
  custom_rules?: unknown;
  [key: string]: unknown;
}

export function findConfigPath(startDir: string): string | null {
  let dir = path.resolve(startDir);
  while (true) {
    const candidate = path.join(dir, CONFIG_FILENAME);
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
}

export function loadConfig(options: {
  cwd: string;
  configPath?: string;
}): ResolvedConfig {
  if (options.configPath) {
    const configPath = path.resolve(options.cwd, options.configPath);
    if (!existsSync(configPath)) {
      throw new ConfigError(`config file not found: ${configPath}`);
    }
    return loadConfigFile(configPath);
  }
  const found = findConfigPath(options.cwd);
  if (!found) {
    return resolveConfig({}, path.resolve(options.cwd), null);
  }
  return loadConfigFile(found);
}

export function loadConfigFile(configPath: string): ResolvedConfig {
  const text = readFileSync(configPath, "utf8");
  return loadConfigText(text, path.dirname(configPath), configPath);
}

export function loadConfigText(
  text: string,
  configDir: string,
  configPath: string | null,
): ResolvedConfig {
  let raw: unknown;
  try {
    raw = parseYaml(text) ?? {};
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new ConfigError(`invalid YAML: ${detail}`);
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ConfigError("config must be a YAML mapping");
  }
  return resolveConfig(raw as RawConfig, configDir, configPath);
}

export function resolveConfig(
  raw: RawConfig,
  configDir: string,
  configPath: string | null,
): ResolvedConfig {
  const builtinIds = new Set(builtinRules.map((rule) => rule.id));
  const disabledRules = optionalStringList(raw.disabled_rules, "disabled_rules");
  const optInRules = optionalStringList(raw.opt_in_rules, "opt_in_rules");
  const onlyRules = optionalStringList(raw.only_rules, "only_rules");
  const included = optionalStringList(raw.included, "included") ?? ["**/*.xs"];
  const excluded = optionalStringList(raw.excluded, "excluded") ?? [];
  const customRules = parseCustomRules(raw.custom_rules);
  const customIds = new Set(customRules.map((rule) => rule.id));

  for (const key of Object.keys(raw)) {
    if (KNOWN_KEYS.has(key) || builtinIds.has(key) || customIds.has(key)) {
      continue;
    }
    throw new ConfigError(`unknown config key: ${key}`);
  }

  if (onlyRules !== undefined) {
    if (disabledRules !== undefined || optInRules !== undefined) {
      throw new ConfigError(
        "only_rules cannot be combined with disabled_rules or opt_in_rules",
      );
    }
  }

  const knownIds = new Set([...builtinIds, ...customIds, "custom_rules"]);
  for (const [listName, list] of [
    ["disabled_rules", disabledRules],
    ["opt_in_rules", optInRules],
    ["only_rules", onlyRules],
  ] as const) {
    if (!list) {
      continue;
    }
    for (const id of list) {
      if (!knownIds.has(id)) {
        throw new ConfigError(`unknown rule id in ${listName}: ${id}`);
      }
    }
  }

  const enabledRuleIds = new Set<string>();
  if (onlyRules !== undefined) {
    for (const id of onlyRules) {
      if (id === "custom_rules") {
        for (const customId of customIds) {
          enabledRuleIds.add(customId);
        }
      } else {
        enabledRuleIds.add(id);
      }
    }
  } else {
    for (const rule of builtinRules) {
      if (rule.defaultEnabled && !disabledRules?.includes(rule.id)) {
        enabledRuleIds.add(rule.id);
      }
      if (!rule.defaultEnabled && optInRules?.includes(rule.id)) {
        enabledRuleIds.add(rule.id);
      }
    }
    for (const custom of customRules) {
      if (!disabledRules?.includes(custom.id)) {
        enabledRuleIds.add(custom.id);
      }
    }
  }

  const ruleOptions = new Map<string, RuleOptions>();
  for (const rule of builtinRules) {
    if (rule.id in raw) {
      ruleOptions.set(rule.id, parseRuleOptions(raw[rule.id], rule.id));
    }
  }
  const activeCustomRules = customRules.filter((rule) =>
    enabledRuleIds.has(rule.id),
  );

  return {
    configDir,
    configPath,
    enabledRuleIds,
    ruleOptions,
    included,
    excluded,
    customRules: activeCustomRules,
  };
}

function parseCustomRules(value: unknown): CustomRuleConfig[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new ConfigError("custom_rules must be a mapping of id to rule");
  }
  const result: CustomRuleConfig[] = [];
  for (const [id, spec] of Object.entries(value as Record<string, unknown>)) {
    if (typeof spec !== "object" || spec === null || Array.isArray(spec)) {
      throw new ConfigError(`custom_rules.${id} must be a mapping`);
    }
    const raw = spec as RawCustomRule;
    if (typeof raw.regex !== "string" || raw.regex.length === 0) {
      throw new ConfigError(`custom_rules.${id}.regex is required`);
    }
    let pattern: RegExp;
    try {
      pattern = new RegExp(raw.regex);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new ConfigError(`custom_rules.${id}.regex is invalid: ${detail}`);
    }
    result.push({
      id,
      name: optionalString(raw.name, `custom_rules.${id}.name`) ?? id,
      regex: raw.regex,
      pattern,
      message:
        optionalString(raw.message, `custom_rules.${id}.message`) ??
        `custom rule ${id} matched`,
      severity: optionalSeverity(raw.severity, `custom_rules.${id}.severity`) ?? "warning",
      included: optionalStringList(raw.included, `custom_rules.${id}.included`),
      excluded: optionalStringList(raw.excluded, `custom_rules.${id}.excluded`),
    });
  }
  return result;
}

function parseRuleOptions(value: unknown, id: string): RuleOptions {
  if (typeof value === "string") {
    return { severity: asSeverity(value, id) };
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ConfigError(`${id} must be a severity or a mapping`);
  }
  const record = value as Record<string, unknown>;
  const options: RuleOptions = {};
  if (record.severity !== undefined) {
    options.severity = asSeverity(record.severity, `${id}.severity`);
  }
  for (const key of Object.keys(record)) {
    if (key !== "severity") {
      throw new ConfigError(`unknown option for ${id}: ${key}`);
    }
  }
  return options;
}

function optionalStringList(value: unknown, label: string): string[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new ConfigError(`${label} must be a list of strings`);
  }
  return value as string[];
}

function optionalString(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new ConfigError(`${label} must be a string`);
  }
  return value;
}

function optionalSeverity(value: unknown, label: string): Severity | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return asSeverity(value, label);
}

function asSeverity(value: unknown, label: string): Severity {
  if (value === "error" || value === "warning") {
    return value;
  }
  throw new ConfigError(`${label} must be "error" or "warning"`);
}
