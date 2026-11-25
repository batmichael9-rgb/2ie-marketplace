import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CampusBadge } from "@/components/campus-badge";
import { IdempotencyField } from "@/components/idempotency-field";
import { StockBadge } from "@/components/stock-badge";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatXof, getMinOrderQuantity } from "@/lib/money";
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
  // Paiement en ligne uniquement : l'acheteur choisit son propre opérateur et
  // saisit son propre numéro. Il n'a jamais à connaître le compte du vendeur.
  const onlinePaymentReady = Boolean(process.env.MONEYFUSION_PRIVATE_KEY);

  const maxQuantity =
    product.stockMode === "TRACKED" ? Math.max(1, Math.min(product.stockQty, 20)) : 20;
  // Quantité minimum imposée par le seuil de reversement Mobile Money.
  const minQuantity = getMinOrderQuantity(product.priceXof);
  const startQuantity = Math.min(minQuantity, maxQuantity);

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
          <p className="text-xs font-medium text-teal-700">Vendeur vérifié 2iE</p>
          <CampusBadge campus={product.vendor.campus} className="mt-1" />
          <StockBadge product={product} className="mt-1" />
          {product.vendor.orangeMoneyNumber ? (
            <p className="mt-1 inline-flex rounded-full bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-800">
              ✓ Versement vendeur configuré (Orange Money vérifié)
            </p>
          ) : null}
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
              defaultValue={startQuantity}
              aria-invalid={fieldErrors.quantity ? true : undefined}
              aria-describedby={fieldErrors.quantity ? "quantity-error" : undefined}
            >
              {Array.from(
                { length: Math.max(0, maxQuantity - startQuantity + 1) },
                (_, index) => startQuantity + index,
              ).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            {minQuantity > 1 ? (
              <p className="mt-1 text-xs font-medium text-teal-800 dark:text-teal-400">
                Minimum {minQuantity} unités par commande (seuil Mobile Money & livraison campus).
              </p>
            ) : null}
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
              Numéro à débiter
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
            <p className="mt-1 text-xs text-slate-500">
              Ton propre numéro Orange Money, Moov Money ou Wave. Aucun numéro du vendeur n&apos;est
              demandé.
            </p>
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

        <input type="hidden" name="provider" value="MONEYFUSION" />

        <fieldset>
          <legend className="label">Mon moyen de paiement</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              { value: "ORANGE_MONEY", label: "Orange Money" },
              { value: "MOOV_MONEY", label: "Moov Money" },
              { value: "WAVE", label: "Wave" },
              { value: "CARD", label: "Carte bancaire Visa / Mastercard" },
            ].map((option, index) => (
              <label
                key={option.value}
                className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-300 p-3 has-checked:border-teal-600 has-checked:bg-teal-50/60"
              >
                <input
                  type="radio"
                  name="operator"
                  value={option.value}
                  defaultChecked={index === 0}
                  className="size-4 accent-teal-700"
                />
                <span className="text-sm font-semibold">{option.label}</span>
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Tu recevras une demande de confirmation de ton opérateur sur ton téléphone.
          </p>
          <FieldError id="operator-error" message={fieldErrors.operator} />
          <FieldError id="provider-error" message={fieldErrors.provider} />
        </fieldset>

        <button
          type="submit"
          disabled={!onlinePaymentReady}
          className="btn-primary w-full !py-3 text-base disabled:cursor-not-allowed disabled:opacity-50"
        >
          Payer {formatXof(product.priceXof)} maintenant
        </button>

        {!onlinePaymentReady ? (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-center text-xs text-amber-900">
            Le paiement en ligne est momentanément indisponible. Réessaie dans quelques minutes.
          </p>
        ) : (
          <p className="text-center text-xs text-slate-500">
            Le stock est réservé dès la confirmation. Aucun débit n&apos;a lieu avant validation du
            paiement.
          </p>
        )}
      </form>
    </div>
  );
}
