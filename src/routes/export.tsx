import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import {
  benefitsToCsv,
  benefitsToNotionMarkdown,
  downloadFile,
  fetchBenefits,
  fetchFlashcards,
  flashcardsToAnkiCsv,
} from "@/lib/library";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/export")({
  head: () => ({
    meta: [
      { title: "التصدير — جعبة الفوائد" },
      {
        name: "description",
        content: "صدّر فوائدك إلى CSV أو Excel أو Notion أو Anki: كل الفوائد أو مجموعة مختارة أو فوائد كتاب أو مؤلف أو موضوع.",
      },
      { property: "og:title", content: "التصدير — جعبة الفوائد" },
      { property: "og:description", content: "تصدير مرن لفوائدك: CSV، Excel، Notion، Anki." },
    ],
  }),
  component: ExportPage,
});

function ExportPage() {
  const { user } = useAuth();
  const [scope, setScope] = useState<{ type: "all" | "book" | "author" | "tag"; value?: string }>({ type: "all" });
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: benefits = [] } = useQuery({ queryKey: ["benefits"], queryFn: fetchBenefits, enabled: !!user });
  const { data: cards = [] } = useQuery({ queryKey: ["flashcards"], queryFn: fetchFlashcards, enabled: !!user });

  const books = Array.from(new Set(benefits.map((b) => b.book?.title).filter(Boolean))) as string[];
  const authors = Array.from(new Set(benefits.map((b) => b.author?.name).filter(Boolean))) as string[];
  const tags = Array.from(new Set(benefits.flatMap((b) => b.tags.map((t) => t.name))));

  const scoped = useMemo(() => {
    if (selected.size > 0) return benefits.filter((b) => selected.has(b.id));
    if (scope.type === "book") return benefits.filter((b) => b.book?.title === scope.value);
    if (scope.type === "author") return benefits.filter((b) => b.author?.name === scope.value);
    if (scope.type === "tag") return benefits.filter((b) => b.tags.some((t) => t.name === scope.value));
    return benefits;
  }, [benefits, scope, selected]);

  function guard() {
    if (scoped.length === 0) {
      toast.error("لا توجد فوائد في النطاق المحدد.");
      return false;
    }
    return true;
  }

  const inputClass =
    "w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-primary";

  return (
    <AppShell>
      <h1 className="font-display text-3xl font-bold">التصدير</h1>
      <p className="mt-2 text-sm text-muted-foreground">{scoped.length} فائدة في النطاق المحدد</p>

      <section className="mt-7 space-y-5 rounded-3xl border border-border bg-card p-7">
        <div className="flex flex-wrap gap-2 text-sm">
          {[
            { key: "all", label: "كل الفوائد" },
            { key: "book", label: "كتاب معيّن" },
            { key: "author", label: "مؤلف معيّن" },
            { key: "tag", label: "موضوع معيّن" },
          ].map((s) => (
            <button
              key={s.key}
              onClick={() => setScope({ type: s.key as "all" })}
              className={`rounded-full px-5 py-2 ${scope.type === s.key ? "bg-foreground text-background" : "bg-muted text-foreground/70"}`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {scope.type !== "all" && (
          <select
            value={scope.value ?? ""}
            onChange={(e) => setScope((prev) => ({ ...prev, value: e.target.value }))}
            className={inputClass}
          >
            <option value="">اختر…</option>
            {(scope.type === "book" ? books : scope.type === "author" ? authors : tags).map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        )}

        <div className="border-t border-border pt-5">
          <p className="mb-3 text-sm">أو اختر فوائد محددة ({selected.size})</p>
          <div className="max-h-64 space-y-2 overflow-y-auto pl-1">
            {benefits.map((b) => (
              <label key={b.id} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selected.has(b.id)}
                  onChange={(e) =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(b.id);
                      else next.delete(b.id);
                      return next;
                    })
                  }
                  className="mt-1"
                />
                <span>
                  {b.title}
                  <span className="text-muted-foreground"> — {b.book?.title ?? "بدون كتاب"}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-3 sm:grid-cols-2">
        {[
          {
            label: "CSV",
            body: "ملف نصي متوافق مع أي جدول بيانات",
            run: () => guard() && downloadFile("benefits.csv", benefitsToCsv(scoped), "text/csv"),
          },
          {
            label: "Excel (CSV بترميز UTF-8)",
            body: "يُفتح مباشرة في Excel مع دعم العربية",
            run: () => guard() && downloadFile("benefits-excel.csv", benefitsToCsv(scoped), "text/csv"),
          },
          {
            label: "Notion (Markdown)",
            body: "بنية جاهزة للاستيراد في Notion",
            run: () => guard() && downloadFile("benefits-notion.md", benefitsToNotionMarkdown(scoped), "text/markdown"),
          },
          {
            label: "Anki (CSV)",
            body: `${cards.length} بطاقة مراجعة`,
            run: () =>
              cards.length === 0
                ? toast.error("لا بطاقات مراجعة للتصدير.")
                : downloadFile("anki-benefits.csv", flashcardsToAnkiCsv(cards), "text/csv"),
          },
        ].map((x) => (
          <button
            key={x.label}
            onClick={x.run}
            className="rounded-2xl border border-border bg-card p-6 text-right transition-colors hover:border-primary/50"
          >
            <p className="font-display text-lg font-bold">{x.label}</p>
            <p className="mt-1 text-sm text-muted-foreground">{x.body}</p>
          </button>
        ))}
      </section>
    </AppShell>
  );
}
