import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Les photos produits sont stockées comme URLs distantes (Cloudinary, Supabase Storage...).
  // On garde des <img> natifs tant que l'hébergement d'images n'est pas figé.
  serverExternalPackages: ["@prisma/client"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
};

export default nextConfig;
