import type { Metadata } from "next";
import Link from "next/link";
import {
  requestPasswordResetAction,
  resetPasswordAction,
} from "@/server/actions/auth";

export const metadata: Metadata = { title: "Mot de passe oublié" };

type SearchParams = { etape?: string; email?: string; erreur?: string };

const inputClass =
  "w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all bg-white text-slate-900 placeholder:text-slate-400";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const email = params.email?.trim().toLowerCase() ?? "";
  const onCodeStep = params.etape === "code" && email.length > 0;
  const isInstitutionalEmail = email.endsWith("@2ie-edu.org");

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-cyan-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-md">
        <div className="text-center">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center shadow-lg shadow-teal-500/30">
            <svg
              className="h-8 w-8 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 7a3 3 0 11-6 0 3 3 0 016 0zM12 14v7m-4 0h8"
              />
            </svg>
          </div>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900">
            {onCodeStep ? "Nouveau mot de passe" : "Mot de passe oublié"}
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            {onCodeStep
              ? "Saisis le code reçu par email puis choisis un nouveau mot de passe."
              : "Indique ton adresse email pour recevoir un code de réinitialisation."}
          </p>
        </div>

        {params.erreur ? (
          <div className="mt-6 rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">
            {params.erreur}
          </div>
        ) : null}

        {onCodeStep ? (
          <>
            <div className="mt-6 rounded-xl bg-teal-50 border border-teal-100 px-4 py-4 text-sm text-teal-900">
              <p className="font-semibold">
                Un e-mail contenant un code de vérification à 6 chiffres vient
                d&apos;être envoyé à {email}.
              </p>
              <p className="mt-2">
                Vérifie ta boîte de réception <strong>et le dossier
                « Courriers indésirables / Spam »</strong> sur{" "}
                <strong>
                  {isInstitutionalEmail ? "Outlook" : "Gmail ou ta messagerie personnelle"}
                </strong>
                . Le code est valable 10 minutes.
              </p>
            </div>

            <form action={resetPasswordAction} className="mt-6 space-y-5">
              <input type="hidden" name="email" value={email} />

              <div>
                <label htmlFor="code" className="block text-sm font-medium text-slate-700 mb-1.5">
                  Code de vérification
                </label>
                <input
                  id="code"
                  name="code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="\d{6}"
                  maxLength={6}
                  className={`${inputClass} text-center text-2xl font-semibold tracking-[0.4em]`}
                  placeholder="000000"
                  required
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1.5">
                  Nouveau mot de passe
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  className={inputClass}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  required
                />
                <p className="mt-1.5 text-xs text-slate-500">
                  Minimum 8 caractères, 1 majuscule, 1 minuscule, 1 chiffre
                </p>
              </div>

              <button
                type="submit"
                className="w-full bg-gradient-to-r from-teal-500 to-cyan-600 text-white font-semibold py-3.5 px-6 rounded-xl shadow-lg shadow-teal-500/30 hover:shadow-xl hover:shadow-teal-500/40 hover:from-teal-600 hover:to-cyan-700 transition-all duration-200"
              >
                Enregistrer mon nouveau mot de passe
              </button>
            </form>

            <div className="mt-4 flex flex-col items-center gap-3">
              <form action={requestPasswordResetAction}>
                <input type="hidden" name="email" value={email} />
                <button
                  type="submit"
                  className="text-sm font-medium text-teal-700 hover:text-teal-800 underline underline-offset-4"
                >
                  Renvoyer le code
                </button>
              </form>

              <Link
                href="/mot-de-passe-oublie"
                className="text-xs text-slate-500 hover:text-slate-700"
              >
                Changer d&apos;adresse email
              </Link>
            </div>
          </>
        ) : (
          <>
            <form action={requestPasswordResetAction} className="mt-8 space-y-5">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1.5">
                  Adresse email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  className={inputClass}
                  placeholder="ton.email@exemple.com"
                  autoComplete="email"
                  defaultValue={email}
                  required
                />
              </div>

              <button
                type="submit"
                className="w-full bg-gradient-to-r from-teal-500 to-cyan-600 text-white font-semibold py-3.5 px-6 rounded-xl shadow-lg shadow-teal-500/30 hover:shadow-xl hover:shadow-teal-500/40 hover:from-teal-600 hover:to-cyan-700 transition-all duration-200"
              >
                Recevoir un code de réinitialisation
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-slate-600">
              <Link
                href="/connexion"
                className="font-semibold text-teal-600 hover:text-teal-700 transition-colors"
              >
                Retour à la connexion
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
