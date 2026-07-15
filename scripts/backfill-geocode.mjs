// One-off backfill: geocode existing profile addresses via the US Census
// geocoder and store coordinates. Safe to re-run — only profiles that have an
// address but no geocode attempt yet (geocoded_at is null) are touched.
//
// Usage: node scripts/backfill-geocode.mjs
// Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local.

import { readFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

import { createClient } from "@supabase/supabase-js";

function loadEnvLocal() {
  const text = readFileSync(".env.local", "utf8");
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^"|"$/g, "");
    }
  }
}

async function geocode(address) {
  const oneline = [address.line1, address.city, `${address.state} ${address.zip}`]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");
  if (!oneline) return null;

  const url = new URL(
    "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress",
  );
  url.searchParams.set("address", oneline);
  url.searchParams.set("benchmark", "Public_AR_Current");
  url.searchParams.set("format", "json");

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;
    const body = await response.json();
    const coordinates = body.result?.addressMatches?.[0]?.coordinates;
    if (typeof coordinates?.y !== "number" || typeof coordinates?.x !== "number") {
      return null;
    }
    return { latitude: coordinates.y, longitude: coordinates.x };
  } catch {
    return null;
  }
}

loadEnvLocal();
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

const { data: profiles, error } = await admin
  .from("profiles")
  .select("id, address_line1, city, state, postal_code")
  .is("geocoded_at", null)
  .neq("address_line1", "");
if (error) {
  console.error("Could not list profiles:", error.message);
  process.exit(1);
}

console.log(`Geocoding ${profiles.length} profile(s)…`);
let matched = 0;
for (const profile of profiles) {
  const coordinates = await geocode({
    line1: profile.address_line1,
    city: profile.city,
    state: profile.state,
    zip: profile.postal_code,
  });
  const { error: updateError } = await admin
    .from("profiles")
    .update({
      latitude: coordinates?.latitude ?? null,
      longitude: coordinates?.longitude ?? null,
      geocoded_at: new Date().toISOString(),
    })
    .eq("id", profile.id);
  if (updateError) {
    console.error(`  ${profile.id}: update failed — ${updateError.message}`);
  } else if (coordinates) {
    matched += 1;
    console.log(`  ${profile.id}: ok`);
  } else {
    console.log(`  ${profile.id}: no match (town-only display)`);
  }
  await sleep(150); // be polite to the free endpoint
}
console.log(`Done — ${matched}/${profiles.length} matched.`);
