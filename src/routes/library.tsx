import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { fetchBenefits } from "@/lib/library";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/library")({
  head: () => ({
    meta: [
      { title: "مكتبتي — الكتب والمؤلفون والموضوعات" },
      {
        name: "description",
        content: "مكتبتك في جعبة الفوائد: كتبك ومؤلفوها وموضوعاتك مع عدد الفوائد لكل منها، وانتقال مباشر إلى فوائدها.",
      },
      { property: "og:title", content: "مكتبتي — جعبة الفوائد" },
      { property: "og:description", content: "استعرض كتبك ومؤلفيك وموضوعاتك وعدد الفوائد في كل منها." },
    ],
  }),
  component: LibraryPage,
});

type Tab = "books" | "authors" | "tags";

function LibraryPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("books");
  const { data: benefits = [], isLoading } = useQuery({
    queryKey: ["benefits"],
    queryFn: fetchBenefits,
    enabled: !!user,
  });

  const groups = useMemo(() => {
    const books = new Map<string, { name: string; author: string | null; count: number }>();
    const authors = new Map<string, number>();
    const tags = new Map<string, number>();
    for (const b of benefits) {
      if (b.book) {
        const entry = books.get(b.book.title) ?? { name: b.book.title, author: b.author?.name ?? null, count: 0 };
        entry.count += 1;
        books.set(b.book.title, entry);
      }
      if (b.author) authors.set(b.author.name, (authors.get(b.author.name) ?? 0) + 1);
      for (const t of b.tags) tags.set(t.name, (tags.get(t.name) ?? 0) + 1);
    }
    return { books: [...books.values()].sort((a, c) => c.count - a.count), authors: [...authors.entries()].sort((a, c) => c[1] - a[1]), tags: [...tags.entries()].sort((a, c) => c[1] - a[1]) };
  }, [benefits]);

  const TABS: { key: Tab; label: string; count: number }[] = [
    { key: "books", label: "الكتب", count: groups.books.length },
    { key: "authors", label: "المؤلفون", count: groups.authors.length },
    { key: "tags", label: "الموضوعات", count: groups.tags.length },
  ];

  return (
    <AppShell>
      <h1 className="font-display text-3xl font-bold">مكتبتي</h1>

      <div className="mt-6 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-full px-5 py-2 text-sm ${tab === t.key ? "bg-foreground text-background" : "bg-muted text-foreground/70"}`}
          >
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="mt-8 text-sm text-muted-foreground">جارٍ التحميل…</p>
      ) : (
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tab === "books" &&
            groups.books.map((b) => (
              <Link
                key={b.name}
                to="/benefits"
                search={{ book: b.name, filter: "all" }}
                className="rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/50"
              >
                <p className="font-display text-lg font-bold">{b.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">{b.author ?? "بدون مؤلف"}</p>
                <p className="mt-3 text-sm text-primary">{b.count} فائدة</p>
              </Link>
            ))}

          {tab === "authors" &&
            groups.authors.map(([name, count]) => (
              <Link
                key={name}
                to="/benefits"
                search={{ author: name, filter: "all" }}
                className="rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/50"
              >
                <p className="font-display text-lg font-bold">{name}</p>
                <p className="mt-3 text-sm text-primary">{count} فائدة</p>
              </Link>
            ))}

          {tab === "tags" &&
            groups.tags.map(([name, count]) => (
              <Link
                key={name}
                to="/benefits"
                search={{ tag: name, filter: "all" }}
                className="rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/50"
              >
                <p className="font-display text-lg font-bold">#{name}</p>
                <p className="mt-3 text-sm text-primary">{count} فائدة</p>
              </Link>
            ))}

          {((tab === "books" && groups.books.length === 0) ||
            (tab === "authors" && groups.authors.length === 0) ||
            (tab === "tags" && groups.tags.length === 0)) && (
            <p className="text-sm text-muted-foreground">لا يوجد شيء هنا بعد.</p>
          )}
        </div>
      )}
    </AppShell>
  );
}
