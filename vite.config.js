import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, 'index.html'),
        dashboard: resolve(import.meta.dirname, 'dashboard.html'),
        noticias: resolve(import.meta.dirname, 'noticias.html'),
        consultar: resolve(import.meta.dirname, 'consultar.html'),
        'controle-patentes': resolve(import.meta.dirname, 'controle-patentes.html'),
        alistamento: resolve(import.meta.dirname, 'alistamento.html'),
        acoes: resolve(import.meta.dirname, 'acoes.html'),
        aulas: resolve(import.meta.dirname, 'aulas.html'),
        orgaos: resolve(import.meta.dirname, 'orgaos.html'),
        ciclos: resolve(import.meta.dirname, 'ciclos.html'),
      },
    },
  },
});
