import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { VendorSignupHighlights } from "@/components/vendor-signup-highlights";
import { getCurrentUser } from "@/lib/auth";
import {
  requestSignupCodeAction,
  verifySignupCodeAction,
} from "@/server/actions/auth";

export const metadata: Metadata = { title: "Inscription" };

type SearchParams = {
  etape?: string;
  email?: string;
  erreur?: string;
  suivant?: string;
  vendeur?: string;
};

const inputClass =
  "w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all bg-white text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-400";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/");

  const params = await searchParams;
  const isVendor = params.vendeur === "1";
  const email = params.email?.trim().toLowerCase() ?? "";
  const next = params.suivant ?? "";
  const onCodeStep = params.etape === "code" && email.length > 0;
  const isInstitutionalEmail = email.endsWith("@2ie-edu.org");

  const nextQuery = next ? `&suivant=${encodeURIComponent(next)}` : "";

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-cyan-50 py-12 px-4 sm:px-6 lg:px-8 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900">
      <div className="mx-auto max-w-md">
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
            {onCodeStep ? "Vérifie ton email" : "Créer un compte"}
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            {onCodeStep
              ? isVendor
                ? "Dernière étape avant l'ouverture de ta boutique"
                : "Dernière étape avant de rejoindre la marketplace"
              : isVendor
                ? "Ouvre ta boutique sur le campus 2iE"
                : "Rejoins la marketplace de l'Institut 2iE"}
          </p>
        </div>

        {!onCodeStep ? (
          <div className="mt-8 flex gap-2 p-1 bg-slate-100 rounded-xl dark:bg-slate-800">
            <Link
              href={`/inscription?vendeur=0${nextQuery}`}
              className={`flex-1 py-2.5 px-4 text-sm font-semibold rounded-lg transition-all ${
                !isVendor
                  ? "bg-white text-teal-700 shadow-sm dark:bg-slate-900 dark:text-teal-300"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
              }`}
            >
              Client
            </Link>
            <Link
              href={`/inscription?vendeur=1${nextQuery}`}
              className={`flex-1 py-2.5 px-4 text-sm font-semibold rounded-lg transition-all ${
                isVendor
                  ? "bg-white text-teal-700 shadow-sm dark:bg-slate-900 dark:text-teal-300"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
              }`}
            >
              Vendeur
            </Link>
          </div>
        ) : null}

        {params.erreur ? (
          <div className="mt-6 rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:border-red-900/60 dark:text-red-300">
            {params.erreur}
          </div>
        ) : null}

        {onCodeStep ? (
          <>
            <div className="mt-6 rounded-xl bg-teal-50 border border-teal-100 px-4 py-4 text-sm text-teal-900 dark:bg-teal-500/10 dark:border-teal-800 dark:text-teal-200">
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

            <form action={verifySignupCodeAction} className="mt-6 space-y-5">
              <input type="hidden" name="email" value={email} />
              <input type="hidden" name="next" value={next} />
              <input type="hidden" name="isVendor" value={isVendor ? "true" : "false"} />

              <div>
                <label htmlFor="code" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
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

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="firstName" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Prénom
                  </label>
                  <input
                    id="firstName"
                    name="firstName"
                    type="text"
                    className={inputClass}
                    placeholder="Fatou"
                    autoComplete="given-name"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="lastName" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Nom
                  </label>
                  <input
                    id="lastName"
                    name="lastName"
                    type="text"
                    className={inputClass}
                    placeholder="Ouédraogo"
                    autoComplete="family-name"
                    required
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Mot de passe
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
                <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                  Minimum 8 caractères, 1 majuscule, 1 minuscule, 1 chiffre
                </p>
              </div>

              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Téléphone <span className="font-normal text-slate-400">(facultatif)</span>
                </label>
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  className={inputClass}
                  placeholder="+226 70 00 00 00"
                  inputMode="tel"
                  autoComplete="tel"
                />
              </div>

              {isVendor ? (
                <>
                  <div>
                    <label htmlFor="shopName" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Nom de ta boutique
                    </label>
                    <input
                      id="shopName"
                      name="shopName"
                      type="text"
                      className={inputClass}
                      placeholder="Chez Fatou"
                      required
                    />
                  </div>

                  <div>
                    <label htmlFor="campus" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Campus 2iE
                    </label>
                    <select id="campus" name="campus" className={inputClass} defaultValue="" required>
                      <option value="" disabled>
                        Choisis ton site
                      </option>
                      <option value="Site de Ouagadougou">Site de Ouagadougou</option>
                      <option value="Site de Kamboinsé">Site de Kamboinsé</option>
                    </select>
                    <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                      Ton campus est affiché aux clients sur tes produits.
                    </p>
                  </div>

                  <VendorSignupHighlights />

                  <label className="flex items-start gap-3 rounded-xl border border-teal-200 bg-white p-3 text-sm dark:border-teal-800 dark:bg-slate-900 dark:text-slate-200">
                    <input
                      type="checkbox"
                      name="vendorCommissionAccepted"
                      value="on"
                      className="mt-1 size-4 accent-teal-700"
                      required
                    />
                    <span>
                      J&apos;accepte les Frais de service &amp; Mobile Money appliqués aux ventes
                      payées en ligne et le reversement automatique du montant net sur mon
                      numéro Mobile Money.
                    </span>
                  </label>
                </>
              ) : null}

              <button
                type="submit"
                className="w-full bg-gradient-to-r from-teal-500 to-cyan-600 text-white font-semibold py-3.5 px-6 rounded-xl shadow-lg shadow-teal-500/30 hover:shadow-xl hover:shadow-teal-500/40 hover:from-teal-600 hover:to-cyan-700 transition-all duration-200"
              >
                Vérifier et créer mon compte
              </button>
            </form>

            <div className="mt-4 flex flex-col items-center gap-3">
              <form action={requestSignupCodeAction}>
                <input type="hidden" name="email" value={email} />
                <input type="hidden" name="next" value={next} />
                <input type="hidden" name="isVendor" value={isVendor ? "true" : "false"} />
                <button
                  type="submit"
                  className="text-sm font-medium text-teal-700 hover:text-teal-800 underline underline-offset-4"
                >
                  Renvoyer le code
                </button>
              </form>

              <Link
                href={`/inscription?vendeur=${isVendor ? "1" : "0"}${nextQuery}`}
                                  className="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              >
                Changer d&apos;adresse email
              </Link>
            </div>
          </>
        ) : (
          <>
            {isVendor ? (
              <>
                <div className="mt-6 rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:border-amber-800 dark:text-amber-200">
                  <strong>Format d&apos;email requis :</strong> prenom.nom@2ie-edu.org
                </div>
                <VendorSignupHighlights className="mt-4" />
              </>
            ) : null}

            <form action={requestSignupCodeAction} className="mt-6 space-y-5">
              <input type="hidden" name="next" value={next} />
              <input type="hidden" name="isVendor" value={isVendor ? "true" : "false"} />

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Adresse email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  className={inputClass}
                  placeholder={isVendor ? "prenom.nom@2ie-edu.org" : "ton.email@exemple.com"}
                  autoComplete="email"
                  defaultValue={email}
                  required
                />
                <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                  Un code de vérification à 6 chiffres te sera envoyé par email.
                </p>
              </div>

              <button
                type="submit"
                className="w-full bg-gradient-to-r from-teal-500 to-cyan-600 text-white font-semibold py-3.5 px-6 rounded-xl shadow-lg shadow-teal-500/30 hover:shadow-xl hover:shadow-teal-500/40 hover:from-teal-600 hover:to-cyan-700 transition-all duration-200"
              >
                Recevoir mon code de vérification
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-slate-600 dark:text-slate-400">
              Déjà un compte ?{" "}
              <Link
                href={`/connexion${next ? `?suivant=${encodeURIComponent(next)}` : ""}`}
                className="font-semibold text-teal-600 hover:text-teal-700 transition-colors"
              >
                Se connecter
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
