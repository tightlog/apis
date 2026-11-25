import { fileURLToPath } from 'node:url';
import type { LocalOxlintConfig } from './oxlint.types.ts';

export const noConsole = [
  'error',
  { allow: ['warn', 'error'] },
] satisfies NonNullable<LocalOxlintConfig['rules']>[string];

export const sharedRules = {
  'style/blank-line-after-block': 'error',
  'perfectionist/sort-enums': 'off',
  'perfectionist/sort-heritage-clauses': 'off',
  'perfectionist/sort-interfaces': 'off',
  'perfectionist/sort-jsx-props': 'off',
  'perfectionist/sort-object-types': 'off',
  'perfectionist/sort-objects': 'off',
  'import-x/no-namespace': 'off',
  'unicorn/consistent-function-scoping': 'off',
  '@nkzw/no-instanceof': 'off',
  '@nkzw/ensure-relay-types': 'off',
  'react/immutability': 'off',
  'react/refs': 'off',
  'unicorn/prefer-string-slice': 'off',
  'unicorn/prefer-top-level-await': 'off',
  'unicorn/catch-error-name': 'off',
  'unicorn/numeric-separators-style': 'off',
  'unicorn/prefer-string-replace-all': 'off',
  'unicorn/prefer-at': 'off',
  // Hermes has no toSorted; ast-grep no-es2023-array-methods guards the app bundle.
  'unicorn/no-array-sort': 'off',
  'unicorn/prefer-single-call': 'off',
  'unicorn/prefer-array-index-of': 'off',
  'unicorn/prefer-node-protocol': 'off',
  'unicorn/prefer-string-raw': 'off',
  'unicorn/no-hex-escape': 'off',
  'prefer-arrow-callback': 'off',
  'object-shorthand': 'off',
  'no-empty': 'off',
  'unicorn/prefer-number-properties': 'off',
  'typescript/array-type': ['error', { default: 'array' }],
  'typescript/consistent-type-definitions': ['error', 'interface'],
} satisfies NonNullable<LocalOxlintConfig['rules']>;

export const reactCompilerRules = {
  'react/rules-of-hooks': 'error',
  'react/exhaustive-deps': 'warn',
  'react/static-components': 'error',
  'react/use-memo': 'error',
  'react/preserve-manual-memoization': 'error',
  'react/incompatible-library': 'warn',
  'react/immutability': 'error',
  'react/globals': 'error',
  'react/refs': 'error',
  'react/set-state-in-effect': 'error',
  'react/error-boundaries': 'error',
  'react/purity': 'error',
  'react/set-state-in-render': 'error',
  'react/unsupported-syntax': 'warn',
} satisfies NonNullable<LocalOxlintConfig['rules']>;

export const antiSlopRules = {
  'anti-slop/no-chained-type-assertions': 'error',
  'anti-slop/no-conditional-empty-object-spread': 'error',
  'anti-slop/no-known-value-widening': 'error',
  'anti-slop/no-module-mocking': 'error',
  'anti-slop/no-object-parameters': 'error',
  'anti-slop/no-reflect-apply': 'error',
  'anti-slop/no-reflect-get': 'error',
  'anti-slop/no-runtime-typeof': ['error', { allowInTypeGuards: true }],
  'anti-slop/no-shape-in-symbol-names': 'error',
  'anti-slop/no-unknown-parameters': 'error',
  'anti-slop/no-unknown-returns': 'error',
  'anti-slop/no-unknown-type-aliases': 'error',
  'anti-slop/no-unsafe-dictionary-type': 'error',
  'anti-slop/no-widen-then-assert': 'error',
  'anti-slop/require-safety-comment-for-type-assertion': 'error',
} satisfies NonNullable<LocalOxlintConfig['rules']>;

export const antiSlopRulesOff = Object.fromEntries(
  Object.keys(antiSlopRules).map(name => [name, 'off' as const]),
);

export const appForeignShapeFiles = [
  'src/components/generation/GenerationResultImage.tsx',
  'src/components/generation/InputControls.tsx',
  'src/widgets/BiteWindow.ios.tsx',
  'src/widgets/SessionActivity.ios.tsx',
  'src/lib/expoMediaLibraryWebStub.js',
  'src/lib/purchasesWebStub.js',
];

export const appForeignShapeRules = {
  'anti-slop/no-shape-in-symbol-names': 'off',
  'anti-slop/no-runtime-typeof': 'off',
} satisfies NonNullable<LocalOxlintConfig['rules']>;

export const typescriptFilesOverride = {
  files: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'],
  rules: {
    'constructor-super': 'off',
    'getter-return': 'off',
    'no-class-assign': 'off',
    'no-const-assign': 'off',
    'no-dupe-class-members': 'off',
    'no-dupe-keys': 'off',
    'no-func-assign': 'off',
    'no-import-assign': 'off',
    'no-new-native-nonconstructor': 'off',
    'no-obj-calls': 'off',
    'no-redeclare': 'off',
    'no-setter-return': 'off',
    'no-this-before-super': 'off',
    'no-unreachable': 'off',
    'no-unsafe-negation': 'off',
    'no-with': 'off',
  },
} satisfies NonNullable<LocalOxlintConfig['overrides']>[number];

export const stylePlugin = {
  name: 'style',
  specifier: fileURLToPath(
    new URL('./tools/oxlint/style/index.ts', import.meta.url),
  ),
};
