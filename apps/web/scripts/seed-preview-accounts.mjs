// Durable hosted-Preview fixtures. This is intentionally NOT part of the local
// E2E suite and must never target Production. Safe to re-run: it restores the
// three named personas to a known account/profile baseline without creating
// bookings, payments, Storage objects, or a public provider listing.

import { createClient } from "@supabase/supabase-js";

const PREVIEW_PROJECT_REF = "wxexfpcktzecaipndmzu";
const PREVIEW_URL = `https://${PREVIEW_PROJECT_REF}.supabase.co`;
const SYNTHETIC_EMAIL_SUFFIX = "@college-crew.example.test";

const previewUrl = process.env.SUPABASE_PREVIEW_URL;
const serviceRoleKey = process.env.SUPABASE_PREVIEW_SERVICE_ROLE_KEY;
const password = process.env.PREVIEW_TEST_PASSWORD;

if (previewUrl !== PREVIEW_URL) {
  console.error(
    `Refusing to seed: SUPABASE_PREVIEW_URL must be exactly ${PREVIEW_URL}.`,
  );
  process.exit(1);
}

if (!serviceRoleKey) {
  console.error("Missing SUPABASE_PREVIEW_SERVICE_ROLE_KEY.");
  process.exit(1);
}

if (!password || password.length < 12) {
  console.error("PREVIEW_TEST_PASSWORD must contain at least 12 characters.");
  process.exit(1);
}

const admin = createClient(previewUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const personas = [
  {
    key: "customer",
    email: `synthetic-customer${SYNTHETIC_EMAIL_SUFFIX}`,
    fullName: "SYNTHETIC Preview Customer",
    role: "customer",
    dateOfBirth: null,
  },
  {
    key: "provider",
    email: `synthetic-provider${SYNTHETIC_EMAIL_SUFFIX}`,
    fullName: "SYNTHETIC Preview Provider",
    role: "customer",
    dateOfBirth: "2000-01-01",
  },
  {
    key: "admin",
    email: `synthetic-admin${SYNTHETIC_EMAIL_SUFFIX}`,
    fullName: "SYNTHETIC Preview Admin",
    role: "admin",
    dateOfBirth: null,
  },
];

async function findUserByEmail(email) {
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw error;

    const match = data.users.find(
      (user) => user.email?.toLowerCase() === email.toLowerCase(),
    );
    if (match) return match;
    if (data.users.length < 200) return null;
  }
}

async function ensureUser(persona) {
  const metadata = {
    full_name: persona.fullName,
    fixture: "college-crew-hosted-preview",
    fixture_persona: persona.key,
    ...(persona.dateOfBirth
      ? { date_of_birth: persona.dateOfBirth, signup_intent: "provider" }
      : {}),
  };
  const existing = await findUserByEmail(persona.email);

  if (existing) {
    const { data, error } = await admin.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      user_metadata: metadata,
    });
    if (error) throw error;
    return data.user;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: persona.email,
    password,
    email_confirm: true,
    user_metadata: metadata,
  });
  if (error) throw error;
  return data.user;
}

async function run() {
  const adminPersona = personas.find((persona) => persona.key === "admin");
  const { error: allowlistError } = await admin.from("admin_allowlist").upsert(
    {
      email: adminPersona.email,
      note: "SYNTHETIC hosted Preview fixture",
    },
    { onConflict: "email" },
  );
  if (allowlistError) throw allowlistError;

  const users = new Map();
  for (const persona of personas) {
    const user = await ensureUser(persona);
    users.set(persona.key, user);

    const { error: profileError } = await admin
      .from("profiles")
      .update({
        role: persona.role,
        full_name: persona.fullName,
        date_of_birth: persona.dateOfBirth,
        address_line1: "SYNTHETIC Preview Address",
        address_line2: "",
        city: "SYNTHETIC Preview City",
        state: "MN",
        postal_code: "00000",
        latitude: null,
        longitude: null,
        geocoded_at: null,
      })
      .eq("id", user.id);
    if (profileError) throw profileError;
  }

  const providerUser = users.get("provider");
  const { error: providerError } = await admin.from("provider_profiles").upsert(
    {
      user_id: providerUser.id,
      display_name: "SYNTHETIC Preview Provider",
      company_name: "SYNTHETIC Preview Provider Fixture",
      bio: "SYNTHETIC hosted Preview provider applicant for manual testing.",
      provider_type: "individual",
      neighborhood: "SYNTHETIC Preview Neighborhood",
      school_name: "SYNTHETIC Preview University",
      service_zip: "00000",
      verification_status: "pending",
      background_check_status: "none",
      verification_bypassed: false,
      stripe_account_id: null,
      stripe_transfers_active: false,
      stripe_transfers_checked_at: null,
      is_active: false,
      admin_forced_inactive: true,
    },
    { onConflict: "user_id" },
  );
  if (providerError) throw providerError;

  const ids = [...users.values()].map((user) => user.id);
  const { data: verifiedProfiles, error: verifyError } = await admin
    .from("profiles")
    .select("id, role, full_name")
    .in("id", ids);
  if (verifyError) throw verifyError;

  if (verifiedProfiles.length !== personas.length) {
    throw new Error(
      `Fixture verification found ${verifiedProfiles.length}/${personas.length} profiles.`,
    );
  }

  const { data: provider, error: providerVerifyError } = await admin
    .from("provider_profiles")
    .select("display_name, verification_status, is_active, admin_forced_inactive")
    .eq("user_id", providerUser.id)
    .single();
  if (providerVerifyError) throw providerVerifyError;
  if (
    provider.verification_status !== "pending" ||
    provider.is_active ||
    !provider.admin_forced_inactive
  ) {
    throw new Error("Provider fixture did not retain its non-public safety state.");
  }

  console.log("Hosted Preview personas are ready:");
  for (const persona of personas) console.log(`  ${persona.key}: ${persona.email}`);
  console.log("Password was read from PREVIEW_TEST_PASSWORD and was not printed.");
}

try {
  await run();
} catch (error) {
  console.error(
    "Preview fixture setup failed:",
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
}
