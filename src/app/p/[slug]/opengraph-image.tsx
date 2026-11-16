import { ImageResponse } from "next/og";
import { db } from "@/lib/db";
import { formatXof } from "@/lib/money";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Aperçu du produit sur 2iE Market";

/**
 * Aperçu affiché par WhatsApp quand un vendeur partage /p/<slug>.
 * Sans image, un lien WhatsApp ressemble à une URL nue : l'aperçu est ce qui
 * déclenche le clic.
 */
export default async function OpenGraphImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await db.product.findUnique({
    where: { slug },
    include: { vendor: { select: { shopName: true } } },
  });

  const name = product?.name ?? "2iE Market";
  const price = product ? formatXof(product.priceXof) : "Le commerce du campus";
  const shop = product?.vendor.shopName ?? "Institut 2iE";

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
          <div style={{ fontSize: 62, fontWeight: 800, lineHeight: 1.1, maxWidth: 1000 }}>
            {name}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            <div
              style={{
                fontSize: 46,
                fontWeight: 800,
                background: "rgba(255,255,255,0.18)",
                padding: "10px 28px",
                borderRadius: 999,
              }}
            >
              {price}
            </div>
            <div style={{ fontSize: 32, opacity: 0.9 }}>{shop}</div>
          </div>
        </div>

        <div style={{ fontSize: 26, opacity: 0.85 }}>
          Commande sur 2iE Market · Paiement à la remise · Campus 2iE
        </div>
      </div>
    ),
    size,
  );
}
