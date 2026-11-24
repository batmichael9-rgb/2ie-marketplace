export function Stars({
  value,
  count,
  size = "text-sm",
}: {
  value: number;
  count?: number;
  size?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1 ${size}`} aria-label={`${value} sur 5`}>
      <span className="text-amber-500" aria-hidden>
        {[1, 2, 3, 4, 5]
          .map((star) => (value >= star - 0.5 ? "★" : "☆"))
          .join("")}
      </span>
      <span className="text-slate-500 dark:text-slate-400">
        {value > 0 ? value.toFixed(1) : "Pas encore noté"}
        {typeof count === "number" && count > 0 ? ` (${count})` : ""}
      </span>
    </span>
  );
}
