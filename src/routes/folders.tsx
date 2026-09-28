import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Folder, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { fetchFolders } from "@/lib/folders";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/folders")({
  head: () => ({
    meta: [
      { title: "المجلدات — جعبة الفوائد" },
      { name: "description", content: "أنشئ مجلدات خاصة لملاحظاتك الحرة وفوائدك المحفوظة ونظّمها بالطريقة التي تناسبك." },
      { property: "og:title", content: "المجلدات — جعبة الفوائد" },
      { property: "og:description", content: "مجلدات خاصة تجمع الملاحظات والفوائد المحفوظة في مكان واحد." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FoldersPage,
});

function FoldersPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const { data: folders = [], isLoading } = useQuery({
    queryKey: ["folders"],
    queryFn: fetchFolders,
    enabled: !!user,
  });

  async function createFolder() {
    if (!user || !name.trim()) {
      toast.error("اكتب اسم المجلد.");
      return;
    }
    setCreating(true);
    const { error } = await supabase.from("folders").insert({
      user_id: user.id,
      name: name.trim(),
      description: description.trim() || null,
    });
    setCreating(false);
    if (error) {
      toast.error(error.code === "23505" ? "لديك مجلد بهذا الاسم بالفعل." : "تعذّر إنشاء المجلد.");
      return;
    }
    setName("");
    setDescription("");
    await qc.invalidateQueries({ queryKey: ["folders"] });
    toast.success("تم إنشاء المجلد");
  }

  const inputClass = "w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-primary";

  return (
    <AppShell>
      <div className="flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-lg bg-secondary text-primary"><Folder aria-hidden="true" /></span>
        <div>
          <h1 className="font-display text-3xl font-bold">المجلدات</h1>
          <p className="mt-1 text-sm text-muted-foreground">نظّم ملاحظاتك الحرة وفوائدك المحفوظة.</p>
        </div>
      </div>

      <section className="mt-7 border-y border-border py-6">
        <h2 className="font-display text-xl font-bold">مجلد جديد</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_auto]">
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="اسم المجلد" maxLength={120} className={inputClass} />
          <input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="وصف مختصر (اختياري)" className={inputClass} />
          <Button onClick={createFolder} disabled={creating} className="h-auto rounded-xl px-6">
            <Plus aria-hidden="true" /> {creating ? "جارٍ الإنشاء…" : "إنشاء"}
          </Button>
        </div>
      </section>

      {isLoading ? (
        <p className="mt-8 text-sm text-muted-foreground">جارٍ التحميل…</p>
      ) : folders.length === 0 ? (
        <div className="mt-8 border-b border-dashed border-border py-14 text-center">
          <Folder className="mx-auto size-10 text-muted-foreground" aria-hidden="true" />
          <p className="mt-3 text-sm text-muted-foreground">لا توجد مجلدات بعد.</p>
        </div>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {folders.map((folder) => (
            <Link key={folder.id} to="/folders/$id" params={{ id: folder.id }} className="group rounded-lg border border-border bg-card p-5 transition-colors hover:border-primary/50">
              <div className="flex items-start gap-3">
                <Folder className="mt-0.5 size-5 text-primary" aria-hidden="true" />
                <div className="min-w-0">
                  <h2 className="font-display text-xl font-bold group-hover:text-primary">{folder.name}</h2>
                  {folder.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{folder.description}</p>}
                </div>
              </div>
              <div className="mt-5 flex gap-4 border-t border-border pt-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><FileText className="size-3.5" /> {folder.noteCount} ملاحظة</span>
                <span>📚 {folder.benefitCount} فائدة</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}