import { createHash, timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { runBookingScheduler } from "@/lib/booking/automation";

export const runtime = "nodejs";
export const maxDuration = 60;

function digest(value: string) {
  return createHash("sha256").update(value, "utf8").digest();
}

function isAuthorized(request: Request) {
  const expected = process.env.BOOKING_CRON_SECRET?.trim();
  if (!expected) return false;
  const authorization = request.headers.get("authorization") ?? "";
  const supplied = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  return timingSafeEqual(digest(supplied), digest(expected));
}

export async function POST(request: Request) {
  if (!process.env.BOOKING_CRON_SECRET?.trim()) {
    return NextResponse.json({ error: "Scheduler is not configured." }, { status: 503 });
  }
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const summary = await runBookingScheduler();
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    console.error("[booking-scheduler] cycle_failed", {
      errorClass: error instanceof Error ? error.name : "unknown_error",
    });
    return NextResponse.json({ error: "Scheduler cycle failed." }, { status: 500 });
  }
}
