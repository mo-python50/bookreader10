import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { BenefitCard } from "@/components/BenefitCard";
import { fetchBenefits } from "@/lib/library";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "جعبة الفوائد — لوحة مكتبتك" },
      {
        name: "description",
        content: "لوحة جعبة الفوائد: ابحث في فوائدك، أضف فائدة جديدة من صورة صفحة، وتابع كتبك ومؤلفيك وموضوعاتك.",
      },
      { property: "og:title", content: "جعبة الفوائد — لوحة مكتبتك" },
      { property: "og:description", content: "بحث سريع في فوائدك، أحدث الإضافات، والكتب والمؤلفون والموضوعات." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const { data: benefits = [], isLoading } = useQuery({
    queryKey: ["benefits"],
    queryFn: fetchBenefits,
    enabled: !!user,
  });

  const stats = useMemo(() => {
    const books = new Set(benefits.map((b) => b.book?.id).filter(Boolean));
    const authors = new Set(benefits.map((b) => b.author?.id).filter(Boolean));
    const tags = new Set(benefits.flatMap((b) => b.tags.map((t) => t.id)));
    return { benefits: benefits.length, books: books.size, authors: authors.size, tags: tags.size };
  }, [benefits]);

  return (
    <AppShell>
      <section className="rounded-3xl bg-foreground px-6 py-10 text-background sm:px-10">
        <p className="text-sm text-background/60">جعبتك اليوم</p>
        <h1 className="mt-2 font-display text-3xl font-bold leading-snug sm:text-4xl">
          كل فائدة قرأتها، في مكان واحد
        </h1>
        <form
          className="mt-7 flex flex-col gap-3 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            navigate({ to: "/benefits", search: { q, filter: "all" } });
          }}
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ابحث في العناوين، النصوص، الكتب، المؤلفين، الموضوعات…"
            className="flex-1 rounded-full bg-background/10 px-6 py-3.5 text-sm text-background outline-none ring-1 ring-background/15 placeholder:text-background/50 focus:ring-primary"
          />
          <button className="rounded-full bg-primary px-7 py-3.5 text-sm font-medium text-primary-foreground">
            بحث
          </button>
        </form>

        <div className="mt-8 grid grid-cols-2 gap-6 sm:grid-cols-4">
          {[
            { label: "فائدة", value: stats.benefits },
            { label: "كتاب", value: stats.books },
            { label: "مؤلف", value: stats.authors },
            { label: "موضوع", value: stats.tags },
          ].map((s) => (
            <div key={s.label}>
              <p className="font-display text-3xl font-bold text-primary">{s.value}</p>
              <p className="mt-1 text-xs text-background/60">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8 grid gap-4 sm:grid-cols-3">
        {[
          { to: "/add", title: "إضافة فائدة", body: "صوّر صفحة الكتاب واستخرج نصها" },
          { to: "/library", title: "مكتبتي", body: "الكتب والمؤلفون والموضوعات" },
          { to: "/flashcards", title: "بطاقات المراجعة", body: "حوّل فوائدك إلى أسئلة" },
        ].map((c) => (
          <Link
            key={c.to}
            to={c.to}
            className="rounded-2xl border border-border bg-card p-6 transition-colors hover:border-primary/50"
          >
            <h2 className="font-display text-xl font-bold">{c.title}</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">{c.body}</p>
          </Link>
        ))}
      </section>

      <section className="mt-12">
        <div className="mb-5 flex items-baseline justify-between">
          <h2 className="font-display text-2xl font-bold">أحدث الفوائد</h2>
          <Link to="/benefits" className="text-sm text-muted-foreground hover:text-foreground">
            عرض الكل
          </Link>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>
        ) : benefits.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
            <p className="font-display text-xl">جعبتك فارغة بعد</p>
            <p className="mt-2 text-sm text-muted-foreground">
              أضف أول فائدة بتصوير صفحة من كتاب، وسنستخرج نصها لتراجعه وتحفظه.
            </p>
            <Link
              to="/add"
              className="mt-5 inline-block rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground"
            >
              إضافة فائدة
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {benefits.slice(0, 6).map((b) => (
              <BenefitCard key={b.id} benefit={b} />
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}
