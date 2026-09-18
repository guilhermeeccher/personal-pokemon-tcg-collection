import path from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  // Espelha o path alias do tsconfig ("@/*" -> "./src/*"): sem isto, um
  // módulo de teste que importa algo via "@/..." (mesmo indiretamente,
  // através de um módulo que ele importa) falha em runtime só no Vitest —
  // o Next.js resolve o alias normalmente. Adicionado em 2026-08-26 para
  // permitir que `parser-catalogo-repo.test.ts` reaproveite `paraLinha` de
  // `lib/sync/catalogo.ts` (que importa vários módulos via "@/...").
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
