import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { isInstitutionalEmail } from "@/lib/domain";
import { logoutAction } from "@/server/actions/auth";
import { createVendorProfileAction } from "@/server/actions/vendor";

export const metadata: Metadata = { title: "Ouvrir ma boutique" };

export default async function CreateVendorPage({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string }>;
}) {
  const user = await requireUser("/espace-vendeur/creer");
  if (user.vendor) redirect("/espace-vendeur");

  const { erreur } = await searchParams;
  const canSell = isInstitutionalEmail(user.email);

  return (
    <div className="mx-auto max-w-xl space-y-5 py-2">
      <div>
        <Link href="/" className="text-sm text-slate-500 hover:text-teal-700">
          ← Retour au catalogue
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Ouvrir ma boutique</h1>
        <p className="mt-1 text-sm text-slate-600">
          Ta boutique est visible par tous les étudiants du campus. Tu pourras ajouter tes produits
          juste après.
        </p>
      </div>

      {erreur ? (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{erreur}</p>
      ) : null}

      {!canSell ? (
        <div className="card space-y-3 border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <p className="font-semibold">Vente réservée aux adresses @2ie-edu.org</p>
          <p>
            Pour ouvrir une boutique, tu dois être connecté avec une adresse qui se termine par{" "}
            <strong>@2ie-edu.org</strong>. Format requis :{" "}
            <strong>prenom.nom@2ie-edu.org</strong>. Les autres extensions, y compris @2ie.bf, sont
            refusées. Ton compte utilise actuellement{" "}
            <strong>{user.email ?? "aucune adresse email"}</strong>.
          </p>
          <p>
            Déconnecte-toi puis reconnecte-toi avec ton adresse 2iE pour vendre. Les achats, eux,
            restent possibles avec n&apos;importe quel email.
          </p>
          <form action={logoutAction}>
            <button type="submit" className="btn-secondary !py-2 !text-xs">
              Changer de compte
            </button>
          </form>
        </div>
      ) : null}

      {canSell ? (
      <form action={createVendorProfileAction} className="card space-y-5 p-5">
        <div>
          <label className="label" htmlFor="shopName">
            Nom de la boutique
          </label>
          <input
            id="shopName"
            name="shopName"
            className="input"
            placeholder="Chez Fatou"
            maxLength={60}
            required
          />
        </div>

        <div>
          <label className="label" htmlFor="description">
            Description <span className="font-normal text-slate-400">(facultatif)</span>
          </label>
          <textarea
            id="description"
            name="description"
            rows={3}
            className="input"
            maxLength={500}
            placeholder="Ce que tu vends, tes horaires, comment te joindre..."
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="roomNumber">
              Chambre / point de retrait{" "}
              <span className="font-normal text-slate-400">(facultatif)</span>
            </label>
            <input
              id="roomNumber"
              name="roomNumber"
              className="input"
              maxLength={30}
              placeholder="Bât. B, ch. 214"
            />
          </div>

          <div>
            <label className="label" htmlFor="momoOperator">
              Opérateur Mobile Money
            </label>
            <select id="momoOperator" name="momoOperator" className="input" defaultValue="">
              <option value="">Aucun / plus tard</option>
              <option value="ORANGE_MONEY">Orange Money</option>
              <option value="MOOV_MONEY">Moov Money</option>
            </select>
          </div>
        </div>

        <div>
          <label className="label" htmlFor="momoNumber">
            Numéro Mobile Money{" "}
            <span className="font-normal text-slate-400">(facultatif)</span>
          </label>
          <input
            id="momoNumber"
            name="momoNumber"
            className="input"
            inputMode="tel"
            placeholder="+226 70 00 00 00"
          />
          <p className="mt-1 text-xs text-slate-500">
            Affiché aux clients pour le paiement direct à la remise.
          </p>
        </div>

        <div>
          <label className="label" htmlFor="vendorEmail">
            Email du commerçant
          </label>
          <input
            id="vendorEmail"
            value={user.email ?? ""}
            readOnly
            className="input bg-slate-50 text-slate-600"
            aria-describedby="vendorEmailHelp"
          />
          <p id="vendorEmailHelp" className="mt-1 text-xs leading-relaxed text-slate-600">
            <strong>Format requis : prenom.nom@2ie-edu.org</strong> — les adresses @2ie.bf ou
            personnelles ne permettent pas de vendre.
          </p>
        </div>

        <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Tu ouvres la boutique au nom de <strong>{user.fullName}</strong>
          {user.email ? ` (${user.email})` : ""}.
        </div>

        <button type="submit" className="btn-primary w-full">
          Créer ma boutique
        </button>
      </form>
      ) : null}
    </div>
  );
}
