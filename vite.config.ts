import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';

export default defineConfig({
  plugins: [
    react(),
    electron({
      main: {
        entry: 'electron/main.ts',
        // O SDK localiza o executavel do Claude Code a partir da propria pasta: nao pode ser empacotado.
        vite: { build: { rollupOptions: { external: ['@anthropic-ai/claude-agent-sdk'] } } },
      },
      preload: { input: 'electron/preload.ts' },
    }),
  ],
});
