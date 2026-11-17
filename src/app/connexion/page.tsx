import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { loginAction } from "@/server/actions/auth";

export const metadata: Metadata = { title: "Connexion" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string; message?: string; suivant?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/");

  const { erreur, message, suivant } = await searchParams;

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
            Bon retour !
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Connecte-toi pour accéder à ton compte
          </p>
        </div>

        {erreur ? (
          <div className="mt-8 rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">
            {erreur}
          </div>
        ) : null}

        {message ? (
          <div className="mt-8 rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3 text-sm text-emerald-800">
            {message}
          </div>
        ) : null}

        {/* Form */}
        <form action={loginAction} className="mt-8 space-y-5">
          <input type="hidden" name="next" value={suivant ?? ""} />

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1.5">
              Adresse email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all bg-white"
              placeholder="ton.email@exemple.com"
              autoComplete="email"
              required
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                Mot de passe
              </label>
              <Link
                href="/mot-de-passe-oublie"
                className="text-xs font-medium text-teal-600 hover:text-teal-700"
              >
                Mot de passe oublié ?
              </Link>
            </div>
            <input
              id="password"
              name="password"
              type="password"
              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all bg-white"
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </div>

          <button
            type="submit"
            className="w-full bg-gradient-to-r from-teal-500 to-cyan-600 text-white font-semibold py-3.5 px-6 rounded-xl shadow-lg shadow-teal-500/30 hover:shadow-xl hover:shadow-teal-500/40 hover:from-teal-600 hover:to-cyan-700 transition-all duration-200"
          >
            Se connecter
          </button>
        </form>

        <div className="mt-6">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200"></div>
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-gradient-to-br from-teal-50 via-white to-cyan-50 px-3 text-slate-500">
                Nouveau sur 2iE Market ?
              </span>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3">
          <Link
            href={`/inscription?vendeur=0${suivant ? `&suivant=${encodeURIComponent(suivant)}` : ""}`}
            className="w-full text-center py-3 px-6 border-2 border-slate-200 text-slate-700 font-semibold rounded-xl hover:border-teal-500 hover:text-teal-700 hover:bg-teal-50/50 transition-all duration-200"
          >
            Créer un compte client
          </Link>
          
          <Link
            href={`/inscription?vendeur=1${suivant ? `&suivant=${encodeURIComponent(suivant)}` : ""}`}
            className="w-full text-center py-3 px-6 border-2 border-teal-200 bg-teal-50/50 text-teal-700 font-semibold rounded-xl hover:border-teal-500 hover:bg-teal-100/50 transition-all duration-200"
          >
            Ouvrir une boutique vendeur
          </Link>
        </div>
      </div>
    </div>
  );
}
