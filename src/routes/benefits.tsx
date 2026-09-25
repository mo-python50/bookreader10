import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { BenefitCard } from "@/components/BenefitCard";
import { fetchBenefits, type Benefit } from "@/lib/library";
import { useAuth } from "@/hooks/useAuth";

type Filter = "all" | "books" | "authors" | "tags" | "titles" | "text";

type Search = {
  q: string | undefined;
  filter: Filter;
  book: string | undefined;
  author: string | undefined;
  tag: string | undefined;
};

const FILTER_KEYS = ["all", "books", "authors", "tags", "titles", "text"] as const;

export const Route = createFileRoute("/benefits")({
  validateSearch: (search: Record<string, unknown>): Search => {
    const str = (key: string) => (typeof search[key] === "string" ? (search[key] as string) : undefined);
    const filter = str("filter");
    return {
      q: str("q"),
      filter: FILTER_KEYS.includes(filter as Filter) ? (filter as Filter) : "all",
      book: str("book"),
      author: str("author"),
      tag: str("tag"),
    };
  },
  head: () => ({
    meta: [
      { title: "الفوائد — البحث في جعبتك" },
      {
        name: "description",
        content: "ابحث في فوائدك المحفوظة بالعنوان أو النص أو الكتاب أو المؤلف أو الموضوع، مع إمكانية دمج المرشّحات.",
      },
      { property: "og:title", content: "الفوائد — البحث في جعبتك" },
      { property: "og:description", content: "بحث ومرشّحات مركّبة في كل فوائدك المحفوظة." },
    ],
  }),
  component: BenefitsPage,
});

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "الكل" },
  { key: "titles", label: "العناوين" },
  { key: "text", label: "النصوص" },
  { key: "books", label: "الكتب" },
  { key: "authors", label: "المؤلفون" },
  { key: "tags", label: "الموضوعات" },
];

function matches(b: Benefit, needle: string, filter: Filter) {
  const n = needle.trim();
  if (!n) return true;
  const inTitle = b.title.includes(n);
  const inText = b.text.includes(n);
  const inBook = (b.book?.title ?? "").includes(n);
  const inAuthor = (b.author?.name ?? "").includes(n);
  const inTags = b.tags.some((t) => t.name.includes(n));
  const inPage = (b.page_number ?? "").includes(n);
  switch (filter) {
    case "titles":
      return inTitle;
    case "text":
      return inText;
    case "books":
      return inBook;
    case "authors":
      return inAuthor;
    case "tags":
      return inTags;
    default:
      return inTitle || inText || inBook || inAuthor || inTags || inPage;
  }
}

function BenefitsPage() {
  const { user } = useAuth();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [q, setQ] = useState(search.q ?? "");
  const filter = search.filter ?? "all";

  const { data: benefits = [], isLoading } = useQuery({
    queryKey: ["benefits"],
    queryFn: fetchBenefits,
    enabled: !!user,
  });

  const results = useMemo(
    () =>
      benefits.filter(
        (b) =>
          matches(b, q, filter) &&
          (!search.book || b.book?.title === search.book) &&
          (!search.author || b.author?.name === search.author) &&
          (!search.tag || b.tags.some((t) => t.name === search.tag)),
      ),
    [benefits, q, filter, search.book, search.author, search.tag],
  );

  const activeChips = [
    search.book ? { label: `كتاب: ${search.book}`, key: "book" as const } : null,
    search.author ? { label: `مؤلف: ${search.author}`, key: "author" as const } : null,
    search.tag ? { label: `موضوع: #${search.tag}`, key: "tag" as const } : null,
  ].filter(Boolean) as { label: string; key: "book" | "author" | "tag" }[];

  return (
    <AppShell>
      <h1 className="font-display text-3xl font-bold">الفوائد</h1>
      <p className="mt-2 text-sm text-muted-foreground">{results.length} فائدة</p>

      <div className="mt-6 rounded-3xl border border-border bg-card p-5">
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            navigate({ search: (prev) => ({ ...prev, q: e.target.value || undefined }) });
          }}
          placeholder="ابحث…"
          className="w-full rounded-full border border-input bg-background px-6 py-3 text-sm outline-none focus:border-primary"
        />
        <div className="mt-4 flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => navigate({ search: (prev) => ({ ...prev, filter: f.key }) })}
              className={`rounded-full px-4 py-1.5 text-xs transition-colors ${
                filter === f.key ? "bg-foreground text-background" : "bg-muted text-foreground/70 hover:bg-secondary"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        {activeChips.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
            {activeChips.map((c) => (
              <button
                key={c.key}
                onClick={() => navigate({ search: (prev) => ({ ...prev, [c.key]: undefined }) })}
                className="rounded-full bg-primary/12 px-4 py-1.5 text-xs text-primary"
              >
                {c.label} ✕
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>
        ) : results.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا نتائج مطابقة.</p>
        ) : (
          results.map((b) => <BenefitCard key={b.id} benefit={b} />)
        )}
      </div>
    </AppShell>
  );
}
