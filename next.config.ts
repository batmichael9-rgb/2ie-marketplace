import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Les photos produits sont stockées comme URLs distantes (Cloudinary, Supabase Storage...).
  // On garde des <img> natifs tant que l'hébergement d'images n'est pas figé.
  serverExternalPackages: ["@prisma/client"],
  // Les photos produits passent par une Server Action : la limite par défaut
  // (1 Mo) est trop basse pour une photo de téléphone (5 Mo max).
  experimental: {
    serverActions: {
      bodySizeLimit: "6mb",
    },
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
};

export default nextConfig;
