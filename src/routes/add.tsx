import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { ImageCropper, type CropResult } from "@/components/ImageCropper";
import { supabase } from "@/integrations/supabase/client";
import { analyzeBookPage, suggestForWrittenText } from "@/lib/ai.functions";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/add")({
  head: () => ({
    meta: [
      { title: "إضافة فائدة — جعبة الفوائد" },
      {
        name: "description",
        content: "أضف فائدة جديدة: صوّر صفحة الكتاب لاستخراج نصها، أو اكتب النص يدويًا، ثم راجع العنوان والموضوعات المقترحة واحفظ.",
      },
      { property: "og:title", content: "إضافة فائدة — جعبة الفوائد" },
      { property: "og:description", content: "من صورة صفحة الكتاب أو من كتابة يدوية إلى فائدة محفوظة ومنظّمة في خطوات قليلة." },
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
  const suggest = useServerFn(suggestForWrittenText);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [images, setImages] = useState<Picked[]>([]);
  const [mode, setMode] = useState<"image" | "manual">("image");
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
  const [pendingCrop, setPendingCrop] = useState<{ dataUrl: string; replaceIndex: number | null } | null>(null);
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
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    closeCamera();
    // تُعرض الصورة الملتقطة للاقتصاص قبل إضافتها.
    setPendingCrop({ dataUrl, replaceIndex: null });
  }

  function applyCrop(result: CropResult) {
    const replaceIndex = pendingCrop?.replaceIndex ?? null;
    setPendingCrop(null);
    if (replaceIndex != null) {
      setImages((prev) => prev.map((img, i) => (i === replaceIndex ? result : img)));
      toast.success("تم تحديث الصورة بعد الاقتصاص");
    } else {
      setImages((prev) => [...prev, result]);
      toast.success("تم التقاط الصورة");
    }
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

  async function manualContinue() {
    if (!text.trim()) {
      toast.error("اكتب نص الفائدة أولًا.");
      return;
    }
    setBusy(true);
    try {
      // اقتراحات الذكاء الاصطناعي اختيارية هنا: إن تعذّرت نُكمل دون اقتراحات.
      try {
        const result = await suggest({
          data: { text: text.trim(), bookTitle: bookTitle || undefined, authorName: authorName || undefined },
        });
        if (!aiTitle && result.title) {
          setTitle(result.title);
          setAiTitle(result.title);
        }
        if (!tagsInput.trim() && result.tags.length) setTagsInput(result.tags.join("، "));
        if (!question.trim() && result.flashcard_question) setQuestion(result.flashcard_question);
        if (!answer.trim() && result.flashcard_answer) setAnswer(result.flashcard_answer);
      } catch {
        toast.info("لم تتوفر اقتراحات الذكاء الاصطناعي — يمكنك المتابعة والتعديل يدويًا.");
      }
      setConfidence(null);
      setNote(null);
      setStep(2);
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
        {(mode === "image"
          ? [
              [1, "الصورة والمصدر"],
              [2, "استخراج النص"],
              [3, "المراجعة والحفظ"],
            ]
          : [
              [1, "الكتابة والمصدر"],
              [2, "المراجعة والحفظ"],
            ]
        ).map(([n, label]) => (
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
            <label className="mb-2 block text-sm">طريقة الإدخال</label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setMode("image")}
                className={`rounded-full px-5 py-2.5 text-sm ${mode === "image" ? "bg-foreground text-background" : "border border-border hover:bg-secondary"}`}
              >
                🖼 صورة صفحة الكتاب
              </button>
              <button
                type="button"
                onClick={() => setMode("manual")}
                className={`rounded-full px-5 py-2.5 text-sm ${mode === "manual" ? "bg-foreground text-background" : "border border-border hover:bg-secondary"}`}
              >
                ✍️ كتابة يدوية
              </button>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm">
              {mode === "image" ? "صور صفحات الكتاب" : "صورة للمصدر (اختيارية)"}
            </label>
            {mode === "image" && (
              <input type="file" accept="image/*" multiple onChange={(e) => pick(e.target.files)} className={inputClass} />
            )}
            {mode === "manual" && (
              <input type="file" accept="image/*" onChange={(e) => pick(e.target.files)} className={inputClass} />
            )}
            {mode === "image" && (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={openCamera}
                  className="rounded-full border border-border px-5 py-2.5 text-sm hover:bg-secondary"
                >
                  📷 التقاط صورة بالكاميرا
                </button>
                <p className="text-xs text-muted-foreground">صور فقط، حتى ١٠ ميجابايت لكل صورة.</p>
              </div>
            )}
            {images.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-3">
                {images.map((img, i) => (
                  <div key={i} className="relative">
                    <img src={img.dataUrl} alt="" className="h-32 w-24 rounded-xl border border-border object-cover" />
                    <button
                      onClick={() => setPendingCrop({ dataUrl: img.dataUrl, replaceIndex: i })}
                      title="اقتصاص الصورة"
                      className="absolute -left-2 -top-2 grid size-6 place-items-center rounded-full border border-border bg-background text-xs"
                    >
                      ✂
                    </button>
                    <button
                      onClick={() => setImages((prev) => prev.filter((_, idx) => idx !== i))}
                      title="حذف الصورة"
                      className="absolute -right-2 -top-2 grid size-6 place-items-center rounded-full bg-foreground text-xs text-background"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {mode === "manual" && (
            <div>
              <label className="mb-2 block text-sm">نص الفائدة (اكتبه أو الصقه كما هو)</label>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={10}
                placeholder="اكتب أو الصق نص الفائدة هنا…"
                className={`${inputClass} quote-text leading-loose`}
              />
              <p className="mt-2 text-xs text-muted-foreground">
                يُحفظ النص كما كتبته دون أي تعديل، وسيُقترح عليك عنوان وموضوعات بالذكاء الاصطناعي في خطوة المراجعة
                (يمكنك تعديلها).
              </p>
            </div>
          )}

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
            onClick={mode === "image" ? extract : manualContinue}
            disabled={busy}
            className="rounded-full bg-primary px-7 py-3 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {busy
              ? mode === "image"
                ? "جارٍ استخراج النص…"
                : "جارٍ التحضير…"
              : mode === "image"
                ? "استخراج النص"
                : "المتابعة إلى المراجعة"}
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
              <label className="text-sm">{mode === "image" ? "النص المستخرج والمنسّق" : "نص الفائدة"}</label>
              <span className="text-xs text-muted-foreground">
                {mode === "image" ? "نُسّقت فقراته دون إعادة صياغة — راجعه قبل الحفظ" : "كما كتبته — يمكنك تعديله قبل الحفظ"}
              </span>
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
              {mode === "image" ? "تعديل المصدر والصور" : "تعديل النص والمصدر"}
            </button>
            <button onClick={() => navigate({ to: "/" })} className="rounded-full px-6 py-3 text-sm text-muted-foreground">
              إلغاء
            </button>
          </div>
        </section>
      )}
      {cameraOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/60 p-4" onClick={closeCamera}>
          <div
            className="w-full max-w-2xl rounded-3xl border border-border bg-card p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg font-bold">التقاط صورة صفحة الكتاب</h2>
              <button onClick={closeCamera} className="grid size-8 place-items-center rounded-full bg-muted text-sm">
                ✕
              </button>
            </div>
            {cameraError ? (
              <p className="rounded-2xl border border-destructive/30 bg-destructive/8 p-4 text-sm text-destructive">
                {cameraError}
              </p>
            ) : (
              <>
                <video ref={videoRef} autoPlay playsInline muted className="w-full rounded-2xl border border-border bg-muted" />
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    onClick={capturePhoto}
                    className="rounded-full bg-primary px-7 py-3 text-sm font-medium text-primary-foreground"
                  >
                    التقاط
                  </button>
                  <button onClick={closeCamera} className="rounded-full border border-border px-6 py-3 text-sm">
                    إلغاء
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {pendingCrop && (
        <ImageCropper src={pendingCrop.dataUrl} onCancel={() => setPendingCrop(null)} onConfirm={applyCrop} />
      )}
    </AppShell>
  );
}
