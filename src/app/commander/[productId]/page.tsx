import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CampusBadge } from "@/components/campus-badge";
import { IdempotencyField } from "@/components/idempotency-field";
import { StockBadge } from "@/components/stock-badge";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatXof } from "@/lib/money";
import { availableProviders } from "@/lib/payments";
import { createOrderAction } from "@/server/actions/checkout";

export const metadata: Metadata = { title: "Commander" };

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1 text-xs font-medium text-red-600">
      {message}
    </p>
  );
}

/** Relit les erreurs par champ passées dans l'URL après une validation refusée. */
function parseFieldErrors(raw?: string): Record<string, string> {
  if (!raw) return {};

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .filter(([, value]) => typeof value === "string" && value.length > 0)
        .map(([field, value]) => [field, value as string]),
    );
  } catch {
    return {};
  }
}

export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ productId: string }>;
  searchParams: Promise<{ erreur?: string; ref?: string; champs?: string }>;
}) {
  const { productId } = await params;
  const { erreur, ref, champs } = await searchParams;
  const fieldErrors = parseFieldErrors(champs);

  const product = await db.product.findUnique({
    where: { id: productId },
    include: {
      vendor: true,
      images: { orderBy: { position: "asc" }, take: 1 },
    },
  });

  if (!product || !product.isActive) notFound();

  const outOfStock =
    product.stockMode === "OUT_OF_STOCK" ||
    (product.stockMode === "TRACKED" && product.stockQty <= 0);

  if (outOfStock) redirect(`/p/${product.slug}`);

  const user = await getCurrentUser();
  // Paiement à la remise uniquement si le vendeur l'autorise ; le paiement en
  // ligne CinetPay reste proposé dès que le compte marchand est configuré.
  const providers = availableProviders().filter(
    (provider) => provider.id !== "CASH" || product.vendor.acceptsCashPayment,
  );

  const maxQuantity =
    product.stockMode === "TRACKED" ? Math.max(1, Math.min(product.stockQty, 20)) : 20;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link href={`/p/${product.slug}`} className="text-sm text-slate-500 hover:text-teal-700">
        ← Retour au produit
      </Link>

      <h1 className="text-2xl font-bold tracking-tight">
        {product.isReservable ? "Réserver" : "Commander"}
      </h1>

      {erreur ? (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{erreur}</p>
      ) : null}

      <div className="card flex items-center gap-3 p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={product.images[0]?.url ?? "/produits/caracolo.svg"}
          alt=""
          className="size-16 rounded-xl object-cover"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{product.name}</p>
          <p className="text-sm text-slate-500">{product.vendor.shopName}</p>
          <CampusBadge campus={product.vendor.campus} className="mt-1" />
          <StockBadge product={product} className="mt-1" />
        </div>
        <p className="shrink-0 font-bold">{formatXof(product.priceXof)}</p>
      </div>

      <form action={createOrderAction} className="card space-y-5 p-5">
        <input type="hidden" name="productId" value={product.id} />
        <input type="hidden" name="shareCode" value={ref ?? ""} />
        <IdempotencyField scope={product.id} />

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="quantity">
              Quantité
            </label>
            <select
              id="quantity"
              name="quantity"
              className="input"
              defaultValue="1"
              aria-invalid={fieldErrors.quantity ? true : undefined}
              aria-describedby={fieldErrors.quantity ? "quantity-error" : undefined}
            >
              {Array.from({ length: maxQuantity }, (_, index) => index + 1).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <FieldError id="quantity-error" message={fieldErrors.quantity} />
          </div>

          {product.isReservable ? (
            <div>
              <label className="label" htmlFor="pickupSlot">
                Créneau de retrait
              </label>
              <input
                id="pickupSlot"
                name="pickupSlot"
                className="input"
                placeholder="Ce soir entre 19h et 21h"
                defaultValue="Ce soir"
                aria-invalid={fieldErrors.pickupSlot ? true : undefined}
                aria-describedby={fieldErrors.pickupSlot ? "pickupSlot-error" : undefined}
              />
              <FieldError id="pickupSlot-error" message={fieldErrors.pickupSlot} />
            </div>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="buyerName">
              Nom complet
            </label>
            <input
              id="buyerName"
              name="buyerName"
              className="input"
              defaultValue={user?.fullName ?? ""}
              required
              autoComplete="name"
              aria-invalid={fieldErrors.buyerName ? true : undefined}
              aria-describedby={fieldErrors.buyerName ? "buyerName-error" : undefined}
            />
            <FieldError id="buyerName-error" message={fieldErrors.buyerName} />
          </div>
          <div>
            <label className="label" htmlFor="buyerPhone">
              Téléphone (WhatsApp de préférence)
            </label>
            <input
              id="buyerPhone"
              name="buyerPhone"
              className="input"
              defaultValue={user?.phone ?? ""}
              placeholder="+226 70 00 00 00"
              inputMode="tel"
              required
              autoComplete="tel"
              aria-invalid={fieldErrors.buyerPhone ? true : undefined}
              aria-describedby={fieldErrors.buyerPhone ? "buyerPhone-error" : undefined}
            />
            <FieldError id="buyerPhone-error" message={fieldErrors.buyerPhone} />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="buyerRoom">
            Chambre / point de livraison{" "}
            <span className="font-normal text-slate-400">(facultatif)</span>
          </label>
          <input
            id="buyerRoom"
            name="buyerRoom"
            className="input"
            defaultValue={user?.campusRoom ?? ""}
            placeholder="Bât. C, ch. 214"
            aria-invalid={fieldErrors.buyerRoom ? true : undefined}
            aria-describedby={fieldErrors.buyerRoom ? "buyerRoom-error" : undefined}
          />
          <FieldError id="buyerRoom-error" message={fieldErrors.buyerRoom} />
        </div>

        <div>
          <label className="label" htmlFor="note">
            Instruction pour le vendeur{" "}
            <span className="font-normal text-slate-400">(facultatif)</span>
          </label>
          <textarea
            id="note"
            name="note"
            rows={2}
            className="input"
            placeholder="Sans piment, appeler avant de monter..."
            aria-invalid={fieldErrors.note ? true : undefined}
            aria-describedby={fieldErrors.note ? "note-error" : undefined}
          />
          <FieldError id="note-error" message={fieldErrors.note} />
        </div>

        <fieldset>
          <legend className="label">Moyen de paiement</legend>
          <div className="space-y-2">
            {providers.map((provider, index) => (
              <label
                key={provider.id}
                className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-300 p-3 has-checked:border-teal-600 has-checked:bg-teal-50/60"
              >
                <input
                  type="radio"
                  name="provider"
                  value={provider.id}
                  defaultChecked={index === 0}
                  className="mt-1 size-4 accent-teal-700"
                />
                <span>
                  <span className="block text-sm font-semibold">{provider.label}</span>
                  <span className="block text-xs text-slate-600">{provider.description}</span>
                </span>
              </label>
            ))}
          </div>
          <FieldError id="provider-error" message={fieldErrors.provider} />
        </fieldset>

        <button type="submit" className="btn-primary w-full !py-3 text-base">
          {product.isReservable ? "Confirmer la réservation" : "Confirmer la commande"}
        </button>

        <p className="text-center text-xs text-slate-500">
          Le stock est réservé dès la confirmation. Aucun débit n&apos;a lieu avant validation du
          paiement.
        </p>
      </form>
    </div>
  );
}
