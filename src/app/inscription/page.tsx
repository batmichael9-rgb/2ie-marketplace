import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { registerAction } from "@/server/actions/auth";

export const metadata: Metadata = { title: "Inscription" };

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string; suivant?: string; vendeur?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/");

  const { erreur, suivant, vendeur } = await searchParams;
  const isVendor = vendeur === "1";

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-cyan-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-md">
        {/* Logo / Header */}
        <div className="text-center">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center shadow-lg shadow-teal-500/30">
            <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
          </div>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900">
            Créer un compte
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            {isVendor 
              ? "Ouvre ta boutique sur le campus 2iE"
              : "Rejoins la marketplace de l'Institut 2iE"
            }
          </p>
        </div>

        {/* Tabs */}
        <div className="mt-8 flex gap-2 p-1 bg-slate-100 rounded-xl">
          <Link
            href={`/inscription?vendeur=0${suivant ? `&suivant=${encodeURIComponent(suivant)}` : ""}`}
            className={`flex-1 py-2.5 px-4 text-sm font-semibold rounded-lg transition-all ${
              !isVendor
                ? "bg-white text-teal-700 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Client
          </Link>
          <Link
            href={`/inscription?vendeur=1${suivant ? `&suivant=${encodeURIComponent(suivant)}` : ""}`}
            className={`flex-1 py-2.5 px-4 text-sm font-semibold rounded-lg transition-all ${
              isVendor
                ? "bg-white text-teal-700 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Vendeur
          </Link>
        </div>

        {erreur ? (
          <div className="mt-6 rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">
            {erreur}
          </div>
        ) : null}

        {isVendor ? (
          <div className="mt-6 rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 text-sm text-amber-900">
            <strong>Format d'email requis :</strong> prenom.nom@2ie-edu.org
          </div>
        ) : null}

        {/* Form */}
        <form action={registerAction} className="mt-6 space-y-5">
          <input type="hidden" name="next" value={suivant ?? ""} />
          <input type="hidden" name="isVendor" value={isVendor ? "true" : "false"} />

          <div>
            <label htmlFor="fullName" className="block text-sm font-medium text-slate-700 mb-1.5">
              Nom complet
            </label>
            <input
              id="fullName"
              name="fullName"
              type="text"
              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all bg-white"
              placeholder="Fatou Ouédraogo"
              autoComplete="name"
              required
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1.5">
              Adresse email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all bg-white"
              placeholder={isVendor ? "prenom.nom@2ie-edu.org" : "ton.email@exemple.com"}
              autoComplete="email"
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1.5">
              Mot de passe
            </label>
            <input
              id="password"
              name="password"
              type="password"
              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all bg-white"
              placeholder="••••••••"
              autoComplete="new-password"
              required
            />
            <p className="mt-1.5 text-xs text-slate-500">
              Minimum 8 caractères, 1 majuscule, 1 minuscule, 1 chiffre
            </p>
          </div>

          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-slate-700 mb-1.5">
              Téléphone <span className="font-normal text-slate-400">(facultatif)</span>
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all bg-white"
              placeholder="+226 70 00 00 00"
              inputMode="tel"
              autoComplete="tel"
            />
          </div>

          {isVendor && (
            <div>
              <label htmlFor="shopName" className="block text-sm font-medium text-slate-700 mb-1.5">
                Nom de ta boutique
              </label>
              <input
                id="shopName"
                name="shopName"
                type="text"
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all bg-white"
                placeholder="Chez Fatou"
                required={isVendor}
              />
            </div>
          )}

          <button
            type="submit"
            className="w-full bg-gradient-to-r from-teal-500 to-cyan-600 text-white font-semibold py-3.5 px-6 rounded-xl shadow-lg shadow-teal-500/30 hover:shadow-xl hover:shadow-teal-500/40 hover:from-teal-600 hover:to-cyan-700 transition-all duration-200"
          >
            Créer mon compte
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-600">
          Déjà un compte ?{" "}
          <Link 
            href={`/connexion${suivant ? `?suivant=${encodeURIComponent(suivant)}` : ""}`}
            className="font-semibold text-teal-600 hover:text-teal-700 transition-colors"
          >
            Se connecter
          </Link>
        </p>
      </div>
    </div>
  );
}
