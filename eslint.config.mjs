import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
export default defineConfig([...nextVitals,...nextTs,{files:['app/board/view.tsx'],rules:{'react-hooks/refs':'off'}},{files:['app/reports/page.tsx'],rules:{'react-hooks/purity':'off'}},{files:['**/*.cjs'],rules:{'@typescript-eslint/no-require-imports':'off'}},globalIgnores(['.next/**','node_modules/**','generated/**','next-env.d.ts','test-results/**','playwright-report/**'])]);
