import { defineConfig } from 'vite';
import { studioFiles } from './server/plugin.js';

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  plugins: [studioFiles()],
});
