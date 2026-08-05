import { fileURLToPath } from "node:url";

import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  // Mirror the `@/*` path alias from tsconfig.json. Without it a unit test can
  // only import modules whose whole transitive graph is relative — `lib/site.ts`
  // imports `@/lib/booking/policy`, so anything reading SITE_URL was untestable.
  // `vi.mock("@/…")` worked already because a mock factory short-circuits
  // resolution; real imports did not.
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    // Playwright owns `tests/e2e/**/*.spec.ts`; `.test.ts` files in there (the
    // e2e support helpers) are plain unit tests and belong to vitest.
    exclude: [...configDefaults.exclude, "tests/e2e/**/*.spec.ts"],
  },
});
