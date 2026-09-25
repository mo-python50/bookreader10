import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "الإعدادات — جعبة الفوائد" },
      {
        name: "description",
        content: "إعدادات حسابك في جعبة الفوائد: الاسم المعروض، بيانات الحساب، وخصوصية مكتبتك، والخروج من الحساب.",
      },
      { property: "og:title", content: "الإعدادات — جعبة الفوائد" },
      { property: "og:description", content: "إدارة حسابك وخصوصية مكتبتك." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [name, setName] = useState("");

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,display_name")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (profile?.display_name) setName(profile.display_name);
  }, [profile?.display_name]);

  async function save() {
    const { error } = await supabase
      .from("profiles")
      .upsert({ id: user!.id, display_name: name.trim() || null });
    if (error) {
      toast.error("تعذّر الحفظ.");
      return;
    }
    await qc.invalidateQueries({ queryKey: ["profile"] });
    toast.success("تم حفظ الإعدادات");
  }

  return (
    <AppShell>
      <h1 className="font-display text-3xl font-bold">الإعدادات</h1>

      <section className="mt-7 space-y-5 rounded-3xl border border-border bg-card p-7">
        <div>
          <label className="mb-2 block text-sm">الاسم المعروض</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-primary"
          />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">البريد الإلكتروني</p>
          <p dir="ltr" className="mt-1 text-sm">
            {user?.email}
          </p>
        </div>
        <button onClick={save} className="rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground">
          حفظ
        </button>
      </section>

      <section className="mt-6 rounded-3xl border border-border bg-card p-7">
        <h2 className="font-display text-xl font-bold">الخصوصية</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          فوائدك وكتبك وبطاقاتك وصور صفحاتك مرئية لك وحدك. لا يمكن لأي مستخدم آخر الوصول إليها، ولا تُشارك إلا بما تنسخه
          أو تصدّره أنت بنفسك.
        </p>
      </section>

      <button
        onClick={async () => {
          await signOut();
          navigate({ to: "/auth" });
        }}
        className="mt-6 rounded-full border border-border px-6 py-2.5 text-sm"
      >
        الخروج من الحساب
      </button>
    </AppShell>
  );
}
