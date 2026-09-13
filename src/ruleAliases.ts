const RULE_ID_ALIASES = new Map([["no_var_response", "no_reserved_var"]]);

export function canonicalRuleId(id: string): string {
  return RULE_ID_ALIASES.get(id) ?? id;
}

export function aliasRuleIds(canonical: string): string[] {
  const aliases: string[] = [];
  for (const [alias, target] of RULE_ID_ALIASES) {
    if (target === canonical) {
      aliases.push(alias);
    }
  }
  return aliases;
}
