// Configuration de Vite (outil qui lance l'application React).
// Les appels « /api » sont redirigés vers le serveur (port 3001) pendant le développement.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
});
