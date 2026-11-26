import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import Link from "next/link";
import "./globals.css";
import { getCurrentUser } from "@/lib/auth";
import { appUrl } from "@/lib/domain";
import { HeaderActions } from "@/components/header-actions";
import { MobileNav } from "@/components/mobile-nav";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { ThemeProvider } from "@/components/theme-provider";
import { countUnreadMessages } from "@/lib/messages";

// Applique le thème avant le premier rendu pour éviter un flash blanc.
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("2ie-market-theme");var d=t==="dark"||(t!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);document.documentElement.style.colorScheme=d?"dark":"light";}catch(e){}})();`;

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
  const isAdmin = user?.role === "ADMIN";
  // Badge rouge du header : total des messages non lus, toutes conversations.
  const unreadCount = user ? await countUnreadMessages(user.id) : 0;

  return (
    <html lang="fr" suppressHydrationWarning className="w-full max-w-full overflow-x-hidden">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-dvh w-full max-w-full flex-col overflow-x-hidden">
        <ThemeProvider>
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-stone-50/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
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
              {isAdmin ? (
                <Link href="/espace-admin" className="btn-ghost">
                  Reversements
                </Link>
              ) : null}
            </nav>

            <HeaderActions
              isLoggedIn={Boolean(user)}
              isVendor={isVendor}
              isAdmin={isAdmin}
              firstName={firstName}
              unreadCount={unreadCount}
            />

            <div className="ml-auto md:hidden">
              <MobileNav
                isLoggedIn={Boolean(user)}
                isVendor={isVendor}
                isAdmin={isAdmin}
                firstName={firstName}
                unreadCount={unreadCount}
              />
            </div>
          </div>
        </header>

        <main className="mx-auto w-full min-w-0 max-w-6xl flex-1 px-4 py-6">{children}</main>

        <footer className="border-t border-slate-200 px-4 py-8 text-center text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
          <p>2iE Market — projet étudiant de l'Institut 2iE, Ouagadougou.</p>
          <p className="mt-1">
            Paiement en ligne sécurisé · Orange Money, Moov Money, Wave et carte bancaire.
          </p>
        </footer>

        <ServiceWorkerRegister />
        </ThemeProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
