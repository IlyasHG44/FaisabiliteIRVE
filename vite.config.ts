import { defineConfig } from 'vite';

// Durcissement du build statique (protection partielle — le vrai secret métier
// devra passer côté backend ; cf. note de déploiement).
export default defineConfig({
  build: {
    sourcemap: false,    // ne jamais publier le code source d'origine
    target: 'es2020',
    minify: true,        // minification/mangling des noms (oxc, défaut Vite 8)
  },
});
