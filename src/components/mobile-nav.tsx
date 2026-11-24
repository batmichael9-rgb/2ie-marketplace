"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ClipboardList,
  LayoutGrid,
  LogOut,
  MessageCircle,
  Settings,
  Store,
  User,
} from "lucide-react";
import { logoutAction } from "@/server/actions/auth";

type MobileNavProps = {
  isLoggedIn: boolean;
  isVendor: boolean;
  firstName: string | null;
  unreadCount: number;
};

/**
 * Menu mobile « 3 traits » du header, structuré comme le menu compte Alibaba :
 * espace vendeur, commandes, messages (avec compteur) et profil.
 */
export function MobileNav({ isLoggedIn, isVendor, firstName, unreadCount }: MobileNavProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Le menu se referme dès qu'on change de page.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const linkClass =
    "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800";

  return (
    <div className="relative md:hidden">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
        aria-expanded={open}
        aria-controls="menu-mobile"
        className="btn-ghost relative !px-2.5 !py-2"
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
        {!open && unreadCount > 0 ? (
          <span className="absolute right-0 top-0 grid min-w-[18px] place-items-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-[18px] text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
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
            className="absolute right-0 top-full z-40 mt-2 w-72 rounded-2xl border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-800 dark:bg-slate-900"
          >
            {isLoggedIn && firstName ? (
              <p className="px-3 py-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                Bonjour, {firstName} 👋
              </p>
            ) : null}

            <Link href="/" className={linkClass} onClick={() => setOpen(false)}>
              <LayoutGrid className="size-4 text-slate-500" aria-hidden />
              Catalogue
            </Link>

            {isLoggedIn ? (
              <div className="mt-1 border-t border-slate-100 pt-1">
                {isVendor ? (
                  <Link href="/espace-vendeur" className={linkClass} onClick={() => setOpen(false)}>
                    <Store className="size-4 text-slate-500" aria-hidden />
                    Mon espace vendeur
                  </Link>
                ) : null}

                <Link href="/mes-commandes" className={linkClass} onClick={() => setOpen(false)}>
                  <ClipboardList className="size-4 text-slate-500" aria-hidden />
                  Mes commandes
                </Link>

                <Link href="/messages" className={linkClass} onClick={() => setOpen(false)}>
                  <MessageCircle className="size-4 text-slate-500" aria-hidden />
                  Mes messages
                  {unreadCount > 0 ? (
                    <span className="ml-auto grid min-w-5 place-items-center rounded-full bg-red-600 px-1.5 text-[11px] font-bold leading-5 text-white">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  ) : null}
                </Link>

                <Link href="/profil" className={linkClass} onClick={() => setOpen(false)}>
                  <User className="size-4 text-slate-500" aria-hidden />
                  Mon profil
                </Link>

                <Link href="/parametres" className={linkClass} onClick={() => setOpen(false)}>
                  <Settings className="size-4 text-slate-500" aria-hidden />
                  Paramètres
                </Link>

                <form action={logoutAction} className="mt-1 border-t border-slate-100 pt-1 dark:border-slate-800">
                  <button
                    type="submit"
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-red-700 hover:bg-red-50"
                  >
                    <LogOut className="size-4" aria-hidden />
                    Se déconnecter
                  </button>
                </form>
              </div>
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
