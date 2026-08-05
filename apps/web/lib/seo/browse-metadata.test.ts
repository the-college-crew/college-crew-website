import { describe, expect, it } from "vitest";

import { PILOT_SERVICE_AREA, SITE_URL } from "@/lib/site";

import { browseSeo, type BrowseSeoService } from "./browse-metadata";

const SERVICES: BrowseSeoService[] = [
  { name: "Hauling", slug: "hauling" },
  { name: "Pet care", slug: "pet-care" },
];

describe("browseSeo", () => {
  it("canonicalizes the unfiltered page to /browse", () => {
    const seo = browseSeo(SERVICES);

    expect(seo.canonical).toBe(`${SITE_URL}/browse`);
    expect(seo.title).toBe("Browse providers");
    expect(seo.description).toContain(PILOT_SERVICE_AREA.name);
  });

  it("keeps the service filter in the canonical", () => {
    expect(browseSeo(SERVICES, "hauling").canonical).toBe(
      `${SITE_URL}/browse?service=hauling`,
    );
  });

  it("never emits a sort param — the whole point of the canonical", () => {
    for (const slug of [undefined, "hauling", "pet-care", "nope"]) {
      expect(browseSeo(SERVICES, slug).canonical).not.toContain("sort");
    }
  });

  it("gives each service a distinct title and description", () => {
    const hauling = browseSeo(SERVICES, "hauling");
    const petCare = browseSeo(SERVICES, "pet-care");

    expect(hauling.title).toBe("Hauling providers");
    expect(petCare.title).toBe("Pet care providers");
    expect(hauling.description).not.toBe(petCare.description);
    expect(hauling.description).toContain("hauling");
    expect(petCare.description).toContain("pet care");
  });

  it("falls back to the unfiltered page for an unknown slug", () => {
    const unknown = browseSeo(SERVICES, "not-a-service");

    expect(unknown).toEqual(browseSeo(SERVICES));
  });

  it("does not crash when the service list is empty", () => {
    expect(browseSeo([], "hauling").canonical).toBe(`${SITE_URL}/browse`);
  });
});
