import type { DummyRule, OxlintConfig, OxlintOverride } from 'oxlint';

export type RulesWithJsPlugins = NonNullable<OxlintConfig['rules']> &
  Record<string, DummyRule | undefined>;

export interface OverrideWithJsPlugins extends Omit<OxlintOverride, 'rules'> {
  rules?: RulesWithJsPlugins;
}

export interface LocalOxlintConfig extends Omit<
  OxlintConfig,
  'rules' | 'overrides'
> {
  rules?: RulesWithJsPlugins;
  overrides?: OverrideWithJsPlugins[];
}
