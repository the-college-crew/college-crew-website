import { notFound } from "next/navigation";

import { ProviderModal } from "@/components/provider-modal";
import { ProviderProfile } from "@/components/provider-profile";
import { getPublicProviderProfile } from "@/lib/db/queries";

export default async function ProviderProfileModalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const provider = await getPublicProviderProfile(id);
  if (!provider) notFound();

  return (
    <ProviderModal>
      <ProviderProfile provider={provider} />
    </ProviderModal>
  );
}
