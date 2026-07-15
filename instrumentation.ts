/** Next.js 16 server-startup validation. Secret values are never logged. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateServerEnvironment } = await import("./lib/env-validation");
    validateServerEnvironment();
  }
}
