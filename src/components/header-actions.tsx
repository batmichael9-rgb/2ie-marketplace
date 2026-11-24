"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ClipboardList,
  LogOut,
  MessageCircle,
  Settings,
  ShoppingCart,
  Store,
  User,
} from "lucide-react";
import { logoutAction } from "@/server/actions/auth";

/**
 * Actions rapides du header façon Alibaba (desktop) : commandes, messages avec
 * badge de non-lus, et menu compte déroulant.
 */
export function HeaderActions({
  isLoggedIn,
  isVendor,
  firstName,
  unreadCount,
}: {
  isLoggedIn: boolean;
  isVendor: boolean;
  firstName: string | null;
  unreadCount: number;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const containerRef = useRef<HTMLDivElement>(null);

  // Fermeture au changement de page et au clic extérieur.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!isLoggedIn) {
    return (
      <Link href="/connexion" className="btn-primary ml-auto !py-2 !text-xs md:ml-0">
        Se connecter
      </Link>
    );
  }

  const iconButton =
    "btn-ghost relative !px-2.5 !py-2 text-slate-600 hover:text-teal-700";
  const menuItem =
    "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800";

  return (
    <div className="ml-auto hidden items-center gap-1 md:flex">
      <Link href="/mes-commandes" className={iconButton} title="Mes commandes" aria-label="Mes commandes">
        <ShoppingCart className="size-5" aria-hidden />
      </Link>

      <Link
        href="/messages"
        className={iconButton}
        title={unreadCount > 0 ? `${unreadCount} message(s) non lu(s)` : "Mes messages"}
        aria-label={
          unreadCount > 0 ? `Mes messages, ${unreadCount} non lus` : "Mes messages"
        }
      >
        <MessageCircle className="size-5" aria-hidden />
        {unreadCount > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 grid min-w-[18px] place-items-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-[18px] text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </Link>

      <div className="relative" ref={containerRef}>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-controls="menu-compte"
          className="btn-ghost max-w-44 !px-2 !py-2 text-sm"
        >
          <User className="size-5" aria-hidden />
          <span className="hidden max-w-24 truncate lg:inline">{firstName}</span>
          <ChevronDown
            className={`size-4 transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden
          />
        </button>

        {open ? (
          <div
            id="menu-compte"
            role="menu"
            className="absolute right-0 top-full z-40 mt-2 w-64 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-800 dark:bg-slate-900"
          >
            <p className="px-3 py-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
              Bonjour, {firstName ?? "étudiant"} 👋
            </p>

            <div className="mt-1 border-t border-slate-100 pt-1 dark:border-slate-800">
              {isVendor ? (
                <Link href="/espace-vendeur" role="menuitem" className={menuItem}>
                  <Store className="size-4 text-slate-500" aria-hidden />
                  Mon espace vendeur
                </Link>
              ) : null}

              <Link href="/mes-commandes" role="menuitem" className={menuItem}>
                <ClipboardList className="size-4 text-slate-500" aria-hidden />
                Mes commandes
              </Link>

              <Link href="/messages" role="menuitem" className={menuItem}>
                <MessageCircle className="size-4 text-slate-500" aria-hidden />
                Mes messages
                {unreadCount > 0 ? (
                  <span className="ml-auto grid min-w-5 place-items-center rounded-full bg-red-600 px-1.5 text-[11px] font-bold leading-5 text-white">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                ) : null}
              </Link>

              <Link href="/profil" role="menuitem" className={menuItem}>
                <User className="size-4 text-slate-500" aria-hidden />
                Mon profil
              </Link>

              <Link href="/parametres" role="menuitem" className={menuItem}>
                <Settings className="size-4 text-slate-500" aria-hidden />
                Paramètres
              </Link>

              <form action={logoutAction} className="mt-1 border-t border-slate-100 pt-1 dark:border-slate-800">
                <button
                  type="submit"
                  role="menuitem"
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
                >
                  <LogOut className="size-4" aria-hidden />
                  Se déconnecter
                </button>
              </form>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
