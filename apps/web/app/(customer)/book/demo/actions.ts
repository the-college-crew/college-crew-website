"use server";

import { redirect } from "next/navigation";

import { getDemoPreview } from "@/lib/demo/sample-preview";

export async function submitDemoBookingRequest() {
  const preview = await getDemoPreview("customer");
  if (!preview) redirect("/browse");

  redirect("/dashboard?requested=sample");
}
