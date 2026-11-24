import type { Metadata } from "next";
import Link from "next/link";
import { Bell, MapPin, Palette, Wallet } from "lucide-react";
import { CampusPreference } from "@/components/campus-preference";
import { MobileMoneyFields } from "@/components/mobile-money-fields";
import { PushNotificationsButton } from "@/components/push-notifications-button";
import { ThemeChooser } from "@/components/theme-chooser";
import { requireUser } from "@/lib/auth";
import { updateMobileMoneyAction } from "@/server/actions/profile";

export const metadata: Metadata = { title: "Paramètres" };

function Section({
  icon,
  title,
  description,
  children,
  id,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="card space-y-4 p-5">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 text-teal-700 dark:text-teal-400">{icon}</span>
        <div>
          <h2 className="text-base font-bold">{title}</h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; erreur?: string }>;
}) {
  const user = await requireUser("/parametres");
  const params = await searchParams;

  return (
    <div className="mx-auto max-w-2xl space-y-5 py-2">
      <div>
        <Link
          href="/"
          className="text-sm text-slate-500 hover:text-teal-700 dark:text-slate-400 dark:hover:text-teal-400"
        >
          ← Retour au catalogue
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Paramètres</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Apparence, notifications, Mobile Money et campus par défaut.
        </p>
      </div>

      {params.ok === "momo" ? (
        <p className="rounded-xl bg-teal-50 px-3 py-2 text-sm text-teal-900 dark:bg-teal-500/10 dark:text-teal-200">
          Numéro Mobile Money enregistré.
        </p>
      ) : null}

      {params.erreur ? (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
          {params.erreur}
        </p>
      ) : null}

      <Section
        icon={<Palette className="size-5" aria-hidden />}
        title="Apparence"
        description="Choisis un thème clair, sombre, ou automatique selon ton téléphone."
      >
        <ThemeChooser />
      </Section>

      <Section
        icon={<Bell className="size-5" aria-hidden />}
        title="Notifications"
        description="Active ou désactive les notifications Push sur cet appareil."
      >
        <PushNotificationsButton />
      </Section>

      <Section
        id="mobile-money"
        icon={<Wallet className="size-5" aria-hidden />}
        title="Paiement & Mobile Money"
        description="Ton numéro pour les paiements et, si tu vends, les reversements."
      >
        <form action={updateMobileMoneyAction} className="space-y-4">
          <MobileMoneyFields
            idPrefix="settings"
            number={user.mobileMoneyNumber}
            provider={user.mobileMoneyProvider}
          />
          <button type="submit" className="btn-primary">
            Enregistrer mon numéro
          </button>
        </form>
      </Section>

      <Section
        icon={<MapPin className="size-5" aria-hidden />}
        title="Préférence de campus"
        description="Filtre par défaut du catalogue à l'ouverture."
      >
        <CampusPreference />
      </Section>
    </div>
  );
}
