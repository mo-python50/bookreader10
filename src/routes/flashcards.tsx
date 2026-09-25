import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { downloadFile, fetchFlashcards, flashcardsToAnkiCsv, type Flashcard } from "@/lib/library";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/flashcards")({
  head: () => ({
    meta: [
      { title: "بطاقات المراجعة — جعبة الفوائد" },
      {
        name: "description",
        content: "بطاقات المراجعة المبنية على فوائدك: عدّل السؤال والجواب، جمّعها في مجموعات، وصدّرها إلى Anki بصيغة CSV.",
      },
      { property: "og:title", content: "بطاقات المراجعة — جعبة الفوائد" },
      { property: "og:description", content: "حوّل فوائدك إلى أسئلة مراجعة قابلة للتصدير إلى Anki." },
    ],
  }),
  component: FlashcardsPage,
});

function FlashcardsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Flashcard | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [deck, setDeck] = useState("");

  const { data: cards = [], isLoading } = useQuery({
    queryKey: ["flashcards"],
    queryFn: fetchFlashcards,
    enabled: !!user,
  });

  const decks = Array.from(new Set(cards.map((c) => c.deck ?? "جعبة الفوائد")));

  function startEdit(card: Flashcard) {
    setEditing(card);
    setQuestion(card.question);
    setAnswer(card.answer);
    setDeck(card.deck ?? "");
  }

  async function saveEdit() {
    if (!editing) return;
    const { error } = await supabase
      .from("flashcards")
      .update({ question: question.trim(), answer: answer.trim(), deck: deck.trim() || null })
      .eq("id", editing.id);
    if (error) {
      toast.error("تعذّر الحفظ.");
      return;
    }
    await qc.invalidateQueries({ queryKey: ["flashcards"] });
    setEditing(null);
    toast.success("تم تحديث البطاقة");
  }

  async function remove(id: string) {
    if (!confirm("حذف هذه البطاقة؟")) return;
    const { error } = await supabase.from("flashcards").delete().eq("id", id);
    if (error) {
      toast.error("تعذّر الحذف.");
      return;
    }
    await qc.invalidateQueries({ queryKey: ["flashcards"] });
  }

  const inputClass =
    "w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-primary";

  return (
    <AppShell>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold">بطاقات المراجعة</h1>
          <p className="mt-2 text-sm text-muted-foreground">{cards.length} بطاقة في {decks.length} مجموعة</p>
        </div>
        {cards.length > 0 && (
          <button
            onClick={() => downloadFile("anki-benefits.csv", flashcardsToAnkiCsv(cards), "text/csv")}
            className="rounded-full bg-foreground px-6 py-2.5 text-sm text-background"
          >
            تصدير إلى Anki (CSV)
          </button>
        )}
      </div>

      {isLoading ? (
        <p className="mt-8 text-sm text-muted-foreground">جارٍ التحميل…</p>
      ) : cards.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          لا بطاقات بعد. افتح أي فائدة واختر «تحويل إلى بطاقة مراجعة».
        </div>
      ) : (
        <div className="mt-8 space-y-8">
          {decks.map((d) => (
            <section key={d}>
              <h2 className="mb-3 font-display text-xl font-bold">{d}</h2>
              <div className="grid gap-3 md:grid-cols-2">
                {cards
                  .filter((c) => (c.deck ?? "جعبة الفوائد") === d)
                  .map((c) => (
                    <div key={c.id} className="rounded-2xl border border-border bg-card p-5">
                      {editing?.id === c.id ? (
                        <div className="space-y-3">
                          <input value={question} onChange={(e) => setQuestion(e.target.value)} className={inputClass} />
                          <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={5} className={inputClass} />
                          <input
                            value={deck}
                            onChange={(e) => setDeck(e.target.value)}
                            placeholder="المجموعة"
                            className={inputClass}
                          />
                          <div className="flex gap-2">
                            <button onClick={saveEdit} className="rounded-full bg-primary px-5 py-2 text-sm text-primary-foreground">
                              حفظ
                            </button>
                            <button onClick={() => setEditing(null)} className="rounded-full border border-border px-5 py-2 text-sm">
                              إلغاء
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="font-medium">{c.question}</p>
                          <p className="quote-text mt-3 line-clamp-4 text-sm text-foreground/75">{c.answer}</p>
                          <div className="mt-4 flex gap-2 text-xs">
                            <button onClick={() => startEdit(c)} className="rounded-full border border-border px-4 py-1.5">
                              تعديل
                            </button>
                            <button onClick={() => remove(c.id)} className="rounded-full px-4 py-1.5 text-destructive">
                              حذف
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </AppShell>
  );
}
