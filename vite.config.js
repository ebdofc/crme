import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [
    {
      name: 'emit-orgaos-catalog',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'orgaos.json',
          source: readFileSync(resolve(import.meta.dirname, 'orgaos.json')),
        });
      },
    },
  ],
  build: {
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, 'index.html'),
        dashboard: resolve(import.meta.dirname, 'dashboard.html'),
        noticias: resolve(import.meta.dirname, 'noticias.html'),
        documentos: resolve(import.meta.dirname, 'documentos.html'),
        consultar: resolve(import.meta.dirname, 'consultar.html'),
        'controle-patentes': resolve(import.meta.dirname, 'controle-patentes.html'),
        alistamento: resolve(import.meta.dirname, 'alistamento.html'),
        acoes: resolve(import.meta.dirname, 'acoes.html'),
        aulas: resolve(import.meta.dirname, 'aulas.html'),
        orgaos: resolve(import.meta.dirname, 'orgaos.html'),
        ciclos: resolve(import.meta.dirname, 'ciclos.html'),
        monitoramento: resolve(import.meta.dirname, 'monitoramento.html'),
        administracao: resolve(import.meta.dirname, 'administracao.html'),
        permanencia: resolve(import.meta.dirname, 'permanencia.html'),
      },
    },
  },
});
