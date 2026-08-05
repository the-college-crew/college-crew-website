// Run a trusted local test command with one durable hosted-Preview persona.
// The shared password stays in the current macOS user's login Keychain: this
// wrapper reads it into the child environment without printing it or storing
// it in the repository, Vercel, a dotenv file, or shell history.

import { execFileSync, spawnSync } from "node:child_process";

const KEYCHAIN_ACCOUNT = "shared-personas";
const KEYCHAIN_SERVICE = "college-crew-preview-test-password";
const PASSWORD_ENV = "COLLEGE_CREW_PREVIEW_PASSWORD";

const PERSONAS = Object.freeze({
  customer: "synthetic-customer@college-crew.example.test",
  provider: "synthetic-provider@college-crew.example.test",
  admin: "synthetic-admin@college-crew.example.test",
});

function usage() {
  console.error(
    [
      "Usage:",
      "  npm run preview:persona -- --check",
      "  npm run preview:persona -- <customer|provider|admin> -- <command> [args...]",
    ].join("\n"),
  );
}

function readPassword() {
  if (process.platform !== "darwin") {
    throw new Error(
      "Preview persona credentials require a local macOS Keychain entry.",
    );
  }

  let password;
  try {
    password = execFileSync(
      "security",
      [
        "find-generic-password",
        "-a",
        KEYCHAIN_ACCOUNT,
        "-s",
        KEYCHAIN_SERVICE,
        "-w",
      ],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    ).trim();
  } catch {
    throw new Error(
      `Preview persona password is missing from macOS Keychain (service: ${KEYCHAIN_SERVICE}, account: ${KEYCHAIN_ACCOUNT}).`,
    );
  }

  if (password.length < 12) {
    throw new Error("Preview persona password in Keychain is unexpectedly short.");
  }
  return password;
}

const args = process.argv.slice(2);

if (args.length === 1 && args[0] === "--check") {
  readPassword();
  console.log("Preview persona password is available in macOS Keychain.");
  process.exit(0);
}

const [persona, separator, command, ...commandArgs] = args;
if (!(persona in PERSONAS) || separator !== "--" || !command) {
  usage();
  process.exit(2);
}

const password = readPassword();
const result = spawnSync(command, commandArgs, {
  env: {
    ...process.env,
    COLLEGE_CREW_PREVIEW_PERSONA: persona,
    COLLEGE_CREW_PREVIEW_EMAIL: PERSONAS[persona],
    [PASSWORD_ENV]: password,
  },
  shell: false,
  stdio: "inherit",
});

if (result.error) {
  console.error(`Could not start Preview test command: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
