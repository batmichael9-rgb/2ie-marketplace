import { stockBadge } from "@/lib/domain";

export function StockBadge({
  product,
  className = "",
}: {
  product: { stockMode: string; stockQty: number; lowStockThreshold: number };
  className?: string;
}) {
  const badge = stockBadge(product);
  if (!badge) return null;

  const tones = {
    ok: "bg-teal-50 text-teal-700",
    warning: "bg-amber-100 text-amber-800",
    danger: "bg-red-100 text-red-700",
  } as const;

  return (
    <span className={`badge ${tones[badge.tone]} ${className}`}>
      {badge.tone !== "ok" ? <span aria-hidden>●</span> : null}
      {badge.label}
    </span>
  );
}
