import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-12">
      <Link
        href="/"
        className="mb-6 font-display text-2xl font-bold uppercase tracking-wide"
      >
        <span className="text-ink">College</span>{" "}
        <span className="text-crew-600">Crew</span>
      </Link>
      <div className="pennant w-full max-w-md overflow-hidden rounded-xl border border-line bg-paper p-6 shadow-sm sm:p-8">
        {children}
      </div>
    </main>
  );
}
