import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const db = new PrismaClient();

const categories = [
  { name: "Repas", slug: "repas", icon: "🍲", position: 1 },
  { name: "Matériel scolaire", slug: "materiel-scolaire", icon: "✏️", position: 2 },
  { name: "Téléphones", slug: "telephones", icon: "📱", position: 3 },
  { name: "Informatique", slug: "informatique", icon: "💻", position: 4 },
  { name: "Mode", slug: "mode", icon: "👕", position: 5 },
  { name: "Beauté & parfums", slug: "beaute", icon: "🧴", position: 6 },
];

// Garde-fou production : un seed complet crée des comptes de démonstration
// avec des mots de passe connus. Il est donc interdit en production sauf
// autorisation explicite via ALLOW_PROD_SEED=true ; même autorisé, il ne crée
// que les catégories, jamais de comptes.
const isProduction = process.env.NODE_ENV === "production";
const allowProdSeed = process.env.ALLOW_PROD_SEED === "true";

if (isProduction && !allowProdSeed) {
  console.error(
    "Refus de seed : NODE_ENV=production. Définissez ALLOW_PROD_SEED=true pour " +
      "autoriser explicitement l'opération (seules les catégories seront créées).",
  );
  process.exit(1);
}

// `--categories-only` restaure les catégories sans recréer les vendeurs,
// produits ni le client de démonstration. En production, seules les
// catégories sont autorisées, même avec ALLOW_PROD_SEED=true.
const categoriesOnly = process.argv.includes("--categories-only") || isProduction;

type SeedProduct = {
  slug: string;
  name: string;
  description: string;
  priceXof: number;
  stockMode?: "TRACKED" | "UNLIMITED" | "OUT_OF_STOCK";
  stockQty?: number;
  lowStockThreshold?: number;
  isReservable?: boolean;
  pickupNote?: string;
  image: string;
  categorySlug: string;
};

const vendors: Array<{
  email: string;
  phone: string;
  fullName: string;
  password: string;
  shopName: string;
  slug: string;
  description: string;
  roomNumber: string | null;
  momoNumber: string;
  momoOperator: string;
  products: SeedProduct[];
}> = [
  {
    email: "fatou.ouedraogo@2ie-edu.org",
    phone: "+22670112233",
    fullName: "Fatou Ouédraogo",
    password: "Demo2024!",
    shopName: "Chez Fatou",
    slug: "chez-fatou",
    description: "Repas maison et en-cas, préparés sur le campus. Commande la veille, retrait le soir.",
    roomNumber: "Bât. B, ch. 214",
    momoNumber: "+22670112233",
    momoOperator: "ORANGE_MONEY",
    products: [
      {
        slug: "cahier-300-pages",
        name: "Cahier 300 pages (grand format)",
        description:
          "Couverture rigide, papier 80 g. Vendu à l'unité, parfait pour les cours magistraux.",
        priceXof: 1200,
        stockMode: "UNLIMITED",
        image: "/produits/cahier.svg",
        categorySlug: "fournitures-scolaires",
      },
      {
        slug: "bloc-notes-a4",
        name: "Bloc-notes A4 (100 feuilles)",
        description: "Bloc de papier ligné A4, perforé. Idéal pour prendre des notes en cours.",
        priceXof: 800,
        stockMode: "TRACKED",
        stockQty: 15,
        lowStockThreshold: 5,
        image: "/produits/cahier.svg",
        categorySlug: "fournitures-scolaires",
      },
      {
        slug: "sachet-jus-bissap",
        name: "Jus de bissap (50 cl)",
        description: "Bissap frais, peu sucré, préparé le matin. Servi dans une bouteille réutilisable.",
        priceXof: 300,
        stockMode: "UNLIMITED",
        image: "/produits/bissap.svg",
        categorySlug: "alimentation-divers",
      },
    ],
  },
  {
    email: "ibrahim.kore@2ie-edu.org",
    phone: "+22676554433",
    fullName: "Ibrahim Korè",
    password: "Demo2024!",
    shopName: "Tech Korè",
    slug: "tech-kore",
    description: "High-Tech et accessoires testés. Garantie 7 jours sur place.",
    roomNumber: null,
    momoNumber: "+22676554433",
    momoOperator: "MOOV_MONEY",
    products: [
      {
        slug: "cle-usb-32go",
        name: "Clé USB 32 Go",
        description: "USB 3.0, neuve, sous blister. Parfaite pour les TP et les rendus de rapports.",
        priceXof: 3500,
        stockMode: "TRACKED",
        stockQty: 8,
        lowStockThreshold: 3,
        image: "/produits/cle-usb.svg",
        categorySlug: "high-tech",
      },
      {
        slug: "ecouteurs-bluetooth",
        name: "Écouteurs Bluetooth sans fil",
        description: "Autonomie 6h, micro intégré, compatibles tous smartphones. Boîte de charge incluse.",
        priceXof: 12000,
        stockMode: "TRACKED",
        stockQty: 3,
        lowStockThreshold: 2,
        image: "/produits/telephone.svg",
        categorySlug: "high-tech",
      },
      {
        slug: "pochette-ordinateur-15",
        name: "Pochette ordinateur 15 pouces",
        description: "Protection matelassée, poche extérieure pour chargeur et câbles. Résistante à l'eau.",
        priceXof: 7500,
        stockMode: "TRACKED",
        stockQty: 5,
        lowStockThreshold: 2,
        image: "/produits/ordinateur.svg",
        categorySlug: "high-tech",
      },
    ],
  },
  {
    email: "awa.sawadogo@2ie-edu.org",
    phone: "+22671223344",
    fullName: "Awa Sawadogo",
    password: "Demo2024!",
    shopName: "Awa Style",
    slug: "awa-style",
    description: "Vêtements et mode locale. Livraison chambre à chambre sur le campus.",
    roomNumber: "Bât. F, ch. 108",
    momoNumber: "+22671223344",
    momoOperator: "ORANGE_MONEY",
    products: [
      {
        slug: "chemise-faso-dan-fani",
        name: "Chemise Faso Dan Fani",
        description: "Tissu local tissé main, coupe droite, tailles M à XL. Pièce unique.",
        priceXof: 12500,
        stockMode: "TRACKED",
        stockQty: 4,
        lowStockThreshold: 3,
        image: "/produits/chemise.svg",
        categorySlug: "vetements-mode",
      },
      {
        slug: "tshirt-2ie",
        name: "T-shirt 2iE officiel",
        description: "T-shirt en coton, logo 2iE brodé. Tailles S à XXL disponibles.",
        priceXof: 5000,
        stockMode: "TRACKED",
        stockQty: 10,
        lowStockThreshold: 3,
        image: "/produits/chemise.svg",
        categorySlug: "vetements-mode",
      },
      {
        slug: "tenue-locale-femme",
        name: "Ensemble complet tenue locale (femme)",
        description: "Pagne tissé + haut assorti. Fait sur mesure, délai 3 jours.",
        priceXof: 25000,
        stockMode: "TRACKED",
        stockQty: 2,
        lowStockThreshold: 1,
        isReservable: true,
        pickupNote: "Sur mesure - confirmer les mensurations par WhatsApp",
        image: "/produits/chemise.svg",
        categorySlug: "vetements-mode",
      },
    ],
  },
];

async function main() {
  console.log("→ Catégories");
  for (const category of categories) {
    await db.category.upsert({
      where: { slug: category.slug },
      update: { name: category.name, icon: category.icon, position: category.position },
      create: category,
    });
  }

  if (categoriesOnly) {
    console.log("✓ Catégories restaurées (vendeurs, produits et client démo ignorés).");
    return;
  }

  for (const vendor of vendors) {
    console.log(`→ Vendeur ${vendor.shopName}`);

    const hashedPassword = await hash(vendor.password, 10);

    const user = await db.user.upsert({
      where: { email: vendor.email },
      update: { fullName: vendor.fullName, phone: vendor.phone, role: "VENDOR", password: hashedPassword },
      create: {
        email: vendor.email,
        phone: vendor.phone,
        password: hashedPassword,
        fullName: vendor.fullName,
        role: "VENDOR",
        campusRoom: vendor.roomNumber,
      },
    });

    const profile = await db.vendorProfile.upsert({
      where: { slug: vendor.slug },
      update: {
        shopName: vendor.shopName,
        description: vendor.description,
        roomNumber: vendor.roomNumber,
        momoNumber: vendor.momoNumber,
        momoOperator: vendor.momoOperator,
        isVerified: true,
      },
      create: {
        userId: user.id,
        shopName: vendor.shopName,
        slug: vendor.slug,
        description: vendor.description,
        roomNumber: vendor.roomNumber,
        momoNumber: vendor.momoNumber,
        momoOperator: vendor.momoOperator,
        isVerified: true,
      },
    });

    for (const product of vendor.products) {
      const category = await db.category.findUnique({ where: { slug: product.categorySlug } });
      const data = {
        vendorId: profile.id,
        categoryId: category?.id,
        name: product.name,
        slug: product.slug,
        description: product.description,
        priceXof: product.priceXof,
        stockMode: product.stockMode ?? "TRACKED",
        stockQty: product.stockQty ?? 0,
        lowStockThreshold: product.lowStockThreshold ?? 3,
        isReservable: product.isReservable ?? false,
        pickupNote: product.pickupNote,
      };

      await db.product.upsert({
        where: { slug: product.slug },
        update: data,
        create: {
          ...data,
          images: { create: [{ url: product.image, position: 0 }] },
        },
      });
    }
  }

  console.log("→ Client de démonstration");
  const clientPassword = await hash("Client2024!", 10);
  await db.user.upsert({
    where: { email: "etudiant@2ie.bf" },
    update: { password: clientPassword },
    create: {
      email: "etudiant@2ie.bf",
      phone: "+22670000000",
      password: clientPassword,
      fullName: "Étudiant Démo",
      role: "CLIENT",
      campusRoom: "Bât. A, ch. 101",
    },
  });

  console.log("✓ Base de données initialisée (jeu de démonstration local).");
  console.log("  Créez vos comptes via /inscription.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
