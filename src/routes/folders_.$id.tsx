import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, FilePlus2, FolderPen, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { BenefitCard } from "@/components/BenefitCard";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { fetchBenefits } from "@/lib/library";
import { fetchFolder, fetchFolderBenefits, fetchFolderNotes, type FolderNote } from "@/lib/folders";

export const Route = createFileRoute("/folders_/$id")({
  head: () => ({
    meta: [
      { title: "مجلد خاص — جعبة الفوائد" },
      { name: "description", content: "مجلد خاص يجمع ملاحظاتك الحرة وفوائدك المحفوظة." },
      { property: "og:title", content: "مجلد خاص — جعبة الفوائد" },
      { property: "og:description", content: "ملاحظات وفوائد منظّمة داخل مجلد خاص." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FolderPage,
});

function FolderPage() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [selectedBenefit, setSelectedBenefit] = useState("");
  const [editingFolder, setEditingFolder] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [folderDescription, setFolderDescription] = useState("");

  const { data: folder, isLoading } = useQuery({ queryKey: ["folder", id], queryFn: () => fetchFolder(id), enabled: !!user });
  const { data: notes = [] } = useQuery({ queryKey: ["folder-notes", id], queryFn: () => fetchFolderNotes(id), enabled: !!user });
  const { data: linkedBenefits = [] } = useQuery({ queryKey: ["folder-benefits", id], queryFn: () => fetchFolderBenefits(id), enabled: !!user });
  const { data: allBenefits = [] } = useQuery({ queryKey: ["benefits"], queryFn: fetchBenefits, enabled: !!user });
  const availableBenefits = allBenefits.filter((benefit) => !linkedBenefits.some((linked) => linked.id === benefit.id));

  async function refresh() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["folders"] }),
      qc.invalidateQueries({ queryKey: ["folder", id] }),
      qc.invalidateQueries({ queryKey: ["folder-notes", id] }),
      qc.invalidateQueries({ queryKey: ["folder-benefits", id] }),
    ]);
  }

  function editNote(note: FolderNote) {
    setEditingNote(note.id);
    setNoteTitle(note.title);
    setNoteContent(note.content);
  }

  function clearNoteForm() {
    setEditingNote(null);
    setNoteTitle("");
    setNoteContent("");
  }

  async function saveNote() {
    if (!user || !noteTitle.trim()) {
      toast.error("اكتب عنوان الملاحظة.");
      return;
    }
    const payload = { title: noteTitle.trim(), content: noteContent.trim() };
    const result = editingNote
      ? await supabase.from("folder_notes").update(payload).eq("id", editingNote)
      : await supabase.from("folder_notes").insert({ ...payload, folder_id: id, user_id: user.id });
    if (result.error) {
      toast.error("تعذّر حفظ الملاحظة.");
      return;
    }
    clearNoteForm();
    await refresh();
    toast.success(editingNote ? "تم تحديث الملاحظة" : "تمت إضافة الملاحظة");
  }

  async function removeNote(noteId: string) {
    if (!confirm("حذف هذه الملاحظة؟")) return;
    const { error } = await supabase.from("folder_notes").delete().eq("id", noteId);
    if (error) {
      toast.error("تعذّر حذف الملاحظة.");
      return;
    }
    if (editingNote === noteId) clearNoteForm();
    await refresh();
  }

  async function linkBenefit() {
    if (!user || !selectedBenefit) {
      toast.error("اختر فائدة أولًا.");
      return;
    }
    const { error } = await supabase.from("folder_benefits").insert({ folder_id: id, benefit_id: selectedBenefit, user_id: user.id });
    if (error) {
      toast.error("تعذّرت إضافة الفائدة.");
      return;
    }
    setSelectedBenefit("");
    await refresh();
    toast.success("أُضيفت الفائدة إلى المجلد");
  }

  async function unlinkBenefit(benefitId: string) {
    const { error } = await supabase.from("folder_benefits").delete().eq("folder_id", id).eq("benefit_id", benefitId);
    if (error) {
      toast.error("تعذّرت إزالة الفائدة.");
      return;
    }
    await refresh();
    toast.success("أُزيلت الفائدة من المجلد وبقيت في مكتبتك");
  }

  async function saveFolder() {
    if (!folderName.trim()) {
      toast.error("اكتب اسم المجلد.");
      return;
    }
    const { error } = await supabase.from("folders").update({ name: folderName.trim(), description: folderDescription.trim() || null }).eq("id", id);
    if (error) {
      toast.error(error.code === "23505" ? "لديك مجلد بهذا الاسم بالفعل." : "تعذّر تحديث المجلد.");
      return;
    }
    setEditingFolder(false);
    await refresh();
    toast.success("تم تحديث المجلد");
  }

  async function removeFolder() {
    if (!confirm("حذف هذا المجلد وملاحظاته؟ ستبقى الفوائد الأصلية في مكتبتك.")) return;
    const { error } = await supabase.from("folders").delete().eq("id", id);
    if (error) {
      toast.error("تعذّر حذف المجلد.");
      return;
    }
    await qc.invalidateQueries({ queryKey: ["folders"] });
    toast.success("تم حذف المجلد");
    navigate({ to: "/folders" });
  }

  const inputClass = "w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-primary";
  if (isLoading) return <AppShell><p className="text-sm text-muted-foreground">جارٍ التحميل…</p></AppShell>;
  if (!folder) return <AppShell><p className="text-sm text-muted-foreground">لم يتم العثور على هذا المجلد.</p></AppShell>;

  return (
    <AppShell>
      <button onClick={() => navigate({ to: "/folders" })} className="mb-5 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowRight className="size-4" /> كل المجلدات</button>
      {editingFolder ? (
        <div className="border-y border-border py-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <input value={folderName} onChange={(event) => setFolderName(event.target.value)} className={inputClass} />
            <input value={folderDescription} onChange={(event) => setFolderDescription(event.target.value)} placeholder="وصف اختياري" className={inputClass} />
          </div>
          <div className="mt-3 flex gap-2"><Button onClick={saveFolder}>حفظ</Button><Button variant="outline" onClick={() => setEditingFolder(false)}>إلغاء</Button></div>
        </div>
      ) : (
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><h1 className="font-display text-3xl font-bold">{folder.name}</h1>{folder.description && <p className="mt-2 text-sm text-muted-foreground">{folder.description}</p>}</div>
          <div className="flex gap-2">
            <Button variant="outline" size="icon" title="تعديل المجلد" onClick={() => { setFolderName(folder.name); setFolderDescription(folder.description ?? ""); setEditingFolder(true); }}><FolderPen /></Button>
            <Button variant="ghost" size="icon" title="حذف المجلد" className="text-destructive" onClick={removeFolder}><Trash2 /></Button>
          </div>
        </div>
      )}

      <section className="mt-9">
        <div className="flex items-center gap-2"><FilePlus2 className="size-5 text-primary" /><h2 className="font-display text-2xl font-bold">الملاحظات</h2></div>
        <div className="mt-4 rounded-lg border border-border bg-card p-5">
          <input value={noteTitle} onChange={(event) => setNoteTitle(event.target.value)} placeholder="عنوان الملاحظة" maxLength={180} className={inputClass} />
          <textarea value={noteContent} onChange={(event) => setNoteContent(event.target.value)} placeholder="اكتب ما تشاء…" rows={7} className={`${inputClass} mt-3 quote-text`} />
          <div className="mt-3 flex gap-2"><Button onClick={saveNote}><Plus />{editingNote ? "حفظ التعديل" : "إضافة الملاحظة"}</Button>{editingNote && <Button variant="outline" onClick={clearNoteForm}><X />إلغاء</Button>}</div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {notes.map((note) => (
            <article key={note.id} className="rounded-lg border border-border bg-card p-5">
              <div className="flex items-start justify-between gap-3"><h3 className="font-display text-xl font-bold">{note.title}</h3><div className="flex"><Button variant="ghost" size="icon" title="تعديل الملاحظة" onClick={() => editNote(note)}><Pencil /></Button><Button variant="ghost" size="icon" title="حذف الملاحظة" className="text-destructive" onClick={() => removeNote(note.id)}><Trash2 /></Button></div></div>
              {note.content && <p className="quote-text mt-3 text-sm text-foreground/80">{note.content}</p>}
            </article>
          ))}
          {notes.length === 0 && <p className="text-sm text-muted-foreground">لا توجد ملاحظات في هذا المجلد بعد.</p>}
        </div>
      </section>

      <section className="mt-12 border-t border-border pt-8">
        <h2 className="font-display text-2xl font-bold">الفوائد المحفوظة</h2>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <select value={selectedBenefit} onChange={(event) => setSelectedBenefit(event.target.value)} className={inputClass}>
            <option value="">اختر فائدة من مكتبتك</option>
            {availableBenefits.map((benefit) => <option key={benefit.id} value={benefit.id}>{benefit.title}</option>)}
          </select>
          <Button onClick={linkBenefit} disabled={!selectedBenefit} className="shrink-0"><Plus />إضافة إلى المجلد</Button>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {linkedBenefits.map((benefit) => (
            <div key={benefit.id} className="relative">
              <BenefitCard benefit={benefit} />
              <Button variant="outline" size="icon" title="إزالة من المجلد" onClick={() => unlinkBenefit(benefit.id)} className="absolute bottom-4 left-4 z-10 bg-card text-destructive"><X /></Button>
            </div>
          ))}
          {linkedBenefits.length === 0 && <p className="text-sm text-muted-foreground">لم تُضف فوائد إلى هذا المجلد بعد.</p>}
        </div>
      </section>
    </AppShell>
  );
}