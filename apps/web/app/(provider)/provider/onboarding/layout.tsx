export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-xl">
      <p className="font-display text-sm font-semibold text-quad-600">
        Become a provider
      </p>
      <h1 className="mt-1 font-display text-3xl font-semibold">
        Join the crew
      </h1>
      <div className="mt-6">{children}</div>
    </div>
  );
}
