import type { Metadata } from "next";
import Link from "next/link";
import { PushNotificationsButton } from "@/components/push-notifications-button";
import { requireUser } from "@/lib/auth";
import { CAMPUSES, campusBadgeLabel } from "@/lib/domain";
import { updateProfileAction } from "@/server/actions/profile";

export const metadata: Metadata = { title: "Mon profil" };

const ROLE_LABELS: Record<string, string> = {
  CLIENT: "Client",
  VENDOR: "Vendeur",
  ADMIN: "Administrateur",
};

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; erreur?: string }>;
}) {
  const user = await requireUser("/profil");
  const params = await searchParams;
  const vendor = user.vendor;
  const campusLabel = vendor ? campusBadgeLabel(vendor.campus) : null;

  return (
    <div className="mx-auto max-w-2xl space-y-5 py-2">
      <div>
        <Link href="/" className="text-sm text-slate-500 hover:text-teal-700">
          ← Retour au catalogue
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Mon profil</h1>
        <p className="mt-1 text-sm text-slate-600">
          Tes informations de compte et, si tu vends, celles de ta boutique.
        </p>
      </div>

      <PushNotificationsButton />

      {params.ok ? (
        <p className="rounded-xl bg-teal-50 px-3 py-2 text-sm text-teal-900">
          Profil mis à jour.
        </p>
      ) : null}

      {params.erreur ? (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{params.erreur}</p>
      ) : null}

      <section className="card space-y-2 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-bold">{user.fullName}</h2>
          <span className="badge bg-slate-100 text-slate-700">
            {ROLE_LABELS[user.role] ?? user.role}
          </span>
          {campusLabel ? (
            <span className="badge bg-teal-50 text-teal-800">{campusLabel}</span>
          ) : null}
        </div>
        <p className="text-sm text-slate-600">{user.email ?? user.phone ?? "—"}</p>
        {vendor ? (
          <p className="text-sm text-slate-600">
            <strong>Boutique :</strong> {vendor.shopName}
            {vendor.campus ? ` · ${vendor.campus}` : " · campus non renseigné"}
          </p>
        ) : null}
      </section>

      <form action={updateProfileAction} className="card space-y-5 p-5">
        <div>
          <label htmlFor="fullName" className="label">
            Nom complet
          </label>
          <input
            id="fullName"
            name="fullName"
            className="input"
            maxLength={80}
            defaultValue={user.fullName}
            autoComplete="name"
            required
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="email" className="label">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              className="input"
              defaultValue={user.email ?? ""}
              autoComplete="email"
              required
            />
          </div>
          <div>
            <label htmlFor="phone" className="label">
              Téléphone <span className="font-normal text-slate-400">(facultatif)</span>
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              inputMode="tel"
              maxLength={20}
              className="input"
              defaultValue={user.phone ?? ""}
              placeholder="+226 70 00 00 00"
              autoComplete="tel"
            />
          </div>
        </div>

        {vendor ? (
          <div className="space-y-4 border-t border-slate-200 pt-4">
            <div>
              <label htmlFor="shopName" className="label">
                Nom de la boutique
              </label>
              <input
                id="shopName"
                name="shopName"
                className="input"
                maxLength={60}
                defaultValue={vendor.shopName}
                required
              />
            </div>

            <div>
              <label htmlFor="campus" className="label">
                Campus 2iE
              </label>
              <select
                id="campus"
                name="campus"
                className="input"
                defaultValue={vendor.campus ?? ""}
                required
              >
                <option value="" disabled>
                  Choisis ton site
                </option>
                {CAMPUSES.map((campus) => (
                  <option key={campus} value={campus}>
                    {campus}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-500">
                Ce campus est affiché aux clients sur tes fiches produit.
              </p>
            </div>
          </div>
        ) : null}

        <button type="submit" className="btn-primary w-full">
          Enregistrer
        </button>
      </form>
    </div>
  );
}
