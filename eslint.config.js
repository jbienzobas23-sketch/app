import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default [
  { ignores: ['dist', 'node_modules', 'scripts'] },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx}'],
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
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
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
      // Variables, funciones e imports sin usar → aviso (no rompe el build).
      // Ignora args/vars con prefijo "_" y los bindings de catch.
      'no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrors: 'none',
      }],
      // Los catch vacíos (p. ej. try { ctx.close() } catch {}) son intencionados.
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
];
