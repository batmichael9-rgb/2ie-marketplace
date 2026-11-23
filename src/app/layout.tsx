import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { getCurrentUser } from "@/lib/auth";
import { appUrl } from "@/lib/domain";
import { HeaderActions } from "@/components/header-actions";
import { MobileNav } from "@/components/mobile-nav";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { countUnreadMessages } from "@/lib/messages";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl()),
  title: {
    default: "2iE Market — la marketplace du campus",
    template: "%s · 2iE Market",
  },
  description:
    "Commande et réserve auprès des commerçants de l'Institut 2iE : repas, matériel scolaire, téléphones, ordinateurs, vêtements et parfums.",
  applicationName: "2iE Market",
  manifest: "/manifest.json",
  // iOS n'utilise pas le manifest pour l'installation : ces balises permettent
  // « Sur l'écran d'accueil » puis un lancement en plein écran sans barre Safari.
  appleWebApp: {
    capable: true,
    title: "2iE Market",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
  // Next 16 n'émet plus que `mobile-web-app-capable` : Safari a besoin de la
  // variante `apple-` pour ouvrir l'app installée en plein écran.
  other: { "apple-mobile-web-app-capable": "yes" },
  openGraph: {
    type: "website",
    locale: "fr_BF",
    siteName: "2iE Market",
    title: "2iE Market — la marketplace du campus",
    description: "Les commerçants de 2iE, réunis au même endroit.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0f766e",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const firstName = user?.fullName.split(" ")[0] ?? null;
  const isVendor = Boolean(user?.vendor) || user?.role === "ADMIN";
  // Badge rouge du header : total des messages non lus, toutes conversations.
  const unreadCount = user ? await countUnreadMessages(user.id) : 0;

  return (
    <html lang="fr">
      <body className="flex min-h-dvh flex-col">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-stone-50/90 backdrop-blur">
          <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3">
            <Link href="/" className="flex items-center gap-2 font-bold text-teal-800">
              <span className="grid size-9 place-items-center rounded-xl bg-teal-700 text-sm text-white">
                2iE
              </span>
              <span className="text-lg tracking-tight">Market</span>
            </Link>

            {/* Ordinateur : liens à plat puis actions rapides (panier, messages, compte).
                Mobile : menu « 3 traits » à droite. */}
            <nav className="hidden items-center gap-1 text-sm md:flex">
              <Link href="/" className="btn-ghost">
                Catalogue
              </Link>
              {isVendor ? (
                <Link href="/espace-vendeur" className="btn-ghost">
                  Espace vendeur
                </Link>
              ) : null}
            </nav>

            <HeaderActions
              isLoggedIn={Boolean(user)}
              isVendor={isVendor}
              firstName={firstName}
              unreadCount={unreadCount}
            />

            <div className="ml-auto md:hidden">
              <MobileNav
                isLoggedIn={Boolean(user)}
                isVendor={isVendor}
                firstName={firstName}
                unreadCount={unreadCount}
              />
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>

        <footer className="border-t border-slate-200 px-4 py-8 text-center text-xs text-slate-500">
          <p>2iE Market — projet étudiant de l'Institut 2iE, Ouagadougou.</p>
          <p className="mt-1">Paiement à la réception disponible · Mobile Money en préparation.</p>
        </footer>

        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
