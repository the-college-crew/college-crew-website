import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Playwright owns `tests/e2e/**/*.spec.ts`; `.test.ts` files in there (the
    // e2e support helpers) are plain unit tests and belong to vitest.
    exclude: [...configDefaults.exclude, "tests/e2e/**/*.spec.ts"],
  },
});
