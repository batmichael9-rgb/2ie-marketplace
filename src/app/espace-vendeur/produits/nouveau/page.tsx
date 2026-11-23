import type { Metadata } from "next";
import Link from "next/link";
import { requireVendor } from "@/lib/auth";
import { CAMPUSES } from "@/lib/domain";
import { createProductAction } from "@/server/actions/vendor";
import { catalogCategoryOptions } from "@/server/categories";

export const metadata: Metadata = { title: "Nouveau produit" };

export default async function NewProductPage({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string }>;
}) {
  const { vendor } = await requireVendor("/espace-vendeur/produits/nouveau");
  const { erreur } = await searchParams;

  const categories = await catalogCategoryOptions();

  return (
    <div className="mx-auto max-w-2xl space-y-5 py-2">
      <div>
        <Link href="/espace-vendeur#produits" className="text-sm text-slate-500 hover:text-teal-700">
          ← Mon espace vendeur
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Ajouter un produit</h1>
        <p className="mt-1 text-sm text-slate-600">
          Une fiche claire et une photo nette augmentent nettement les commandes.
        </p>
      </div>

      {erreur ? (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{erreur}</p>
      ) : null}

      <form action={createProductAction} className="card space-y-5 p-5">
        <div>
          <label className="label" htmlFor="name">
            Nom du produit
          </label>
          <input
            id="name"
            name="name"
            className="input"
            maxLength={100}
            placeholder="Riz gras + poulet"
            required
          />
        </div>

        <div>
          <label className="label" htmlFor="description">
            Description
          </label>
          <textarea
            id="description"
            name="description"
            rows={4}
            className="input"
            maxLength={2000}
            placeholder="Contenu, taille, état, ce qui est inclus..."
            required
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="priceXof">
              Prix (FCFA)
            </label>
            <input
              id="priceXof"
              name="priceXof"
              className="input"
              type="number"
              inputMode="numeric"
              min={25}
              max={10_000_000}
              step={25}
              placeholder="1500"
              required
            />
            <p className="mt-1 text-xs text-slate-500">Entier, sans centimes.</p>
          </div>

          <div>
            <label className="label" htmlFor="categoryId">
              Catégorie
            </label>
            <select id="categoryId" name="categoryId" className="input" defaultValue="">
              <option value="">Sans catégorie</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="label" htmlFor="campus">
            Campus 2iE
          </label>
          <select
            id="campus"
            name="campus"
            className="input"
            defaultValue={vendor.campus ?? ""}
            required
          >
            <option value="" disabled>
              Choisis ton site
            </option>
            {CAMPUSES.map((campus) => (
              <option key={campus} value={campus}>
                {campus}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">
            Affiché aux clients sur la carte et la fiche de ce produit.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="stockMode">
              Gestion du stock
            </label>
            <select id="stockMode" name="stockMode" className="input" defaultValue="TRACKED">
              <option value="TRACKED">Stock suivi</option>
              <option value="UNLIMITED">Disponible en continu</option>
              <option value="OUT_OF_STOCK">En rupture</option>
            </select>
          </div>

          <div>
            <label className="label" htmlFor="stockQty">
              Quantité
            </label>
            <input
              id="stockQty"
              name="stockQty"
              className="input"
              type="number"
              inputMode="numeric"
              min={0}
              max={100_000}
              defaultValue={0}
            />
          </div>

          <div>
            <label className="label" htmlFor="lowStockThreshold">
              Seuil d&apos;alerte
            </label>
            <input
              id="lowStockThreshold"
              name="lowStockThreshold"
              className="input"
              type="number"
              inputMode="numeric"
              min={0}
              max={1000}
              defaultValue={3}
            />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="image">
            Photo du produit <span className="font-normal text-slate-400">(facultatif)</span>
          </label>
          <input
            id="image"
            name="image"
            type="file"
            accept="image/*"
            className="input py-2 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-teal-50 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-teal-800"
          />
          <p className="mt-1 text-xs text-slate-500">
            Choisis une photo dans ton téléphone ou prends-la sur place. JPG, PNG, WebP ou GIF,
            5 Mo maximum. Une photo nette augmente nettement les commandes.
          </p>
        </div>

        <div className="space-y-3 rounded-xl border border-slate-200 p-3">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              name="isReservable"
              className="mt-1 size-4 accent-teal-700"
            />
            <span>
              <span className="block text-sm font-semibold">Produit réservable</span>
              <span className="block text-xs text-slate-600">
                Le client choisit un créneau de retrait (repas, article mis de côté...).
              </span>
            </span>
          </label>

          <div>
            <label className="label" htmlFor="pickupNote">
              Note de retrait <span className="font-normal text-slate-400">(facultatif)</span>
            </label>
            <input
              id="pickupNote"
              name="pickupNote"
              className="input"
              maxLength={200}
              placeholder="Retrait à la chambre B214 entre 19h et 21h"
            />
          </div>
        </div>

        <button type="submit" className="btn-primary w-full">
          Publier le produit
        </button>
      </form>
    </div>
  );
}
