import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// `include` acotado a lib/**/*.test.ts a propósito: scripts/test-*.ts son utilidades de
// depuración manual (reciben un archivo real por argv), no deben ejecutarse como tests.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["lib/**/*.ts"],
      exclude: ["lib/**/*.test.ts", "lib/test-helpers/**"],
    },
  },
});
