import {
  Backpack,
  Boxes,
  Briefcase,
  Building2,
  Cable,
  Car,
  CircuitBoard,
  Construction,
  Dumbbell,
  Factory,
  Footprints,
  Forklift,
  Gauge,
  Gem,
  Hammer,
  Handshake,
  Home,
  Lightbulb,
  Mountain,
  Shirt,
  Smartphone,
  Sofa,
  Sparkles,
  Sun,
  Truck,
  WashingMachine,
  Watch,
  Wheat,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";

/**
 * Catalogue de référence des catégories « façon Alibaba ».
 *
 * Ce fichier est la source de vérité : il alimente la barre latérale du
 * catalogue, la grille « Catégories pour vous » et les formulaires produit.
 * Les lignes correspondantes sont créées en base par `ensureCatalogCategories`
 * afin que les produits puissent y être rattachés.
 */
export type CatalogCategory = {
  name: string;
  slug: string;
  icon: LucideIcon;
};

export const CATEGORIES: CatalogCategory[] = [
  { name: "Vêtements & Accessoires", slug: "vetements-accessoires", icon: Shirt },
  { name: "Électronique grand public", slug: "electronique-grand-public", icon: Smartphone },
  { name: "Composants électroniques", slug: "composants-electroniques", icon: CircuitBoard },
  { name: "Instrument & Équipement de test", slug: "instrument-equipement-test", icon: Gauge },
  { name: "Énergies renouvelables", slug: "energies-renouvelables", icon: Sun },
  { name: "Équipements & Fournitures Électriques", slug: "equipements-fournitures-electriques", icon: Zap },
  { name: "Machines de Bâtiment & Construction", slug: "machines-batiment-construction", icon: Construction },
  { name: "Construction & Immobilier", slug: "construction-immobilier", icon: Building2 },
  { name: "Transmission d'énergie", slug: "transmission-energie", icon: Cable },
  { name: "Manutention", slug: "manutention", icon: Forklift },
  { name: "Véhicules & Transport", slug: "vehicules-transport", icon: Truck },
  { name: "Pièces & Accessoires pour véhicules", slug: "pieces-accessoires-vehicules", icon: Car },
  { name: "Fournitures & Outils auto", slug: "fournitures-outils-auto", icon: Wrench },
  { name: "Bricolage & Quincaillerie", slug: "bricolage-quincaillerie", icon: Hammer },
  { name: "Lumière & Éclairage", slug: "lumiere-eclairage", icon: Lightbulb },
  { name: "Électroménager", slug: "electromenager", icon: WashingMachine },
  { name: "Meubles", slug: "meubles", icon: Sofa },
  { name: "Maison & Jardin", slug: "maison-jardin", icon: Home },
  { name: "Chaussures & Accessoires", slug: "chaussures-accessoires", icon: Footprints },
  { name: "Bijoux, Lunettes & Montres", slug: "bijoux-lunettes-montres", icon: Watch },
  { name: "Sports & Loisirs", slug: "sports-loisirs", icon: Dumbbell },
  { name: "Vêtements de sport & Plein air", slug: "vetements-sport-plein-air", icon: Backpack },
  { name: "Produits de beauté", slug: "produits-beaute", icon: Sparkles },
  { name: "Agriculture, Aliments & Boissons", slug: "agriculture-aliments-boissons", icon: Wheat },
  { name: "Matières premières", slug: "matieres-premieres", icon: Boxes },
  { name: "Services de fabrication", slug: "services-fabrication", icon: Factory },
  { name: "Services", slug: "services", icon: Handshake },
];

/** Catégories décoratives conservées pour les icônes de repli. */
const EXTRA_ICONS: Record<string, LucideIcon> = {
  mountain: Mountain,
  gem: Gem,
  briefcase: Briefcase,
};

const CATEGORY_BY_SLUG = new Map(CATEGORIES.map((category) => [category.slug, category]));

export function findCategory(slug: string | null | undefined): CatalogCategory | undefined {
  if (!slug) return undefined;
  return CATEGORY_BY_SLUG.get(slug);
}

export function categoryIcon(slug: string | null | undefined): LucideIcon | null {
  const category = findCategory(slug);
  if (category) return category.icon;
  return slug ? (EXTRA_ICONS[slug] ?? null) : null;
}
