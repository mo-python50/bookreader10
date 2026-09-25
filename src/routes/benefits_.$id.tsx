import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import {
  arabicDate,
  benefitsToCsv,
  downloadFile,
  fetchBenefit,
  formatFullBenefit,
  signedImageUrl,
} from "@/lib/library";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/benefits_/$id")({
  head: () => ({
    meta: [
      { title: "فائدة — جعبة الفوائد" },
      {
        name: "description",
        content: "صفحة الفائدة: النص الأصلي، الكتاب والمؤلف والصفحة، الموضوعات، صورة المصدر، والنسخ والمشاركة والتصدير.",
      },
      { property: "og:title", content: "فائدة — جعبة الفوائد" },
      { property: "og:description", content: "اقتباس محفوظ مع مصدره وموضوعاته وأدوات النسخ والمشاركة." },
    ],
  }),
  component: BenefitPage,
});

function BenefitPage() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const { data: benefit, isLoading } = useQuery({
    queryKey: ["benefit", id],
    queryFn: () => fetchBenefit(id),
    enabled: !!user,
  });

  useEffect(() => {
    if (benefit?.source_image_url) signedImageUrl(benefit.source_image_url).then(setImageUrl);
  }, [benefit?.source_image_url]);

  if (isLoading) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>
      </AppShell>
    );
  }
  if (!benefit) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">لم يتم العثور على هذه الفائدة.</p>
      </AppShell>
    );
  }

  const full = formatFullBenefit(benefit);

  async function copy(value: string, message: string) {
    await navigator.clipboard.writeText(value);
    toast.success(message);
  }

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title: benefit!.title, text: full });
        return;
      } catch {
        return;
      }
    }
    await copy(full, "تم نسخ الفائدة (المشاركة غير مدعومة في هذا المتصفح)");
  }

  function makeCard() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = 1080;
    const H = 1350;
    canvas.width = W;
    canvas.height = H;

    ctx.fillStyle = "#f7f1e4";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#b4763c";
    ctx.fillRect(0, 0, W, 14);

    ctx.direction = "rtl";
    ctx.textAlign = "right";
    ctx.fillStyle = "#3a3026";
    ctx.font = "bold 58px Amiri, serif";
    ctx.fillText(benefit!.title.slice(0, 40), W - 90, 170);

    ctx.font = "40px Amiri, serif";
    const words = benefit!.text.split(/\s+/);
    let line = "";
    let y = 290;
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > W - 180) {
        ctx.fillText(line, W - 90, y);
        y += 66;
        line = word;
        if (y > H - 300) {
          ctx.fillText("…", W - 90, y);
          line = "";
          break;
        }
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, W - 90, y);

    ctx.fillStyle = "#7a6a58";
    ctx.font = "34px Tajawal, sans-serif";
    const meta = [benefit!.book?.title, benefit!.author?.name, benefit!.page_number ? `ص ${benefit!.page_number}` : null]
      .filter(Boolean)
      .join(" · ");
    ctx.fillText(meta, W - 90, H - 190);
    if (benefit!.tags.length)
      ctx.fillText(benefit!.tags.map((t) => `#${t.name}`).join("  "), W - 90, H - 140);

    ctx.fillStyle = "#b4763c";
    ctx.font = "bold 36px Amiri, serif";
    ctx.fillText("جعبة الفوائد", W - 90, H - 70);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${benefit!.title.slice(0, 30)}.png`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("تم إنشاء بطاقة المشاركة");
    }, "image/png");
  }

  async function toFlashcard() {
    const { error } = await supabase.from("flashcards").insert({
      user_id: user!.id,
      benefit_id: benefit!.id,
      question: `ما الفائدة المتعلقة بـ: ${benefit!.title}؟`,
      answer: benefit!.text,
      deck: benefit!.book?.title ?? "جعبة الفوائد",
    });
    if (error) {
      toast.error("تعذّر إنشاء البطاقة.");
      return;
    }
    await qc.invalidateQueries({ queryKey: ["flashcards"] });
    toast.success("تمت إضافة بطاقة مراجعة. يمكنك تعديل وجهيها من صفحة البطاقات.");
  }

  async function remove() {
    if (!confirm("حذف هذه الفائدة نهائيًا؟")) return;
    const { error } = await supabase.from("benefits").delete().eq("id", benefit!.id);
    if (error) {
      toast.error("تعذّر الحذف.");
      return;
    }
    await qc.invalidateQueries({ queryKey: ["benefits"] });
    toast.success("تم الحذف");
    navigate({ to: "/benefits" });
  }

  return (
    <AppShell>
      <canvas ref={canvasRef} className="hidden" />

      <article className="rounded-3xl border border-border bg-card p-7 sm:p-10">
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span>{arabicDate(benefit.created_at)}</span>
          <button
            onClick={remove}
            className="mr-auto rounded-full border border-destructive/40 px-4 py-1.5 text-destructive hover:bg-destructive/10"
          >
            🗑 حذف الفائدة
          </button>
          {benefit.title_is_ai && (
            <span className="rounded-full bg-primary/12 px-3 py-1 text-primary">عنوان مقترح بالذكاء الاصطناعي</span>
          )}
          {benefit.ocr_confidence === "low" && (
            <span className="rounded-full bg-destructive/12 px-3 py-1 text-destructive">
              جودة الاستخراج منخفضة — يُنصح بمراجعة النص
            </span>
          )}
        </div>

        <h1 className="mt-4 font-display text-3xl font-bold leading-snug sm:text-4xl">{benefit.title}</h1>

        <p className="quote-text mt-6 border-r-2 border-primary pr-5 text-lg">{benefit.text}</p>

        <dl className="mt-8 grid gap-4 border-t border-border pt-6 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted-foreground">الكتاب</dt>
            <dd className="mt-1">{benefit.book?.title ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">المؤلف</dt>
            <dd className="mt-1">{benefit.author?.name ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">الصفحة</dt>
            <dd className="mt-1">{benefit.page_number ?? "—"}</dd>
          </div>
        </dl>

        {benefit.tags.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-2">
            {benefit.tags.map((t) => (
              <Link
                key={t.id}
                to="/benefits"
                search={{ tag: t.name, filter: "all" }}
                className="rounded-full bg-muted px-4 py-1.5 text-xs hover:bg-secondary"
              >
                #{t.name}
              </Link>
            ))}
          </div>
        )}

        {imageUrl && (
          <div className="mt-8">
            <p className="mb-3 text-xs text-muted-foreground">صورة المصدر</p>
            <img src={imageUrl} alt="صورة صفحة الكتاب" className="max-h-[520px] rounded-2xl border border-border" />
          </div>
        )}

        <div className="mt-9 flex flex-wrap gap-2 border-t border-border pt-7 text-sm">
          <button onClick={() => copy(benefit.text, "تم نسخ النص")} className="rounded-full bg-foreground px-5 py-2.5 text-background">
            نسخ النص
          </button>
          <button onClick={() => copy(full, "تم نسخ الفائدة كاملة")} className="rounded-full border border-border px-5 py-2.5">
            نسخ الفائدة كاملة
          </button>
          <button onClick={share} className="rounded-full border border-border px-5 py-2.5">
            مشاركة
          </button>
          <button onClick={makeCard} className="rounded-full border border-border px-5 py-2.5">
            إنشاء بطاقة صورة
          </button>
          <button onClick={toFlashcard} className="rounded-full border border-border px-5 py-2.5">
            تحويل إلى بطاقة مراجعة
          </button>
          <button
            onClick={() => downloadFile(`${benefit.title.slice(0, 25)}.csv`, benefitsToCsv([benefit]), "text/csv")}
            className="rounded-full border border-border px-5 py-2.5"
          >
            تصدير
          </button>
          <button onClick={remove} className="rounded-full px-5 py-2.5 text-destructive hover:bg-destructive/10">
            حذف
          </button>
        </div>
      </article>
    </AppShell>
  );
}
