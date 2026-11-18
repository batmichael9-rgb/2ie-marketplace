import { campusBadgeLabel } from "@/lib/domain";

/**
 * Badge de localisation du vendeur affiché aux clients :
 * « 📍 2iE Ouagadougou » ou « 📍 2iE Kamboinsé ».
 */
export function CampusBadge({
  campus,
  className = "",
}: {
  campus: string | null | undefined;
  className?: string;
}) {
  const label = campusBadgeLabel(campus);
  if (!label) return null;

  return (
    <span className={`badge bg-teal-50 text-teal-800 ${className}`.trim()}>{label}</span>
  );
}
