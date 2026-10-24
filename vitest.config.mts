import 'dotenv/config';
import { defineConfig } from 'vitest/config';
export default defineConfig({test:{environment:'node',fileParallelism:false,exclude:['e2e/**','node_modules/**'],coverage:{provider:'v8',include:['app/**/*.{ts,tsx}','lib/**/*.ts','scripts/**/*.ts'],exclude:['**/*.test.ts','**/*.integration.test.ts'],reporter:['text','json-summary']}}});
