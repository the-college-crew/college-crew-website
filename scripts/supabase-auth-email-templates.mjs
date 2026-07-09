import { readFileSync } from "node:fs";

const templates = {
  confirmation: {
    subject: "Confirm your email to join College Crew",
    file: "supabase/templates/confirmation.html",
  },
  recovery: {
    subject: "Reset your College Crew password",
    file: "supabase/templates/recovery.html",
  },
  magic_link: {
    subject: "Your College Crew sign-in link",
    file: "supabase/templates/magic_link.html",
  },
  email_change: {
    subject: "Confirm your new email for College Crew",
    file: "supabase/templates/email_change.html",
  },
};

function buildPayload() {
  return Object.fromEntries(
    Object.entries(templates).flatMap(([key, template]) => [
      [`mailer_subjects_${key}`, template.subject],
      [
        `mailer_templates_${key}_content`,
        readFileSync(template.file, "utf8"),
      ],
    ]),
  );
}

async function syncHostedProject(payload) {
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
  const projectRef = process.env.PROJECT_REF || process.env.SUPABASE_PROJECT_REF;

  if (!accessToken || !projectRef) {
    throw new Error(
      "Set SUPABASE_ACCESS_TOKEN and PROJECT_REF, then rerun the sync command.",
    );
  }

  const response = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/config/auth`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Supabase template sync failed: ${response.status} ${body}`);
  }
}

const payload = buildPayload();

if (process.argv.includes("--print")) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
} else {
  await syncHostedProject(payload);
  console.log("Supabase Auth email templates synced.");
}
