// Seed / teardown for local development.
//
//   node --env-file=.env.local scripts/seed.mjs            # seed
//   node --env-file=.env.local scripts/seed.mjs --teardown # remove all seed data
//
// Creates a handful of APPROVED providers (plus a couple of customers and some
// completed bookings + reviews) so the customer-facing pages render with real
// data. All fake, no real PII. Every account lives on the SEED_DOMAIN, so
// teardown can find and delete them; ON DELETE CASCADE removes everything else.
//
// Requires SUPABASE_SERVICE_ROLE_KEY (service-role, bypasses RLS) — server-only.

import { createClient } from "@supabase/supabase-js";

const SEED_DOMAIN = "seed.collegecrew.local";
const SEED_PASSWORD = "seed-password-123";
const NEIGHBORHOOD = "Maple Heights";
const FEE_RATE = 0.15; // SPEC §3: 15% take.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "Missing env. Run with:  node --env-file=.env.local scripts/seed.mjs",
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// --- data -------------------------------------------------------------------

// price_cents, price_type: 'fixed'|'quote', unit: 'per_job'|'per_hour'
const PROVIDERS = [
  {
    key: "maya",
    full_name: "Maya Thompson",
    display_name: "Maya's Yard Crew",
    provider_type: "business",
    bio: "Two-person student crew for lawns, leaf cleanup, and driveway pressure washing. Reliable, insured, and quick.",
    availability: { days: ["mon", "wed", "fri", "sat"], note: "Mornings preferred" },
    services: [
      { slug: "lawn-yard-care", price_cents: 4500, price_type: "fixed", unit: "per_job" },
      { slug: "pressure-washing", price_cents: 0, price_type: "quote", unit: "per_job" },
    ],
  },
  {
    key: "jordan",
    full_name: "Jordan Alvarez",
    display_name: "Jordan A.",
    provider_type: "individual",
    bio: "Junior studying biology. I love dogs and have pet-sat for neighbors for three years.",
    availability: { days: ["tue", "thu", "sat", "sun"], note: "Flexible after 2pm" },
    services: [
      { slug: "pet-care", price_cents: 2000, price_type: "fixed", unit: "per_job" },
    ],
  },
  {
    key: "clearview",
    full_name: "Priya Nair",
    display_name: "Clearview Window Co.",
    provider_type: "business",
    bio: "Streak-free interior and exterior window washing. Student-run, ladder-equipped, screens cleaned too.",
    availability: { days: ["mon", "tue", "wed", "thu"], note: "Weekdays" },
    services: [
      { slug: "window-washing", price_cents: 6000, price_type: "fixed", unit: "per_job" },
      { slug: "pressure-washing", price_cents: 0, price_type: "quote", unit: "per_job" },
    ],
  },
  {
    key: "sam",
    full_name: "Sam Nguyen",
    display_name: "Sam N.",
    provider_type: "individual",
    bio: "Math and chemistry tutor, and experienced babysitter. Patient, CPR-certified, references available.",
    availability: { days: ["mon", "wed", "sun"], note: "Evenings" },
    services: [
      { slug: "tutoring", price_cents: 2500, price_type: "fixed", unit: "per_hour" },
      { slug: "babysitting", price_cents: 1800, price_type: "fixed", unit: "per_hour" },
    ],
  },
  {
    key: "avery",
    full_name: "Avery Kim",
    display_name: "Avery K.",
    provider_type: "individual",
    bio: "Organized, detail-oriented helper for errands and home tasks: Amazon returns, grocery pickup, mail sorting, and quick home check-ins.",
    availability: { days: ["mon", "tue", "thu", "sun"], note: "Afternoons and early evenings" },
    services: [
      { slug: "house-management", price_cents: 2200, price_type: "fixed", unit: "per_hour" },
    ],
  },
  {
    key: "marcus",
    full_name: "Marcus Reed",
    display_name: "Marcus R.",
    provider_type: "individual",
    bio: "Former varsity soccer and basketball captain. I coach kids on fundamentals, confidence, footwork, and game-day preparation.",
    availability: { days: ["wed", "fri", "sat", "sun"], note: "After school and weekends" },
    services: [
      { slug: "youth-sports-coaching", price_cents: 3000, price_type: "fixed", unit: "per_hour" },
    ],
  },
  {
    key: "tyler",
    full_name: "Tyler Brooks",
    display_name: "Tyler B.",
    provider_type: "individual",
    bio: "Got a truck and a strong back. Hauling, junk removal, and yard work on short notice.",
    availability: { days: ["fri", "sat", "sun"], note: "Weekends" },
    services: [
      { slug: "hauling", price_cents: 0, price_type: "quote", unit: "per_job" },
      { slug: "lawn-yard-care", price_cents: 4000, price_type: "fixed", unit: "per_job" },
    ],
  },
];

const CUSTOMERS = [
  { key: "alex", full_name: "Alex Rivera" },
  { key: "riley", full_name: "Riley Carter" },
];

// Completed bookings that turn into reviews (drives ratings on cards/profiles).
// marker keeps this idempotent — we skip a review whose booking already exists.
const REVIEWS = [
  { marker: "maya-alex", provider: "maya", customer: "alex", slug: "lawn-yard-care", price_cents: 4500, rating: 5, text: "Yard looks incredible. Fast and friendly — booking again." },
  { marker: "maya-riley", provider: "maya", customer: "riley", slug: "lawn-yard-care", price_cents: 4500, rating: 4, text: "Great job on the lawn, showed up right on time." },
  { marker: "clearview-alex", provider: "clearview", customer: "alex", slug: "window-washing", price_cents: 6000, rating: 5, text: "Windows have never been this clean. Super professional." },
  { marker: "sam-riley", provider: "sam", customer: "riley", slug: "tutoring", price_cents: 2500, rating: 5, text: "Helped my son with calculus — his grade jumped a letter." },
  { marker: "avery-alex", provider: "avery", customer: "alex", slug: "house-management", price_cents: 4400, rating: 5, text: "Avery handled returns, groceries, and a quick house check exactly as requested." },
  { marker: "marcus-riley", provider: "marcus", customer: "riley", slug: "youth-sports-coaching", price_cents: 3000, rating: 5, text: "Marcus made soccer practice fun and gave our daughter drills she actually wants to do." },
  { marker: "tyler-alex", provider: "tyler", customer: "alex", slug: "hauling", price_cents: 8000, rating: 4, text: "Cleared out the garage in an afternoon. Would recommend." },
];

const email = (key) => `${key}@${SEED_DOMAIN}`;

// --- helpers ----------------------------------------------------------------

async function findUserByEmail(addr) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const match = data.users.find((u) => u.email?.toLowerCase() === addr.toLowerCase());
    if (match) return match;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function getOrCreateUser(key, full_name, role) {
  const addr = email(key);
  const existing = await findUserByEmail(addr);
  if (existing) return existing;

  const { data, error } = await admin.auth.admin.createUser({
    email: addr,
    password: SEED_PASSWORD,
    email_confirm: true,
    user_metadata: { role, full_name },
  });
  if (error) throw error;
  return data.user;
}

// --- seed -------------------------------------------------------------------

async function seed() {
  // 1. Map service slug -> id.
  const { data: services, error: svcErr } = await admin
    .from("services")
    .select("id, slug");
  if (svcErr) throw svcErr;
  const serviceId = new Map(services.map((s) => [s.slug, s.id]));

  // 2. Providers (auth user -> profile via trigger -> provider_profile -> services).
  const providerId = new Map(); // key -> provider_profiles.id
  for (const p of PROVIDERS) {
    const user = await getOrCreateUser(p.key, p.full_name, "provider");

    const { data: profile, error: ppErr } = await admin
      .from("provider_profiles")
      .upsert(
        {
          user_id: user.id,
          display_name: p.display_name,
          bio: p.bio,
          provider_type: p.provider_type,
          neighborhood: NEIGHBORHOOD,
          verification_status: "approved",
          background_check_status: "passed",
          availability: p.availability,
        },
        { onConflict: "user_id" },
      )
      .select("id")
      .single();
    if (ppErr) throw ppErr;
    providerId.set(p.key, profile.id);

    const offered = p.services.map((s) => ({
      provider_id: profile.id,
      service_id: serviceId.get(s.slug),
      price_cents: s.price_cents,
      price_type: s.price_type,
      unit: s.unit,
    }));
    const { error: psErr } = await admin
      .from("provider_services")
      .upsert(offered, { onConflict: "provider_id,service_id" });
    if (psErr) throw psErr;

    console.log(`  provider  ${p.display_name}`);
  }

  // 3. Customers.
  const customerId = new Map(); // key -> profiles.id (== auth user id)
  for (const c of CUSTOMERS) {
    const user = await getOrCreateUser(c.key, c.full_name, "customer");
    customerId.set(c.key, user.id);
    console.log(`  customer  ${c.full_name}`);
  }

  // 4. Completed bookings + reviews (idempotent via details marker).
  const { data: existing, error: exErr } = await admin
    .from("bookings")
    .select("details")
    .like("details", "[seed:%");
  if (exErr) throw exErr;
  const seen = new Set(existing.map((b) => b.details));

  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
  for (const r of REVIEWS) {
    const details = `[seed:${r.marker}]`;
    if (seen.has(details)) {
      console.log(`  review    ${r.marker} (exists, skipped)`);
      continue;
    }
    const fee = Math.round(r.price_cents * FEE_RATE);
    const { data: booking, error: bErr } = await admin
      .from("bookings")
      .insert({
        customer_id: customerId.get(r.customer),
        provider_id: providerId.get(r.provider),
        service_id: serviceId.get(r.slug),
        status: "completed",
        scheduled_at: weekAgo,
        address: `${100 + Math.floor(Math.random() * 800)} Maple Ave, ${NEIGHBORHOOD}`,
        details,
        price_cents: r.price_cents,
        platform_fee_cents: fee,
      })
      .select("id")
      .single();
    if (bErr) throw bErr;

    const { error: rErr } = await admin
      .from("reviews")
      .insert({ booking_id: booking.id, rating: r.rating, text: r.text });
    if (rErr) throw rErr;

    console.log(`  review    ${r.marker} (${r.rating}★)`);
  }

  console.log("\nSeed complete.");
}

// --- teardown ---------------------------------------------------------------

async function teardown() {
  let removed = 0;
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const seeded = data.users.filter((u) => u.email?.endsWith(`@${SEED_DOMAIN}`));
    for (const u of seeded) {
      const { error: delErr } = await admin.auth.admin.deleteUser(u.id);
      if (delErr) throw delErr;
      removed++;
      console.log(`  removed   ${u.email}`);
    }
    if (data.users.length < 200) break;
  }
  console.log(`\nTeardown complete — removed ${removed} seed account(s).`);
}

// --- run --------------------------------------------------------------------

const run = process.argv.includes("--teardown") ? teardown : seed;
run().catch((err) => {
  console.error("\nFailed:", err.message ?? err);
  process.exit(1);
});
