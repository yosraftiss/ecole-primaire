// Configuration de Tailwind CSS (utilisé par le Hero TOONHUB).
// « preflight » est désactivé pour ne pas modifier les styles existants de l'application.
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {},
  },
  plugins: [],
};
