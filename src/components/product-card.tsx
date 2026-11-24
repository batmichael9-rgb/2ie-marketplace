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
  };
  rating: { average: number; count: number };
};

export function ProductCard({ product }: { product: ProductCardData }) {
  const image = product.images[0]?.url ?? "/produits/caracolo.svg";

  return (
    <Link
      href={`/p/${product.slug}`}
      className="card group flex flex-col overflow-hidden transition-shadow hover:shadow-md"
    >
      <div className="relative aspect-square overflow-hidden bg-slate-100 dark:bg-slate-800">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image}
          alt={product.name}
          loading="lazy"
          className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        {product.isReservable ? (
          <span className="badge absolute left-2 top-2 bg-white/90 text-teal-800 shadow-sm">
            Réservable
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-3">
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-slate-900 dark:text-slate-100">
          {product.name}
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {product.vendor.shopName}
          {product.vendor.roomNumber ? ` · ${product.vendor.roomNumber}` : ""}
        </p>
        <CampusBadge campus={product.vendor.campus} className="self-start" />

        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-base font-bold text-slate-900 dark:text-slate-100">
            {formatXof(product.priceXof)}
          </span>
        </div>

        <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
          <StockBadge product={product} />
          {product.rating.count > 0 ? (
            <Stars value={product.rating.average} count={product.rating.count} size="text-xs" />
          ) : (
            <span className="badge bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
              ★ Nouveau
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
