import Link from "next/link";
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60dvh] max-w-sm flex-col items-center justify-center px-4 text-center">
      <p className="font-mono text-sm text-brand-700">404</p>
      <h1 className="mt-1 text-xl font-bold">Lead not found</h1>
      <p className="mt-2 text-sm text-slate-500">Check the tracking ID and try again.</p>
      <Link href="/" className="btn-primary mt-6">Back to leads</Link>
    </main>
  );
}
