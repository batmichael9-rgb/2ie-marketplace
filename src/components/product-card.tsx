import Link from "next/link";
import { formatXof } from "@/lib/money";
import { CampusBadge } from "./campus-badge";
import { StockBadge } from "./stock-badge";
import { Stars } from "./stars";

export type ProductCardData = {
  id: string;
  slug: string;
  name: string;
  priceXof: number;
  stockMode: string;
  stockQty: number;
  lowStockThreshold: number;
  isReservable: boolean;
  images: { url: string }[];
  vendor: {
    shopName: string;
    slug: string;
    roomNumber: string | null;
    campus: string | null;
    isOpen: boolean;
  };
  rating: { average: number; count: number };
};

export function ProductCard({ product }: { product: ProductCardData }) {
  const image = product.images[0]?.url ?? "/produits/caracolo.svg";

  const outOfStock =
    product.stockMode === "OUT_OF_STOCK" ||
    (product.stockMode === "TRACKED" && product.stockQty <= 0);

  // Un seul statut sur la photo, du plus bloquant au moins : fermé, épuisé,
  // puis réservable. Le badge de stock détaillé reste sous le prix.
  const status = !product.vendor.isOpen
    ? { label: "Fermé", tone: "bg-red-600 text-white" }
    : outOfStock
      ? { label: "Épuisé", tone: "bg-slate-900/80 text-white" }
      : product.isReservable
        ? { label: "Réservable", tone: "bg-white/90 text-teal-800" }
        : null;

  return (
    <Link
      href={`/p/${product.slug}`}
      className="card group flex h-full w-full min-w-0 flex-col overflow-hidden transition-shadow hover:shadow-md"
    >
      <div className="relative w-full overflow-hidden bg-slate-100 dark:bg-slate-800">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image}
          alt={product.name}
          loading="lazy"
          className="aspect-[4/3] w-full object-cover object-center transition-transform duration-300 group-hover:scale-105"
        />
        {status ? (
          <div className="absolute inset-x-0 top-0 flex flex-wrap items-start gap-1 p-2">
            <span
              className={`badge px-2 py-0.5 text-[10px] leading-tight shadow-sm ${status.tone}`}
            >
              {status.label}
            </span>
          </div>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1 p-3">
        <h3 className="line-clamp-2 min-h-10 text-sm font-semibold leading-snug text-slate-900 dark:text-slate-100">
          {product.name}
        </h3>
        <p className="truncate text-xs text-slate-500 dark:text-slate-400">
          {product.vendor.shopName}
          {product.vendor.roomNumber ? ` · ${product.vendor.roomNumber}` : ""}
        </p>
        <CampusBadge
          campus={product.vendor.campus}
          className="max-w-full truncate self-start px-2 py-0.5 text-[10px] leading-tight"
        />

        <div className="mt-1 flex items-baseline gap-2">
          <span className="truncate text-sm font-bold text-slate-900 sm:text-base dark:text-slate-100">
            {formatXof(product.priceXof)}
          </span>
        </div>

        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-2">
          <StockBadge product={product} className="px-2 py-0.5 text-[10px] leading-tight" />
          {product.rating.count > 0 ? (
            <Stars
              value={product.rating.average}
              count={product.rating.count}
              size="text-[10px]"
            />
          ) : (
            <span className="badge px-2 py-0.5 text-[10px] leading-tight bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
              ★ Nouveau
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
