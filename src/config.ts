import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { aliasRuleIds, canonicalRuleId } from "./ruleAliases.js";
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
  "strict",
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
  definedCustomRules: CustomRuleConfig[];
  strict: boolean;
}

export interface RuleOverrides {
  optIn: string[];
  disable: string[];
  only: string[];
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
  strict?: unknown;
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
  const strict = optionalBoolean(raw.strict, "strict") ?? false;

  for (const key of Object.keys(raw)) {
    if (
      KNOWN_KEYS.has(key) ||
      builtinIds.has(key) ||
      builtinIds.has(canonicalRuleId(key)) ||
      customIds.has(key)
    ) {
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

  const knownIds = new Set([...builtinIds, ...customIds]);
  for (const [listName, list] of [
    ["disabled_rules", disabledRules],
    ["opt_in_rules", optInRules],
    ["only_rules", onlyRules],
  ] as const) {
    if (!list) {
      continue;
    }
    for (const id of list) {
      if (id === "custom_rules") {
        if (listName !== "only_rules") {
          throw new ConfigError("custom_rules is only valid in only_rules");
        }
        continue;
      }
      if (!knownIds.has(canonicalRuleId(id))) {
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
      } else if (customIds.has(id)) {
        enabledRuleIds.add(id);
      } else {
        enabledRuleIds.add(canonicalRuleId(id));
      }
    }
  } else {
    const disabledCustom = new Set(disabledRules ?? []);
    const disabledBuiltin = canonicalBuiltinIds(disabledRules, customIds);
    const optedIn = canonicalBuiltinIds(optInRules, customIds);
    for (const rule of builtinRules) {
      if (rule.defaultEnabled && !disabledBuiltin.has(rule.id)) {
        enabledRuleIds.add(rule.id);
      }
      if (
        !rule.defaultEnabled &&
        optedIn.has(rule.id) &&
        !disabledBuiltin.has(rule.id)
      ) {
        enabledRuleIds.add(rule.id);
      }
    }
    for (const custom of customRules) {
      if (!disabledCustom.has(custom.id)) {
        enabledRuleIds.add(custom.id);
      }
    }
  }

  const ruleOptions = new Map<string, RuleOptions>();
  for (const rule of builtinRules) {
    if (rule.id in raw) {
      ruleOptions.set(rule.id, parseRuleOptions(raw[rule.id], rule));
      continue;
    }
    for (const alias of aliasRuleIds(rule.id)) {
      if (alias in raw) {
        ruleOptions.set(rule.id, parseRuleOptions(raw[alias], rule));
        break;
      }
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
    definedCustomRules: customRules,
    strict,
  };
}

export function applyRuleOverrides(
  config: ResolvedConfig,
  overrides: RuleOverrides,
): ResolvedConfig {
  const optIn = overrides.optIn;
  const disable = overrides.disable;
  const only = overrides.only;
  if (optIn.length === 0 && disable.length === 0 && only.length === 0) {
    return config;
  }

  if (only.length > 0 && (optIn.length > 0 || disable.length > 0)) {
    throw new ConfigError("--only cannot be combined with --opt-in or --disable");
  }

  const builtinIds = new Set(builtinRules.map((rule) => rule.id));
  const customIds = new Set(config.definedCustomRules.map((rule) => rule.id));
  const knownIds = new Set([...builtinIds, ...customIds]);

  validateOverrideIds(optIn, "--opt-in", knownIds, customIds, {
    allowAll: true,
    allowCustomToken: false,
  });
  validateOverrideIds(disable, "--disable", knownIds, customIds, {
    allowAll: false,
    allowCustomToken: false,
  });
  validateOverrideIds(only, "--only", knownIds, customIds, {
    allowAll: false,
    allowCustomToken: true,
  });

  const enabledRuleIds = new Set<string>();
  if (only.length > 0) {
    for (const id of only) {
      if (id === "custom_rules") {
        for (const customId of customIds) {
          enabledRuleIds.add(customId);
        }
      } else {
        enabledRuleIds.add(resolveOverrideId(id, customIds));
      }
    }
  } else {
    for (const id of config.enabledRuleIds) {
      enabledRuleIds.add(id);
    }
    for (const id of optIn) {
      if (id === "all") {
        for (const rule of builtinRules) {
          enabledRuleIds.add(rule.id);
        }
      } else {
        enabledRuleIds.add(resolveOverrideId(id, customIds));
      }
    }
    for (const id of disable) {
      enabledRuleIds.delete(resolveOverrideId(id, customIds));
    }
  }

  return {
    ...config,
    enabledRuleIds,
    customRules: config.definedCustomRules.filter((rule) =>
      enabledRuleIds.has(rule.id),
    ),
  };
}

function validateOverrideIds(
  ids: string[],
  listName: string,
  knownIds: Set<string>,
  customIds: Set<string>,
  allowed: { allowAll: boolean; allowCustomToken: boolean },
): void {
  for (const id of ids) {
    if (id === "all") {
      if (!allowed.allowAll) {
        throw new ConfigError("all is only valid in --opt-in");
      }
      continue;
    }
    if (id === "custom_rules") {
      if (!allowed.allowCustomToken) {
        throw new ConfigError("custom_rules is only valid in --only");
      }
      continue;
    }
    if (customIds.has(id)) {
      continue;
    }
    if (!knownIds.has(canonicalRuleId(id))) {
      throw new ConfigError(`unknown rule id in ${listName}: ${id}`);
    }
  }
}

function resolveOverrideId(id: string, customIds: Set<string>): string {
  if (customIds.has(id)) {
    return id;
  }
  return canonicalRuleId(id);
}

function canonicalBuiltinIds(
  ids: string[] | undefined,
  customIds: Set<string>,
): Set<string> {
  return new Set(
    (ids ?? []).filter((id) => !customIds.has(id)).map(canonicalRuleId),
  );
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

function parseRuleOptions(value: unknown, rule: { id: string; numericOptions?: readonly string[] }): RuleOptions {
  const id = rule.id;
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
  const allowedNumeric = new Set(rule.numericOptions ?? []);
  for (const key of Object.keys(record)) {
    if (key === "severity") {
      continue;
    }
    if (key === "wrap_at" && allowedNumeric.has("wrap_at")) {
      options.wrapAt = asPositiveInt(record[key], `${id}.wrap_at`);
      continue;
    }
    if (key === "filter_limit" && allowedNumeric.has("filter_limit")) {
      options.filterLimit = asPositiveInt(record[key], `${id}.filter_limit`);
      continue;
    }
    throw new ConfigError(`unknown option for ${id}: ${key}`);
  }
  return options;
}

function asPositiveInt(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new ConfigError(`${label} must be an integer >= 1`);
  }
  return value;
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

function optionalBoolean(value: unknown, label: string): boolean | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw new ConfigError(`${label} must be a boolean`);
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
