import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

// Reglas de React/JSX compartidas por los bloques JS y TS.
const reactRules = {
  // Marca como "usados" los componentes referenciados solo en JSX, de modo
  // que no-unused-vars sí detecte componentes muertos (sin falsos positivos).
  'react/jsx-uses-vars': 'error',
  'react/jsx-uses-react': 'off',
  // Componente JSX usado sin importar/definir → ERROR. El `no-undef` base de
  // eslint NO analiza identificadores JSX, así que SIN esta regla un
  // `<ProgressRing/>` sin su import pasa lint y build (causó la "vista de
  // curso en blanco"). Esta regla cierra ese agujero en el propio lint.
  'react/jsx-no-undef': 'error',
  // Reglas de los hooks de React.
  'react-hooks/rules-of-hooks': 'error',
  'react-hooks/exhaustive-deps': 'warn',
  // Compatibilidad con Fast Refresh de Vite.
  'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
  // Los catch vacíos (p. ej. try { ctx.close() } catch {}) son intencionados.
  'no-empty': ['error', { allowEmptyCatch: true }],
};

const unusedVarsOpts = { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' };
const reactPlugins = { react, 'react-hooks': reactHooks, 'react-refresh': reactRefresh };

// tseslint.config() permite `extends` por bloque, así las reglas de
// typescript-eslint quedan ACOTADAS a .ts/.tsx (no contaminan el JS).
export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'scripts'] },

  // ── JavaScript / JSX ────────────────────────────────────────────────────────
  {
    files: ['**/*.{js,jsx}'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    settings: { react: { version: 'detect' } },
    plugins: reactPlugins,
    rules: {
      ...reactRules,
      'no-unused-vars': ['warn', unusedVarsOpts],
    },
  },

  // ── TypeScript / TSX ─────────────────────────────────────────────────────────
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: 'detect' } },
    plugins: reactPlugins,
    rules: {
      ...reactRules,
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', unusedVarsOpts],
    },
  },
);
