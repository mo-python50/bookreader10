import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { analyzeBookPage } from "@/lib/ai.functions";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/add")({
  head: () => ({
    meta: [
      { title: "إضافة فائدة — جعبة الفوائد" },
      {
        name: "description",
        content: "أضف فائدة جديدة: ارفع صورة صفحة الكتاب، استخرج نصها كما هو، راجع العنوان والموضوعات المقترحة ثم احفظ.",
      },
      { property: "og:title", content: "إضافة فائدة — جعبة الفوائد" },
      { property: "og:description", content: "من صورة صفحة الكتاب إلى فائدة محفوظة ومنظّمة في خطوات قليلة." },
    ],
  }),
  component: AddBenefit,
});

type Picked = { file: File; dataUrl: string };

function readFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("read error"));
    reader.readAsDataURL(file);
  });
}

function AddBenefit() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const analyze = useServerFn(analyzeBookPage);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [images, setImages] = useState<Picked[]>([]);
  const [bookTitle, setBookTitle] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [page, setPage] = useState("");
  const [busy, setBusy] = useState(false);

  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [aiTitle, setAiTitle] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [confidence, setConfidence] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [makeCard, setMakeCard] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");

  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function openCamera() {
    setCameraError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("الكاميرا غير مدعومة في هذا المتصفح — استخدم رفع الملفات.");
      setCameraOpen(true);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOpen(true);
      requestAnimationFrame(() => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      });
    } catch {
      setCameraError("تعذّر الوصول إلى الكاميرا. تأكد من السماح بالوصول ثم حاول مجددًا.");
      setCameraOpen(true);
    }
  }

  function closeCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOpen(false);
    setCameraError(null);
  }

  function capturePhoto() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `capture-${Date.now()}.jpg`, { type: "image/jpeg" });
        const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
        setImages((prev) => [...prev, { file, dataUrl }]);
        closeCamera();
        toast.success("تم التقاط الصورة");
      },
      "image/jpeg",
      0.92,
    );
  }

  const { data: books = [] } = useQuery({
    queryKey: ["books-with-authors"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("books").select("id,title,authors(id,name)");
      if (error) throw error;
      return (data ?? []) as { id: string; title: string; authors: { id: string; name: string } | null }[];
    },
  });

  function pick(files: FileList | null) {
    if (!files) return;
    const accepted: File[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) {
        toast.error(`${file.name}: يُقبل الصور فقط`);
        continue;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`${file.name}: الحجم يتجاوز ١٠ ميجابايت`);
        continue;
      }
      accepted.push(file);
    }
    Promise.all(accepted.map(async (file) => ({ file, dataUrl: await readFile(file) }))).then((picked) =>
      setImages((prev) => [...prev, ...picked]),
    );
  }

  async function extract() {
    if (images.length === 0) {
      toast.error("أضف صورة صفحة واحدة على الأقل.");
      return;
    }
    setBusy(true);
    try {
      const parts: string[] = [];
      let suggestedTitle = "";
      const tagSet = new Set<string>();
      let worst: string | null = null;
      let firstNote: string | null = null;
      let q = "";
      let a = "";

      for (const img of images) {
        const result = await analyze({
          data: { imageDataUrl: img.dataUrl, bookTitle: bookTitle || undefined, authorName: authorName || undefined },
        });
        if (result.text) parts.push(result.text);
        if (!suggestedTitle) suggestedTitle = result.title;
        result.tags.forEach((t) => tagSet.add(t));
        if (result.confidence === "low" || (result.confidence === "medium" && worst !== "low")) worst = result.confidence;
        if (!firstNote && result.note) firstNote = result.note;
        if (!q && result.flashcard_question) q = result.flashcard_question;
        if (!a && result.flashcard_answer) a = result.flashcard_answer;
      }

      setText(parts.join("\n\n"));
      setTitle(suggestedTitle);
      setAiTitle(suggestedTitle);
      setTagsInput(Array.from(tagSet).join("، "));
      setConfidence(worst);
      setNote(firstNote);
      setQuestion(q);
      setAnswer(a || parts.join("\n\n"));
      setStep(2);
      if (worst === "low") toast.warning("جودة الاستخراج منخفضة — راجع النص يدويًا قبل الحفظ.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذّر استخراج النص.");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!text.trim() || !title.trim()) {
      toast.error("العنوان ونص الفائدة مطلوبان.");
      return;
    }
    setBusy(true);
    try {
      const uid = user!.id;

      let authorId: string | null = null;
      if (authorName.trim()) {
        const { data: existing } = await supabase
          .from("authors")
          .select("id")
          .eq("name", authorName.trim())
          .maybeSingle();
        if (existing) authorId = existing.id;
        else {
          const { data, error } = await supabase
            .from("authors")
            .insert({ user_id: uid, name: authorName.trim() })
            .select("id")
            .single();
          if (error) throw error;
          authorId = data.id;
        }
      }

      let bookId: string | null = null;
      if (bookTitle.trim()) {
        const query = supabase.from("books").select("id").eq("title", bookTitle.trim());
        const { data: existing } = await (authorId ? query.eq("author_id", authorId) : query.is("author_id", null)).maybeSingle();
        if (existing) bookId = existing.id;
        else {
          const { data, error } = await supabase
            .from("books")
            .insert({ user_id: uid, title: bookTitle.trim(), author_id: authorId })
            .select("id")
            .single();
          if (error) throw error;
          bookId = data.id;
        }
      }

      let imagePath: string | null = null;
      if (images[0]) {
        const ext = images[0].file.name.split(".").pop() ?? "jpg";
        const path = `${uid}/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from("benefit-images").upload(path, images[0].file);
        if (error) throw error;
        imagePath = path;
      }

      const { data: benefit, error: benefitError } = await supabase
        .from("benefits")
        .insert({
          user_id: uid,
          title: title.trim(),
          text: text.trim(),
          book_id: bookId,
          page_number: page.trim() || null,
          source_image_url: imagePath,
          title_is_ai: title.trim() === aiTitle.trim() && !!aiTitle,
          ocr_confidence: confidence,
        })
        .select("id")
        .single();
      if (benefitError) throw benefitError;

      const tagNames = tagsInput
        .split(/[,،\n]/)
        .map((t) => t.replace(/^#/, "").trim())
        .filter(Boolean);

      for (const name of Array.from(new Set(tagNames))) {
        let tagId: string;
        const { data: existing } = await supabase.from("tags").select("id").eq("name", name).maybeSingle();
        if (existing) tagId = existing.id;
        else {
          const { data, error } = await supabase.from("tags").insert({ user_id: uid, name }).select("id").single();
          if (error) throw error;
          tagId = data.id;
        }
        await supabase.from("benefit_tags").insert({ benefit_id: benefit.id, tag_id: tagId, user_id: uid });
      }

      if (makeCard && question.trim() && answer.trim()) {
        await supabase.from("flashcards").insert({
          user_id: uid,
          benefit_id: benefit.id,
          question: question.trim(),
          answer: answer.trim(),
          deck: bookTitle.trim() || "جعبة الفوائد",
        });
      }

      await qc.invalidateQueries();
      toast.success("تم حفظ الفائدة في جعبتك");
      navigate({ to: "/benefits/$id", params: { id: benefit.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذّر الحفظ.");
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    "w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-primary";

  return (
    <AppShell>
      <h1 className="font-display text-3xl font-bold">إضافة فائدة</h1>
      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        {[
          [1, "الصورة والمصدر"],
          [2, "استخراج النص"],
          [3, "المراجعة والحفظ"],
        ].map(([n, label]) => (
          <span
            key={n as number}
            className={`rounded-full px-4 py-1.5 ${step === n ? "bg-foreground text-background" : "bg-muted text-muted-foreground"}`}
          >
            {n as number}. {label as string}
          </span>
        ))}
      </div>

      {step === 1 && (
        <section className="mt-7 space-y-6 rounded-3xl border border-border bg-card p-7">
          <div>
            <label className="mb-2 block text-sm">صور صفحات الكتاب</label>
            <input type="file" accept="image/*" multiple onChange={(e) => pick(e.target.files)} className={inputClass} />
            <p className="mt-2 text-xs text-muted-foreground">صور فقط، حتى ١٠ ميجابايت لكل صورة.</p>
            {images.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-3">
                {images.map((img, i) => (
                  <div key={i} className="relative">
                    <img src={img.dataUrl} alt="" className="h-32 w-24 rounded-xl border border-border object-cover" />
                    <button
                      onClick={() => setImages((prev) => prev.filter((_, idx) => idx !== i))}
                      className="absolute -left-2 -top-2 grid size-6 place-items-center rounded-full bg-foreground text-xs text-background"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-2 block text-sm">اسم الكتاب</label>
              <input
                list="books-list"
                value={bookTitle}
                onChange={(e) => {
                  setBookTitle(e.target.value);
                  const found = books.find((b) => b.title === e.target.value);
                  if (found?.authors) setAuthorName(found.authors.name);
                }}
                className={inputClass}
              />
              <datalist id="books-list">
                {books.map((b) => (
                  <option key={b.id} value={b.title} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="mb-2 block text-sm">المؤلف</label>
              <input
                list="authors-list"
                value={authorName}
                onChange={(e) => setAuthorName(e.target.value)}
                className={inputClass}
              />
              <datalist id="authors-list">
                {Array.from(new Set(books.map((b) => b.authors?.name).filter(Boolean))).map((name) => (
                  <option key={name as string} value={name as string} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="mb-2 block text-sm">الصفحة (اختياري)</label>
              <input value={page} onChange={(e) => setPage(e.target.value)} className={inputClass} />
            </div>
          </div>

          <button
            onClick={extract}
            disabled={busy}
            className="rounded-full bg-primary px-7 py-3 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {busy ? "جارٍ استخراج النص…" : "استخراج النص"}
          </button>
        </section>
      )}

      {step >= 2 && (
        <section className="mt-7 space-y-7 rounded-3xl border border-border bg-card p-7">
          {confidence === "low" && (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/8 p-4 text-sm text-destructive">
              جودة الاستخراج منخفضة. راجع النص كلمة كلمة قبل الحفظ.
              {note ? ` (${note})` : ""}
            </div>
          )}

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm">النص الأصلي المستخرج</label>
              <span className="text-xs text-muted-foreground">لا يُعاد صياغته — عدّله فقط لتصحيح الاستخراج</span>
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={12}
              className={`${inputClass} quote-text leading-loose`}
            />
          </div>

          <div>
            <div className="mb-2 flex items-center gap-2">
              <label className="text-sm">العنوان</label>
              {aiTitle && (
                <span className="rounded-full bg-primary/12 px-3 py-0.5 text-xs text-primary">مقترح بالذكاء الاصطناعي</span>
              )}
            </div>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
          </div>

          <div>
            <div className="mb-2 flex items-center gap-2">
              <label className="text-sm">الموضوعات (وسوم)</label>
              <span className="rounded-full bg-primary/12 px-3 py-0.5 text-xs text-primary">مقترحة بالذكاء الاصطناعي</span>
            </div>
            <input value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} className={inputClass} />
            <p className="mt-2 text-xs text-muted-foreground">افصل بينها بفاصلة.</p>
          </div>

          <div className="rounded-2xl border border-border p-5">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={makeCard} onChange={(e) => setMakeCard(e.target.checked)} />
              إنشاء بطاقة مراجعة من هذه الفائدة
            </label>
            {makeCard && (
              <div className="mt-4 space-y-4">
                <div>
                  <label className="mb-2 block text-sm">السؤال (وجه البطاقة)</label>
                  <input value={question} onChange={(e) => setQuestion(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className="mb-2 block text-sm">الجواب (ظهر البطاقة)</label>
                  <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={4} className={inputClass} />
                </div>
              </div>
            )}
          </div>

          <div className="grid gap-4 border-t border-border pt-6 text-sm sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">الكتاب</p>
              <p className="mt-1">{bookTitle || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">المؤلف</p>
              <p className="mt-1">{authorName || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">الصفحة</p>
              <p className="mt-1">{page || "—"}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={save}
              disabled={busy}
              className="rounded-full bg-primary px-7 py-3 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              {busy ? "جارٍ الحفظ…" : "حفظ الفائدة"}
            </button>
            <button onClick={() => setStep(1)} className="rounded-full border border-border px-6 py-3 text-sm">
              تعديل المصدر والصور
            </button>
            <button onClick={() => navigate({ to: "/" })} className="rounded-full px-6 py-3 text-sm text-muted-foreground">
              إلغاء
            </button>
          </div>
        </section>
      )}
    </AppShell>
  );
}
