export function SamplePreviewBanner({
  role,
  children,
}: {
  role: "customer" | "provider";
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-gold-400/70 bg-gold-100 p-4 text-sm text-gold-800">
      <p className="font-semibold">
        Sample {role} preview (founder/admin only)
      </p>
      <p className="mt-1">
        This screen uses fake data so you can inspect the flow. Buttons shown
        here are disabled or route through demo-only actions; nothing is saved,
        sent, charged, accepted, cancelled, or changed in Supabase.
      </p>
      {children ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}
