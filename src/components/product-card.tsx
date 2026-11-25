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

  return (
    <Link
      href={`/p/${product.slug}`}
      className="card group flex min-w-0 flex-col overflow-hidden transition-shadow hover:shadow-md"
    >
      <div className="relative w-full h-32 sm:h-40 overflow-hidden bg-slate-100 dark:bg-slate-800">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image}
          alt={product.name}
          loading="lazy"
          className="object-cover w-full h-full transition-transform duration-300 group-hover:scale-105"
        />
        {product.isReservable ? (
          <span className="badge absolute left-1.5 top-1.5 px-2 py-0.5 text-[10px] bg-white/90 text-teal-800 shadow-sm">
            Réservable
          </span>
        ) : null}
        {!product.vendor.isOpen ? (
          <span className="badge absolute right-1.5 top-1.5 bg-red-600 px-2 py-0.5 text-[10px] text-white shadow-sm">
            Fermé actuellement
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-3">
        <h3 className="line-clamp-2 min-h-10 text-sm font-semibold leading-snug text-slate-900 dark:text-slate-100">
          {product.name}
        </h3>
        <p className="truncate text-xs text-slate-500 dark:text-slate-400">
          {product.vendor.shopName}
          {product.vendor.roomNumber ? ` · ${product.vendor.roomNumber}` : ""}
        </p>
        <CampusBadge
          campus={product.vendor.campus}
          className="self-start px-2 py-0.5 text-[10px]"
        />

        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-sm font-bold text-slate-900 sm:text-base dark:text-slate-100">
            {formatXof(product.priceXof)}
          </span>
        </div>

        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-2">
          <StockBadge product={product} className="px-2 py-0.5 text-[10px]" />
          {product.rating.count > 0 ? (
            <Stars
              value={product.rating.average}
              count={product.rating.count}
              size="text-[10px]"
            />
          ) : (
            <span className="badge px-2 py-0.5 text-[10px] bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
              ★ Nouveau
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
