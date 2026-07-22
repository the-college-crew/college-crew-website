import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "../../lib/db/types";

/**
 * Verifies the draggable avatar/banner focal-point feature end-to-end: drag
 * updates the live preview, "Save position" persists it, a reload reflects
 * the saved value, and the public Browse card / profile page render the same
 * repositioned crop. TEMPORARY verification script for this feature -- not
 * part of the standing suite.
 */

const password = "Synthetic-FocalPoint9!Pass";
const runId = randomUUID().slice(0, 8);
const providerEmail = `focal-point-${runId}@example.test`;
const providerProfileId = randomUUID();
const serviceId = randomUUID();
const offeringId = randomUUID();

const AVATAR_BUCKET = "provider-avatars";
const BANNER_BUCKET = "provider-banners";

const admin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

let providerUserId: string;
let avatarPath: string;
let bannerPath: string;

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

function objectPositionOf(style: string | null): [number, number] {
  const match = /object-position:\s*([\d.]+)%\s+([\d.]+)%/.exec(style ?? "");
  if (!match) throw new Error(`No object-position in style: ${style}`);
  return [Number(match[1]), Number(match[2])];
}

// The repositioner ignores drags until its <img> has fired onLoad. A save
// triggers revalidatePath("/account"), which can remount sibling images
// (e.g. the banner while dragging the avatar) -- wait for the real DOM
// image to finish loading before starting a drag on it.
async function waitForImageLoaded(img: ReturnType<Page["locator"]>) {
  await img.evaluate(
    (el) =>
      new Promise<void>((resolve) => {
        const image = el as HTMLImageElement;
        if (image.complete && image.naturalWidth > 0) return resolve();
        image.addEventListener("load", () => resolve(), { once: true });
      }),
  );
}

test.beforeAll(async () => {
  const { data, error } = await admin.auth.admin.createUser({
    email: providerEmail,
    password,
    email_confirm: true,
    user_metadata: { role: "customer", full_name: "Focal Point Tester" },
  });
  if (error || !data.user) throw error ?? new Error("Synthetic user missing.");
  providerUserId = data.user.id;

  avatarPath = `${providerUserId}/e2e-avatar.jpg`;
  bannerPath = `${providerUserId}/e2e-banner.jpg`;
  const avatarFile = readFileSync(
    path.join(__dirname, "../../public/about/zach.jpg"),
  );
  const bannerFile = readFileSync(
    path.join(__dirname, "../../public/blog/chicago-skyline.jpg"),
  );

  const [avatarUpload, bannerUpload] = await Promise.all([
    admin.storage
      .from(AVATAR_BUCKET)
      .upload(avatarPath, avatarFile, { contentType: "image/jpeg" }),
    admin.storage
      .from(BANNER_BUCKET)
      .upload(bannerPath, bannerFile, { contentType: "image/jpeg" }),
  ]);
  if (avatarUpload.error) throw avatarUpload.error;
  if (bannerUpload.error) throw bannerUpload.error;

  const { error: providerError } = await admin.from("provider_profiles").insert({
    id: providerProfileId,
    user_id: providerUserId,
    display_name: "Focal Point Tester",
    bio: "Synthetic provider for focal-point verification.",
    avatar_image_path: avatarPath,
    banner_image_path: bannerPath,
    verification_status: "approved",
    stripe_account_id: "acct_e2e_focal_point",
    stripe_transfers_active: true,
    stripe_transfers_checked_at: new Date().toISOString(),
    service_zip: "60614",
    minimum_notice_hours: 3,
  });
  if (providerError) throw providerError;

  const { error: serviceError } = await admin.from("services").insert({
    id: serviceId,
    name: "Synthetic Focal Point Service",
    slug: `synthetic-focal-point-${runId}`,
    category: "Test",
    is_live: true,
  });
  if (serviceError) throw serviceError;

  const { error: offeringError } = await admin.from("provider_services").insert({
    id: offeringId,
    provider_id: providerProfileId,
    service_id: serviceId,
    price_cents: 0,
    price_type: "quote",
    unit: "per_hour",
    hourly_rate_cents: 5000,
  });
  if (offeringError) throw offeringError;
});

test.afterAll(async () => {
  await admin.from("provider_services").delete().eq("service_id", serviceId);
  await admin.from("services").delete().eq("id", serviceId);
  await admin.from("provider_profiles").delete().eq("id", providerProfileId);

  // The upload-through-the-UI test replaces both photos with a fresh
  // browser-generated UUID name, so sweep the whole user folder rather than
  // tracking the exact new path.
  for (const bucket of [AVATAR_BUCKET, BANNER_BUCKET]) {
    const { data: objects } = await admin.storage.from(bucket).list(providerUserId);
    const paths = (objects ?? []).map((o) => `${providerUserId}/${o.name}`);
    if (paths.length) await admin.storage.from(bucket).remove(paths);
  }
  await admin.auth.admin.deleteUser(providerUserId);
});

test("drag-to-reposition avatar and banner persists and renders everywhere", async ({
  page,
}) => {
  await login(page, providerEmail);
  await page.goto("/account");

  const repositioners = page.locator(".touch-none.select-none");
  const avatarFrame = repositioners.nth(0);
  const bannerFrame = repositioners.nth(1);
  await expect(avatarFrame).toBeVisible();
  await expect(bannerFrame).toBeVisible();

  // Sanity: fresh upload starts centered.
  const avatarImgBefore = avatarFrame.locator("img");
  expect(objectPositionOf(await avatarImgBefore.getAttribute("style"))).toEqual([
    50, 50,
  ]);

  // --- Avatar: drag, verify live preview, save, verify persistence -------
  await avatarFrame.scrollIntoViewIfNeeded();
  await waitForImageLoaded(avatarImgBefore);
  const avatarBox = await avatarFrame.boundingBox();
  if (!avatarBox) throw new Error("Avatar frame not visible.");
  const avatarCenterX = avatarBox.x + avatarBox.width / 2;
  const avatarCenterY = avatarBox.y + avatarBox.height / 2;

  await page.mouse.move(avatarCenterX, avatarCenterY);
  await page.mouse.down();
  await page.mouse.move(avatarCenterX, avatarCenterY - 15, { steps: 8 });
  await page.mouse.up();

  const [, avatarYAfterDrag] = objectPositionOf(
    await avatarImgBefore.getAttribute("style"),
  );
  expect(avatarYAfterDrag).not.toBe(50);

  // Frame -> "h-20 w-20" wrapper -> "flex gap-4" row that also holds the
  // save-position form as a sibling.
  await avatarFrame
    .locator("../..")
    .getByRole("button", { name: "Save position" })
    .click();

  let afterAvatarSave: { avatar_focal_x: number; avatar_focal_y: number } | null = null;
  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from("provider_profiles")
          .select("avatar_focal_x, avatar_focal_y")
          .eq("id", providerProfileId)
          .single();
        afterAvatarSave = data;
        return data?.avatar_focal_y ?? 50;
      },
      { timeout: 10_000 },
    )
    .not.toBe(50);
  expect(afterAvatarSave!.avatar_focal_y).toBeCloseTo(avatarYAfterDrag, 0);

  // --- Banner: same flow -------------------------------------------------
  const bannerImgBefore = bannerFrame.locator("img");
  await bannerFrame.scrollIntoViewIfNeeded();
  await waitForImageLoaded(bannerImgBefore);
  const bannerBox = await bannerFrame.boundingBox();
  if (!bannerBox) throw new Error("Banner frame not visible.");
  const bannerCenterX = bannerBox.x + bannerBox.width / 2;
  const bannerCenterY = bannerBox.y + bannerBox.height / 2;

  await page.mouse.move(bannerCenterX, bannerCenterY);
  await page.mouse.down();
  await page.mouse.move(bannerCenterX, bannerCenterY - 15, { steps: 8 });
  await page.mouse.up();

  const [, bannerYAfterDrag] = objectPositionOf(
    await bannerImgBefore.getAttribute("style"),
  );
  expect(bannerYAfterDrag).not.toBe(50);

  // Frame -> "space-y-2" wrapper that also holds the save-position form as
  // a sibling.
  await bannerFrame
    .locator("..")
    .getByRole("button", { name: "Save position" })
    .click();

  let afterBannerSave: { banner_focal_x: number; banner_focal_y: number } | null = null;
  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from("provider_profiles")
          .select("banner_focal_x, banner_focal_y")
          .eq("id", providerProfileId)
          .single();
        afterBannerSave = data;
        return data?.banner_focal_y ?? 50;
      },
      { timeout: 10_000 },
    )
    .not.toBe(50);
  expect(afterBannerSave!.banner_focal_y).toBeCloseTo(bannerYAfterDrag, 0);

  // --- Reload: server-rendered preview reflects the saved position -------
  await page.reload();
  const reloadedAvatarStyle = await page
    .locator(".touch-none.select-none")
    .nth(0)
    .locator("img")
    .getAttribute("style");
  const [, reloadedAvatarY] = objectPositionOf(reloadedAvatarStyle);
  expect(reloadedAvatarY).toBeCloseTo(afterAvatarSave!.avatar_focal_y, 0);

  // --- Public render sites: Browse card and profile page -----------------
  await page.goto(`/browse?service=synthetic-focal-point-${runId}`);
  const browseAvatar = page.locator('img[alt=""][src*="provider-avatars"]').first();
  await expect(browseAvatar).toBeVisible();
  const [, browseAvatarY] = objectPositionOf(await browseAvatar.getAttribute("style"));
  expect(browseAvatarY).toBeCloseTo(afterAvatarSave!.avatar_focal_y, 0);

  await page.goto(`/providers/${providerProfileId}`);
  const profileAvatar = page.locator('img[alt=""][src*="provider-avatars"]').first();
  await expect(profileAvatar).toBeVisible();
  const [, profileAvatarY] = objectPositionOf(
    await profileAvatar.getAttribute("style"),
  );
  expect(profileAvatarY).toBeCloseTo(afterAvatarSave!.avatar_focal_y, 0);

  const profileBanner = page.locator('img[alt=""][src*="provider-banners"]').first();
  await expect(profileBanner).toBeVisible();
  const [, profileBannerY] = objectPositionOf(
    await profileBanner.getAttribute("style"),
  );
  expect(profileBannerY).toBeCloseTo(afterBannerSave!.banner_focal_y, 0);
});

// Runs after the drag test above, so this provider already has a non-center
// saved focal point on both photos -- exercises the actual browser-direct
// upload flow (choose file -> upload straight to Storage -> Server Action
// records the key) end to end with the reset-on-upload + reposition logic
// layered on top of it, rather than seeding storage via the admin fixture.
test("replacing a photo through the real upload UI resets its focal point, and it's immediately draggable again", async ({
  page,
}) => {
  await login(page, providerEmail);
  await page.goto("/account");

  const repositioners = page.locator(".touch-none.select-none");
  const avatarFrame = repositioners.nth(0);
  const bannerFrame = repositioners.nth(1);
  await expect(avatarFrame).toBeVisible();
  await expect(bannerFrame).toBeVisible();

  // Sanity: coming into this test, the previous test's drag+save left both
  // photos off-center.
  const [, avatarYBefore] = objectPositionOf(
    await avatarFrame.locator("img").getAttribute("style"),
  );
  expect(avatarYBefore).not.toBe(50);

  // --- Avatar: real upload through the file input + "Replace photo" ------
  // Scoped to the file input's own <form>: page-wide, "Replace photo" also
  // matches the file input itself (implicit button role, name from its
  // <label>) AND the banner form's identically-labeled submit button.
  const newAvatarFile = path.join(__dirname, "../../public/about/gianna.jpg");
  const avatarUploadForm = page.locator("#provider-avatar").locator("../..");
  await avatarUploadForm.locator("#provider-avatar").setInputFiles(newAvatarFile);
  await avatarUploadForm
    .getByRole("button", { name: "Replace photo" })
    .last()
    .click();
  await expect(page.getByText("Profile photo saved.")).toBeVisible({
    timeout: 15_000,
  });

  let afterAvatarUpload: { avatar_focal_x: number; avatar_focal_y: number } | null =
    null;
  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from("provider_profiles")
          .select("avatar_focal_x, avatar_focal_y")
          .eq("id", providerProfileId)
          .single();
        afterAvatarUpload = data;
        return data?.avatar_focal_y ?? -1;
      },
      { timeout: 10_000 },
    )
    .toBe(50);
  expect(afterAvatarUpload!.avatar_focal_x).toBe(50);

  // The new object's <img> reflects the reset without a manual reload. The
  // DB write is already confirmed above; the client still needs a moment to
  // receive the revalidated props and re-render, so poll rather than assume
  // it's landed the instant the "saved" toast appears (that toast comes from
  // local state set off the action's own return value, not the revalidated
  // RSC payload).
  const newAvatarImg = repositioners.nth(0).locator("img");
  await waitForImageLoaded(newAvatarImg);
  await expect
    .poll(async () => objectPositionOf(await newAvatarImg.getAttribute("style")), {
      timeout: 10_000,
    })
    .toEqual([50, 50]);
  // The style update (from revalidated props) can land before the <img>'s
  // src has actually swapped to the new object and finished loading -- the
  // repositioner ignores drags until ITS onLoad fires, so wait again here,
  // now that the swap has had a chance to start.
  await waitForImageLoaded(newAvatarImg);

  // It's draggable right away -- not stuck until a reload.
  const freshAvatarFrame = repositioners.nth(0);
  await freshAvatarFrame.scrollIntoViewIfNeeded();
  const freshAvatarBox = await freshAvatarFrame.boundingBox();
  if (!freshAvatarBox) throw new Error("Avatar frame not visible.");
  const freshAvatarCenterX = freshAvatarBox.x + freshAvatarBox.width / 2;
  const freshAvatarCenterY = freshAvatarBox.y + freshAvatarBox.height / 2;

  await page.mouse.move(freshAvatarCenterX, freshAvatarCenterY);
  await page.mouse.down();
  await page.mouse.move(freshAvatarCenterX, freshAvatarCenterY - 15, { steps: 8 });
  await page.mouse.up();

  const [, avatarYAfterFreshDrag] = objectPositionOf(
    await newAvatarImg.getAttribute("style"),
  );
  expect(avatarYAfterFreshDrag).not.toBe(50);

  await freshAvatarFrame
    .locator("../..")
    .getByRole("button", { name: "Save position" })
    .click();
  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from("provider_profiles")
          .select("avatar_focal_y")
          .eq("id", providerProfileId)
          .single();
        return data?.avatar_focal_y ?? 50;
      },
      { timeout: 10_000 },
    )
    .not.toBe(50);

  // --- Banner: same flow ---------------------------------------------------
  const newBannerFile = path.join(
    __dirname,
    "../../public/blog/evening-dog-walk.jpg",
  );
  const bannerUploadForm = page.locator("#provider-banner").locator("../..");
  await bannerUploadForm.locator("#provider-banner").setInputFiles(newBannerFile);
  await bannerUploadForm
    .getByRole("button", { name: "Replace photo" })
    .last()
    .click();
  await expect(page.getByText("Banner photo saved.")).toBeVisible({
    timeout: 15_000,
  });

  let afterBannerUpload: { banner_focal_x: number; banner_focal_y: number } | null =
    null;
  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from("provider_profiles")
          .select("banner_focal_x, banner_focal_y")
          .eq("id", providerProfileId)
          .single();
        afterBannerUpload = data;
        return data?.banner_focal_y ?? -1;
      },
      { timeout: 10_000 },
    )
    .toBe(50);
  expect(afterBannerUpload!.banner_focal_x).toBe(50);

  const freshBannerFrame = repositioners.nth(1);
  const newBannerImg = freshBannerFrame.locator("img");
  await waitForImageLoaded(newBannerImg);
  await expect
    .poll(async () => objectPositionOf(await newBannerImg.getAttribute("style")), {
      timeout: 10_000,
    })
    .toEqual([50, 50]);
  await waitForImageLoaded(newBannerImg);

  await freshBannerFrame.scrollIntoViewIfNeeded();
  const freshBannerBox = await freshBannerFrame.boundingBox();
  if (!freshBannerBox) throw new Error("Banner frame not visible.");
  const freshBannerCenterX = freshBannerBox.x + freshBannerBox.width / 2;
  const freshBannerCenterY = freshBannerBox.y + freshBannerBox.height / 2;

  await page.mouse.move(freshBannerCenterX, freshBannerCenterY);
  await page.mouse.down();
  await page.mouse.move(freshBannerCenterX, freshBannerCenterY - 15, { steps: 8 });
  await page.mouse.up();

  const [, bannerYAfterFreshDrag] = objectPositionOf(
    await newBannerImg.getAttribute("style"),
  );
  expect(bannerYAfterFreshDrag).not.toBe(50);

  await freshBannerFrame
    .locator("..")
    .getByRole("button", { name: "Save position" })
    .click();
  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from("provider_profiles")
          .select("banner_focal_y")
          .eq("id", providerProfileId)
          .single();
        return data?.banner_focal_y ?? 50;
      },
      { timeout: 10_000 },
    )
    .not.toBe(50);
});
