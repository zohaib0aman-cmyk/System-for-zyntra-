import { initials } from "@/lib/normalize";

const PALETTE = [
  "bg-indigo-100 text-indigo-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-800",
  "bg-rose-100 text-rose-700",
  "bg-sky-100 text-sky-700",
  "bg-violet-100 text-violet-700",
];

function colorFor(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export function LeadAvatar({
  name,
  logoUrl,
  size = "md",
}: {
  name: string;
  logoUrl: string | null;
  size?: "md" | "xl";
}) {
  const dims = size === "xl" ? "h-24 w-24 text-3xl rounded-2xl" : "h-12 w-12 text-base rounded-xl";
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={logoUrl} alt={`${name} logo`} className={`${dims} shrink-0 border border-slate-200 bg-white object-contain p-0.5`} />
    );
  }
  return (
    <div aria-hidden="true" className={`${dims} ${colorFor(name)} flex shrink-0 items-center justify-center font-bold`}>
      {initials(name)}
    </div>
  );
}
