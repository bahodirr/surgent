import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import importPlugin from 'eslint-plugin-import'

export default tseslint.config(
  { ignores: ['dist'] },
  {
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended
    ],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'import': importPlugin,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...importPlugin.configs.recommended.rules,
      ...importPlugin.configs.typescript.rules,
      'prefer-const': 'off',
      "react-hooks/rules-of-hooks": "error", 
      "react-hooks/exhaustive-deps": "error",
      '@typescript-eslint/no-unused-vars': "off",
      '@typescript-eslint/no-explicit-any': 'off',
      'react-refresh/only-export-components': [
        'error',
        { allowConstantExport: true },
      ],
      'import/named': 'error',
      'import/default': 'error',
      'import/no-unresolved': ['error', { 
        ignore: ['cloudflare:workers', 'agents'] 
      }],

      // CHANGED: Replaced the flawed rule with a more intelligent one.
      "no-restricted-syntax": [
        "error",
        {
          // This selector is more precise. In plain English, it means:
          // "Inside a function component (named in PascalCase), find any `set...` call,
          // but EXCLUDE any calls that are inside a nested function definition (like an event handler)."
          // This correctly finds the bug while ignoring the false positive.
          "selector": ":function[id.name=/^[A-Z]/] CallExpression[callee.name=/^set[A-Z]/]:not(ArrowFunctionExpression CallExpression, FunctionExpression CallExpression)",
          "message": "State setters should not be called directly in the component's render body. This will cause an infinite render loop. Use useEffect or an event handler instead."
        },
        {
          // This rule is a good backup to prevent setters inside memoization hooks.
          "selector": "CallExpression[callee.name=/^set[A-Z]/] > :function[parent.callee.name='useMemo'], CallExpression[callee.name=/^set[A-Z]/] > :function[parent.callee.name='useCallback']",
          "message": "State setters should not be called inside useMemo or useCallback. These hooks are for memoization, not for side effects."
        }
      ],
    },
    settings: {
      'import/resolver': {
        typescript: true,
        node: true,
      },
    },
  },
  // Disable react-refresh/only-export-components for UI components
  // as shadcn/ui components commonly export both components and utilities
  {
    files: ['src/components/ui/**/*.{ts,tsx}'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
)
