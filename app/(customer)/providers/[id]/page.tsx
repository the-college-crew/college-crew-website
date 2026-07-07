import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Provider profile" };

export default function ProviderProfilePage() {
  redirect("/browse");
}
