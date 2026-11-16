import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { loginAction } from "@/server/actions/auth";

export const metadata: Metadata = { title: "Connexion" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string; suivant?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/");

  const { erreur, suivant } = await searchParams;
  const targetVendorSpace = (suivant ?? "").startsWith("/espace-vendeur");

  return (
    <div className="mx-auto max-w-md py-6">
      <h1 className="text-2xl font-bold tracking-tight">Se connecter</h1>
      <p className="mt-1 text-sm text-slate-600">
        Ton numéro de téléphone sert au vendeur pour te joindre et à toi pour suivre tes commandes.
      </p>

      {targetVendorSpace ? (
        <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Pour vendre sur 2iE Market, connecte-toi avec ton adresse 2iE. Format requis :{" "}
          <strong>prenom.nom@2ie-edu.org</strong>.
        </p>
      ) : null}

      {erreur ? (
        <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{erreur}</p>
      ) : null}

      <form action={loginAction} className="card mt-6 space-y-4 p-5">
        <input type="hidden" name="next" value={suivant ?? ""} />

        <div>
          <label className="label" htmlFor="fullName">
            Nom complet
          </label>
          <input
            id="fullName"
            name="fullName"
            className="input"
            placeholder="Awa Sawadogo"
            autoComplete="name"
            required
          />
        </div>

        <div>
          <label className="label" htmlFor="email">
            Adresse email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            className="input"
            placeholder="prenom.nom@2ie-edu.org"
            autoComplete="email"
            required
          />
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            Tu peux acheter avec n&apos;importe quelle adresse. Pour vendre, l&apos;adresse doit
            obligatoirement se terminer par <strong>@2ie-edu.org</strong> — format requis :{" "}
            <strong>prenom.nom@2ie-edu.org</strong>. Les autres domaines, y compris @2ie.bf, sont
            refusés.
          </p>
        </div>

        <div>
          <label className="label" htmlFor="phone">
            Téléphone <span className="font-normal text-slate-400">(facultatif)</span>
          </label>
          <input
            id="phone"
            name="phone"
            className="input"
            placeholder="+226 70 00 00 00"
            inputMode="tel"
            autoComplete="tel"
          />
        </div>

        <button type="submit" className="btn-primary w-full">
          Entrer
        </button>

        <p className="text-xs leading-relaxed text-slate-500">
          Mode MVP : la connexion se fait par email, sans mot de passe. L&apos;intégration Google OAuth
          et OTP SMS est prévue avant l&apos;ouverture à tout le campus.
        </p>
      </form>

      <p className="mt-4 text-center text-sm text-slate-600">
        Tu vends sur le campus ?{" "}
        <Link href="/espace-vendeur/creer" className="font-semibold text-teal-700 underline">
          Ouvre ta boutique
        </Link>
      </p>
    </div>
  );
}
