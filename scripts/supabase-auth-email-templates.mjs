import { readFileSync } from "node:fs";

const templates = {
  confirmation: {
    subject: "Confirm your email to join College Crew",
    file: "supabase/templates/confirmation.html",
    type: "signup",
    requiredNextFragments: [
      "%2Fprovider%2Fonboarding%2Fverify",
      "%2Fdashboard",
    ],
  },
  recovery: {
    subject: "Reset your College Crew password",
    file: "supabase/templates/recovery.html",
    type: "recovery",
    requiredNextFragments: ["next=%2Freset-password"],
  },
  magic_link: {
    subject: "Your College Crew sign-in link",
    file: "supabase/templates/magic_link.html",
    type: "magiclink",
    requiredNextFragments: ["next=%2Fdashboard"],
  },
  email_change: {
    subject: "Confirm your new email for College Crew",
    file: "supabase/templates/email_change.html",
    type: "email_change",
    requiredNextFragments: ["next=%2Faccount"],
  },
};

function countOccurrences(value, fragment) {
  return value.split(fragment).length - 1;
}

function validateTemplate(name, template, content) {
  const callbackPrefix =
    `{{ .RedirectTo }}/auth/callback?token_hash={{ .TokenHash }}&type=${template.type}`;

  if (content.includes("{{ .RedirectTo }}&token_hash=")) {
    throw new Error(
      `${template.file} still appends token_hash directly to RedirectTo.`,
    );
  }

  // VML button, regular button, copyable-link href, and copyable-link text.
  if (countOccurrences(content, callbackPrefix) !== 4) {
    throw new Error(
      `${template.file} must contain the canonical callback URL exactly four times.`,
    );
  }

  for (const fragment of template.requiredNextFragments) {
    if (!content.includes(fragment)) {
      throw new Error(`${template.file} is missing required route ${fragment}.`);
    }
  }

  if (name === "confirmation" && !content.includes(".Data.signup_intent")) {
    throw new Error(
      `${template.file} must route provider-intent signups from user metadata.`,
    );
  }
}

function buildPayload() {
  return Object.fromEntries(
    Object.entries(templates).flatMap(([key, template]) => {
      const content = readFileSync(template.file, "utf8");
      validateTemplate(key, template, content);
      return [
        [`mailer_subjects_${key}`, template.subject],
        [`mailer_templates_${key}_content`, content],
      ];
    }),
  );
}

async function authConfigRequest(url, accessToken, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Supabase Auth config request failed: ${response.status} ${body}`,
    );
  }

  return response;
}

async function syncHostedProject(payload) {
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
  let linkedProjectRef;
  try {
    linkedProjectRef = readFileSync("supabase/.temp/project-ref", "utf8").trim();
  } catch {
    linkedProjectRef = undefined;
  }
  const projectRef =
    process.env.PROJECT_REF ||
    process.env.SUPABASE_PROJECT_REF ||
    linkedProjectRef;

  if (!accessToken || !projectRef) {
    throw new Error(
      "Set SUPABASE_ACCESS_TOKEN and PROJECT_REF, then rerun the sync command.",
    );
  }

  const url = `https://api.supabase.com/v1/projects/${projectRef}/config/auth`;
  await authConfigRequest(url, accessToken, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

  const readback = await authConfigRequest(url, accessToken);
  const remote = await readback.json();
  const mismatches = Object.entries(payload)
    .filter(([key, value]) => remote[key] !== value)
    .map(([key]) => key);

  if (mismatches.length > 0) {
    throw new Error(
      `Supabase template readback did not match: ${mismatches.join(", ")}`,
    );
  }
}

const payload = buildPayload();

if (process.argv.includes("--print")) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
} else {
  await syncHostedProject(payload);
  console.log("Supabase Auth email templates synced and verified.");
}
