import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Affiche générique servie à /og-default.png.
 *
 * Elle sert d'aperçu de partage quand un produit n'a pas de photo exploitable ou
 * qu'une boutique n'a ni bannière ni logo.
 */
export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px",
          background: "linear-gradient(135deg, #115e59 0%, #0f766e 55%, #10b981 100%)",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 64,
              height: 64,
              borderRadius: 18,
              background: "white",
              color: "#0f766e",
              fontSize: 26,
              fontWeight: 800,
            }}
          >
            2iE
          </div>
          <div style={{ fontSize: 30, fontWeight: 700 }}>Market</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 66, fontWeight: 800, lineHeight: 1.1, maxWidth: 1000 }}>
            Le commerce du campus, en un clic
          </div>
          <div style={{ fontSize: 32, opacity: 0.9 }}>
            Repas, matériel, téléphones et plus — Institut 2iE
          </div>
        </div>

        <div style={{ fontSize: 26, opacity: 0.85 }}>
          Commande sur 2iE Market · Paiement Mobile Money sécurisé
        </div>
      </div>
    ),
    size,
  );
}
