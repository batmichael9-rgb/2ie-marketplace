"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { logoutAction } from "@/server/actions/auth";

type MobileNavProps = {
  isLoggedIn: boolean;
  isVendor: boolean;
  firstName: string | null;
};

/**
 * Menu mobile « 3 traits » du header.
 *
 * Sur les écrans < md, les liens de la barre de navigation seraient trop serrés :
 * ils sont regroupés dans ce menu déroulant.
 */
export function MobileNav({ isLoggedIn, isVendor, firstName }: MobileNavProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Le menu se referme dès qu'on change de page.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const linkClass = "block rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100";

  return (
    <div className="relative md:hidden">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
        aria-expanded={open}
        aria-controls="menu-mobile"
        className="btn-ghost !px-2.5 !py-2"
      >
        <svg
          className="size-6"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          aria-hidden="true"
        >
          {open ? (
            <>
              <path d="M6 6l12 12" />
              <path d="M18 6L6 18" />
            </>
          ) : (
            <>
              <path d="M4 7h16" />
              <path d="M4 12h16" />
              <path d="M4 17h16" />
            </>
          )}
        </svg>
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-label="Fermer le menu"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-30 cursor-default bg-slate-900/20"
          />
          <nav
            id="menu-mobile"
            className="absolute right-0 top-full z-40 mt-2 w-64 rounded-2xl border border-slate-200 bg-white p-2 shadow-lg"
          >
            {isLoggedIn && firstName ? (
              <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                {firstName}
              </p>
            ) : null}

            <Link href="/" className={linkClass} onClick={() => setOpen(false)}>
              Catalogue
            </Link>

            {isLoggedIn ? (
              <>
                <Link href="/mes-commandes" className={linkClass} onClick={() => setOpen(false)}>
                  Mes commandes
                </Link>
                {isVendor ? (
                  <Link href="/espace-vendeur" className={linkClass} onClick={() => setOpen(false)}>
                    Espace vendeur
                  </Link>
                ) : null}
                <Link href="/profil" className={linkClass} onClick={() => setOpen(false)}>
                  Mon profil
                </Link>
                <form action={logoutAction} className="mt-1 border-t border-slate-100 pt-1">
                  <button
                    type="submit"
                    className="block w-full rounded-xl px-3 py-2.5 text-left text-sm font-medium text-red-700 hover:bg-red-50"
                  >
                    Déconnexion
                  </button>
                </form>
              </>
            ) : (
              <div className="mt-1 space-y-1 border-t border-slate-100 pt-1">
                <Link href="/connexion" className={linkClass} onClick={() => setOpen(false)}>
                  Se connecter
                </Link>
                <Link
                  href="/inscription"
                  className="block rounded-xl px-3 py-2.5 text-sm font-semibold text-teal-700 hover:bg-teal-50"
                  onClick={() => setOpen(false)}
                >
                  S&apos;inscrire
                </Link>
              </div>
            )}
          </nav>
        </>
      ) : null}
    </div>
  );
}
