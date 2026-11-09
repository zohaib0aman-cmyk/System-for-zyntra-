"use client";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="card mx-auto mt-10 max-w-sm p-6 text-center">
      <h1 className="text-lg font-bold">Something went wrong</h1>
      <p className="mt-2 break-words text-sm text-slate-500">{error.message || "Unexpected error."}</p>
      <button onClick={reset} className="btn-primary mt-5">Try again</button>
    </div>
  );
}
