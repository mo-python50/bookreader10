import { Link } from "@tanstack/react-router";
import { arabicDate, type Benefit } from "@/lib/library";

export function BenefitCard({ benefit }: { benefit: Benefit }) {
  return (
    <Link
      to="/benefits/$id"
      params={{ id: benefit.id }}
      className="block rounded-2xl border border-border bg-card p-6 transition-colors hover:border-primary/50"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-xl font-bold leading-snug">{benefit.title}</h3>
        <span className="text-xs text-muted-foreground">{arabicDate(benefit.created_at)}</span>
      </div>
      <p className="quote-text mt-3 line-clamp-4 text-[0.95rem] text-foreground/80">{benefit.text}</p>
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
        {benefit.book && <span>{benefit.book.title}</span>}
        {benefit.author && <span>· {benefit.author.name}</span>}
        {benefit.page_number && <span>· ص {benefit.page_number}</span>}
      </div>
      {benefit.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {benefit.tags.map((t) => (
            <span key={t.id} className="rounded-full bg-muted px-3 py-1 text-xs text-foreground/70">
              #{t.name}
            </span>
          ))}
        </div>
      )}
    </Link>
  );
}
