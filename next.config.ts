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
  // En-têtes de sécurité HTTP appliqués à toutes les réponses.
  //
  // La CSP autorise l'inline indispensable au bootstrap Next et au script de
  // thème du layout ; les images distantes (Supabase Storage) restent permises.
  // `unsafe-eval` n'est ajouté qu'en développement (Fast Refresh).
  async headers() {
    const isDev = process.env.NODE_ENV !== "production";
    const csp = [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https: wss:",
      "media-src 'self' https:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self' https:",
      "frame-ancestors 'none'",
      ...(isDev ? [] : ["upgrade-insecure-requests"]),
    ].join("; ");

    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
          },
          ...(isDev
            ? []
            : [
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=63072000; includeSubDomains; preload",
                },
              ]),
        ],
      },
    ];
  },
};

export default nextConfig;
