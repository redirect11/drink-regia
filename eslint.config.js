import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'

export default [
  { ignores: ['dist', 'coverage', 'node_modules', 'functions/node_modules'] },
  {
    files: ['src/**/*.{js,jsx}', 'tests/**/*.{js,jsx}', 'functions/**/*.js'],
    languageOptions: {
      ecmaVersion: 2021,
      // __APP_VERSION__ la definisce Vite (vite.config.js, vitest.config.mjs).
      globals: { ...globals.browser, ...globals.node, __APP_VERSION__: 'readonly' },
      parserOptions: { ecmaVersion: 'latest', ecmaFeatures: { jsx: true }, sourceType: 'module' },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...js.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
  {
    files: ['*.config.js', '*.config.mjs'],
    languageOptions: { ecmaVersion: 2021, globals: globals.node, sourceType: 'module' },
    rules: { ...js.configs.recommended.rules },
  },
]
