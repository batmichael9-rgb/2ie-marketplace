import Link from "next/link";
import { MapPin, Store } from "lucide-react";
import { campusBadgeLabel } from "@/lib/domain";

export type ShopCardData = {
  slug: string;
  shopName: string;
  description: string | null;
  bannerUrl: string | null;
  logoUrl: string | null;
  campus: string | null;
  roomNumber: string | null;
  isOpen: boolean;
  ratingAvg: number;
  ratingCount: number;
  productCount: number;
};

/** Carte de l'onglet « Boutiques » : vitrine d'un commerçant du campus. */
export function ShopCard({ shop }: { shop: ShopCardData }) {
  const visual = shop.bannerUrl || shop.logoUrl || null;
  const campus = campusBadgeLabel(shop.campus);

  return (
    <Link
      href={`/boutique/${shop.slug}`}
      className="card group flex h-full w-full min-w-0 flex-col overflow-hidden transition-shadow hover:shadow-md"
    >
      <div className="relative w-full overflow-hidden bg-slate-100 dark:bg-slate-800">
        {visual ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={visual}
            alt={shop.shopName}
            loading="lazy"
            className="aspect-[16/9] w-full object-cover object-center transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="grid aspect-[16/9] w-full place-items-center bg-teal-50 text-teal-700 dark:bg-slate-800 dark:text-teal-300">
            <Store className="size-8" aria-hidden />
          </div>
        )}
        <div className="absolute inset-x-0 top-0 flex flex-wrap items-start gap-1 p-2">
          <span
            className={`badge px-2 py-0.5 text-[10px] leading-tight shadow-sm ${
              shop.isOpen ? "bg-white/90 text-teal-800" : "bg-red-600 text-white"
            }`}
          >
            {shop.isOpen ? "Ouverte" : "Fermée"}
          </span>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1 p-3">
        <h3 className="line-clamp-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
          {shop.shopName}
        </h3>
        <p className="truncate text-xs text-slate-500 dark:text-slate-400">
          {shop.productCount} produit{shop.productCount > 1 ? "s" : ""} en ligne
          {shop.ratingCount > 0 ? ` · ★ ${shop.ratingAvg.toFixed(1)} (${shop.ratingCount})` : ""}
        </p>
        {shop.description ? (
          <p className="line-clamp-2 text-xs text-slate-600 dark:text-slate-300">
            {shop.description}
          </p>
        ) : null}
        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-2">
          {campus ? (
            <span className="badge max-w-full truncate bg-teal-50 px-2 py-0.5 text-[10px] leading-tight text-teal-800">
              <MapPin className="size-3 shrink-0" aria-hidden />
              {campus}
            </span>
          ) : null}
          {shop.roomNumber ? (
            <span className="badge max-w-full truncate bg-slate-100 px-2 py-0.5 text-[10px] leading-tight text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {shop.roomNumber}
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
