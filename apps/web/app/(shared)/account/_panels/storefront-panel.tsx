import type { ProviderProfile } from "@/lib/db/types";
import { providerAvatarUrl } from "@/lib/media/provider-avatars";
import { toBannerStyle } from "@/lib/media/provider-banners";

import { Section } from "../_components/section";
import { AvatarUploadForm } from "../avatar-upload-form";
import { BannerUploadForm } from "../banner-upload-form";
import { ProviderProfileForm } from "../provider-settings-forms";

export function StorefrontPanel({
  providerProfile,
}: {
  providerProfile: ProviderProfile;
}) {
  return (
    <>
      <Section
        title="Profile photo"
        description="Your public headshot on Browse and your profile. Required to stay visible to neighbors."
      >
        <AvatarUploadForm
          userId={providerProfile.user_id}
          imageUrl={providerAvatarUrl(providerProfile.avatar_image_path)}
          focalX={providerProfile.avatar_focal_x}
          focalY={providerProfile.avatar_focal_y}
        />
      </Section>

      <Section
        title="Profile banner"
        description="The wide banner behind your headshot on Browse and your profile. Pick a theme or upload your own photo."
      >
        <BannerUploadForm
          userId={providerProfile.user_id}
          imagePath={providerProfile.banner_image_path}
          activeStyle={toBannerStyle(providerProfile.banner_style)}
          focalX={providerProfile.banner_focal_x}
          focalY={providerProfile.banner_focal_y}
        />
      </Section>

      <Section
        title="Public profile"
        description="What neighbors see on Browse and your profile page."
      >
        <ProviderProfileForm profile={providerProfile} />
      </Section>
    </>
  );
}
