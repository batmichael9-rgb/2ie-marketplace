import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
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
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-cyan-50 py-12 px-4 sm:px-6 lg:px-8 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900">
      <div className="mx-auto max-w-md">
        {/* Logo / Header */}
        <div className="text-center">
          <Link href="/" aria-label="2iE Market — accueil" className="mx-auto flex w-fit">
            <Image
              src="/logo.jpg"
              alt="2iE Market"
              width={192}
              height={192}
              priority
              className="h-24 w-24 rounded-xl object-cover dark:hidden"
            />
            <Image
              src="/logo-dark.jpg"
              alt="2iE Market"
              width={192}
              height={192}
              priority
              className="hidden h-24 w-24 rounded-xl object-cover dark:block"
            />
          </Link>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Bon retour !
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Connecte-toi pour accéder à ton compte
          </p>
        </div>

        {erreur ? (
          <div className="mt-8 rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:border-red-900/60 dark:text-red-300">
            {erreur}
          </div>
        ) : null}

        {message ? (
          <div className="mt-8 rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-900/60 dark:text-emerald-300">
            {message}
          </div>
        ) : null}

        {/* Form */}
        <form action={loginAction} className="mt-8 space-y-5">
          <input type="hidden" name="next" value={suivant ?? ""} />

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Adresse email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all bg-white text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-400"
              placeholder="ton.email@exemple.com"
              autoComplete="email"
              required
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="password" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
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
              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all bg-white text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-400"
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
              <div className="w-full border-t border-slate-200 dark:border-slate-800"></div>
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-gradient-to-br from-teal-50 via-white to-cyan-50 px-3 text-slate-500 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 dark:text-slate-400">
                Nouveau sur 2iE Market ?
              </span>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3">
          <Link
            href={`/inscription?vendeur=0${suivant ? `&suivant=${encodeURIComponent(suivant)}` : ""}`}
            className="w-full text-center py-3 px-6 border-2 border-slate-200 text-slate-700 font-semibold rounded-xl hover:border-teal-500 hover:text-teal-700 hover:bg-teal-50/50 transition-all duration-200 dark:border-slate-700 dark:text-slate-200 dark:hover:border-teal-500 dark:hover:bg-slate-900 dark:hover:text-teal-300"
          >
            Créer un compte client
          </Link>
          
          <Link
            href={`/inscription?vendeur=1${suivant ? `&suivant=${encodeURIComponent(suivant)}` : ""}`}
            className="w-full text-center py-3 px-6 border-2 border-teal-200 bg-teal-50/50 text-teal-700 font-semibold rounded-xl hover:border-teal-500 hover:bg-teal-100/50 transition-all duration-200 dark:border-teal-800 dark:bg-teal-500/10 dark:text-teal-300 dark:hover:border-teal-500 dark:hover:bg-teal-500/20"
          >
            Ouvrir une boutique vendeur
          </Link>
        </div>
      </div>
    </div>
  );
}
