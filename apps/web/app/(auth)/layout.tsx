import { Wordmark } from "@/components/site-header";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main id="main" className="flex flex-1 flex-col items-center justify-center bg-shell px-4 py-12">
      <div className="mb-6">
        <Wordmark />
      </div>
      <div className="pennant w-full max-w-md overflow-hidden rounded-2xl border border-stone bg-paper p-6 shadow-sm shadow-viridian/5 sm:p-8">
        {children}
      </div>
    </main>
  );
}
