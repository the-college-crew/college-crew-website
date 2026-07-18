"use server";

import { redirect } from "next/navigation";

import { getDemoPreview } from "@/lib/demo/sample-preview";

export async function confirmDemoPayment() {
  const preview = await getDemoPreview("customer");
  if (!preview) redirect("/dashboard");

  redirect("/dashboard?paid=sample");
}
