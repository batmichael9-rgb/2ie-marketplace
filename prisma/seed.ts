import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const categories = [
  { name: "Repas", slug: "repas", icon: "🍲", position: 1 },
  { name: "Matériel scolaire", slug: "materiel-scolaire", icon: "✏️", position: 2 },
  { name: "Téléphones", slug: "telephones", icon: "📱", position: 3 },
  { name: "Informatique", slug: "informatique", icon: "💻", position: 4 },
  { name: "Mode", slug: "mode", icon: "👕", position: 5 },
  { name: "Beauté & parfums", slug: "beaute", icon: "🧴", position: 6 },
];

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
  shopName: string;
  slug: string;
  description: string;
  roomNumber: string | null;
  momoNumber: string;
  momoOperator: string;
  products: SeedProduct[];
}> = [
  {
    email: "fatou@2ie-edu.org",
    phone: "+22670112233",
    fullName: "Fatou Ouédraogo",
    shopName: "Chez Fatou",
    slug: "chez-fatou",
    description: "Repas maison et en-cas, préparés sur le campus. Commande la veille, retrait le soir.",
    roomNumber: "Bât. B, ch. 214",
    momoNumber: "+22670112233",
    momoOperator: "ORANGE_MONEY",
    products: [
      {
        slug: "caracolo-soir",
        name: "Caracolo du soir (portion)",
        description:
          "Attiéké, thon, tomate et piment maison. Préparation quotidienne à partir de 18h. Réservation obligatoire avant 16h.",
        priceXof: 500,
        stockMode: "TRACKED",
        stockQty: 12,
        lowStockThreshold: 3,
        isReservable: true,
        pickupNote: "Retrait à la chambre B214 entre 19h et 21h",
        image: "/produits/caracolo.svg",
        categorySlug: "repas",
      },
      {
        slug: "riz-gras-poulet",
        name: "Riz gras + poulet",
        description: "Riz gras, cuisse de poulet braisée, salade fraîche. Portion généreuse.",
        priceXof: 1500,
        stockMode: "TRACKED",
        stockQty: 2,
        lowStockThreshold: 3,
        isReservable: true,
        pickupNote: "Retrait B214 à partir de 12h",
        image: "/produits/riz.svg",
        categorySlug: "repas",
      },
      {
        slug: "sachet-jus-bissap",
        name: "Jus de bissap (50 cl)",
        description: "Bissap frais, peu sucré, préparé le matin. Servi dans une bouteille réutilisable.",
        priceXof: 300,
        stockMode: "UNLIMITED",
        image: "/produits/bissap.svg",
        categorySlug: "repas",
      },
    ],
  },
  {
    email: "kore@2ie-edu.org",
    phone: "+22676554433",
    fullName: "Ibrahim Korè",
    shopName: "Tech Korè",
    slug: "tech-kore",
    description: "Téléphones, ordinateurs et accessoires testés. Garantie 7 jours sur place.",
    roomNumber: null,
    momoNumber: "+22676554433",
    momoOperator: "MOOV_MONEY",
    products: [
      {
        slug: "tecno-spark-20",
        name: "Tecno Spark 20 (128 Go)",
        description: "Occasion en très bon état, batterie saine, écran sans rayure. Chargeur inclus.",
        priceXof: 62000,
        stockMode: "TRACKED",
        stockQty: 1,
        lowStockThreshold: 2,
        image: "/produits/telephone.svg",
        categorySlug: "telephones",
      },
      {
        slug: "hp-elitebook-840",
        name: "HP EliteBook 840 G5",
        description: "i5 8e génération, 8 Go RAM, SSD 256 Go. Idéal pour la CAO et les TP. Windows 11 installé.",
        priceXof: 185000,
        stockMode: "TRACKED",
        stockQty: 3,
        lowStockThreshold: 2,
        isReservable: true,
        pickupNote: "Test possible avant achat, sur rendez-vous",
        image: "/produits/ordinateur.svg",
        categorySlug: "informatique",
      },
      {
        slug: "cle-usb-32go",
        name: "Clé USB 32 Go",
        description: "USB 3.0, neuve, sous blister. Parfaite pour les TP et les rendus de rapports.",
        priceXof: 3500,
        stockMode: "TRACKED",
        stockQty: 0,
        lowStockThreshold: 3,
        image: "/produits/cle-usb.svg",
        categorySlug: "informatique",
      },
    ],
  },
  {
    email: "awa@2ie-edu.org",
    phone: "+22671223344",
    fullName: "Awa Sawadogo",
    shopName: "Awa Style",
    slug: "awa-style",
    description: "Vêtements, chaussures et parfums. Livraison chambre à chambre sur le campus.",
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
        categorySlug: "mode",
      },
      {
        slug: "parfum-oud-50ml",
        name: "Parfum Oud intense (50 ml)",
        description: "Eau de parfum orientale, tenue longue durée. Flacon scellé.",
        priceXof: 8500,
        stockMode: "TRACKED",
        stockQty: 5,
        lowStockThreshold: 2,
        image: "/produits/parfum.svg",
        categorySlug: "beaute",
      },
      {
        slug: "cahier-300-pages",
        name: "Cahier 300 pages (grand format)",
        description: "Couverture rigide, papier 80 g. Vendu à l'unité, parfait pour les cours magistraux.",
        priceXof: 1200,
        stockMode: "UNLIMITED",
        image: "/produits/cahier.svg",
        categorySlug: "materiel-scolaire",
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

  for (const vendor of vendors) {
    console.log(`→ Vendeur ${vendor.shopName}`);

    const user = await db.user.upsert({
      where: { email: vendor.email },
      update: { fullName: vendor.fullName, phone: vendor.phone, role: "VENDOR" },
      create: {
        email: vendor.email,
        phone: vendor.phone,
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
  await db.user.upsert({
    where: { email: "etudiant@2ie.bf" },
    update: {},
    create: {
      email: "etudiant@2ie.bf",
      phone: "+22670000000",
      fullName: "Étudiant Démo",
      role: "CLIENT",
      campusRoom: "Bât. A, ch. 101",
    },
  });

  console.log("✓ Base de données initialisée");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
