// Run a trusted local test command with one durable hosted-Preview persona.
// The shared password stays in local OS-protected storage: macOS Keychain or a
// Windows DPAPI-encrypted file tied to the current Windows user and machine.
// This wrapper reads it into the child environment without printing it or
// storing it in the repository, Vercel, a dotenv file, or shell history.

import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";

const KEYCHAIN_ACCOUNT = "shared-personas";
const KEYCHAIN_SERVICE = "college-crew-preview-test-password";
const PASSWORD_ENV = "COLLEGE_CREW_PREVIEW_PASSWORD";
const WINDOWS_CREDENTIAL_RELATIVE_PATH =
  "CollegeCrew\\preview-persona-password.txt";

const WINDOWS_DECRYPT_COMMAND = String.raw`
$ErrorActionPreference = 'Stop'
$credentialPath = Join-Path $env:LOCALAPPDATA 'CollegeCrew\preview-persona-password.txt'
$encrypted = (Get-Content -LiteralPath $credentialPath -Raw).Trim()
$secure = ConvertTo-SecureString -String $encrypted
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  [Console]::Out.Write(
    [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  )
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
}
`;

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

function readMacPassword() {
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

  return password;
}

function readWindowsPassword() {
  if (!process.env.LOCALAPPDATA) {
    throw new Error(
      "Preview persona password cannot be read because LOCALAPPDATA is unset.",
    );
  }
  if (!process.env.SystemRoot || !path.win32.isAbsolute(process.env.SystemRoot)) {
    throw new Error(
      "Preview persona password cannot be read because SystemRoot is unset or invalid.",
    );
  }

  const powershellPath = path.win32.join(
    process.env.SystemRoot,
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );

  try {
    return execFileSync(
      powershellPath,
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        WINDOWS_DECRYPT_COMMAND,
      ],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        windowsHide: true,
      },
    ).trim();
  } catch {
    throw new Error(
      `Preview persona password is missing or unreadable in Windows secure storage (%LOCALAPPDATA%\\${WINDOWS_CREDENTIAL_RELATIVE_PATH}).`,
    );
  }
}

function readPassword() {
  const password =
    process.platform === "darwin"
      ? readMacPassword()
      : process.platform === "win32"
        ? readWindowsPassword()
        : undefined;

  if (password === undefined) {
    throw new Error(
      "Preview persona credentials support macOS Keychain and Windows DPAPI only.",
    );
  }

  if (password.length < 12) {
    throw new Error(
      "Preview persona password in local secure storage is unexpectedly short.",
    );
  }
  return password;
}

const args = process.argv.slice(2);

if (args.length === 1 && args[0] === "--check") {
  readPassword();
  console.log("Preview persona password is available in local secure storage.");
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
