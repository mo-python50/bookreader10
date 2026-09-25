import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "الدخول إلى جعبة الفوائد" },
      { name: "description", content: "أنشئ حسابك الخاص في جعبة الفوائد لحفظ فوائد كتبك وتنظيمها بخصوصية كاملة." },
      { property: "og:title", content: "الدخول إلى جعبة الفوائد" },
      { property: "og:description", content: "حساب خاص لمكتبة فوائدك: بحث، بطاقات مراجعة، وتصدير." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/" });
  }, [loading, user, navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (!data.session) {
          toast.success("تم إنشاء الحساب. تفقّد بريدك لتأكيد العنوان ثم عد للدخول.");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذّر إكمال العملية.");
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (result.error) {
      toast.error("تعذّر الدخول باستخدام Google.");
      return;
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-5 py-12">
      <div className="w-full max-w-md">
        <div className="text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary font-display text-2xl font-bold text-primary-foreground">
            ج
          </span>
          <h1 className="mt-5 font-display text-4xl font-bold">جعبة الفوائد</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            مكتبتك الخاصة لما تقرأ: صوّر صفحة الكتاب، واحفظ فائدتها منظّمة وقابلة للبحث.
          </p>
        </div>

        <div className="mt-8 rounded-3xl border border-border bg-card p-7">
          <div className="mb-6 flex gap-1 rounded-full bg-muted p-1 text-sm">
            <button
              type="button"
              onClick={() => setMode("signin")}
              className={`flex-1 rounded-full py-2 ${mode === "signin" ? "bg-card font-medium shadow-sm" : "text-muted-foreground"}`}
            >
              دخول
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={`flex-1 rounded-full py-2 ${mode === "signup" ? "bg-card font-medium shadow-sm" : "text-muted-foreground"}`}
            >
              حساب جديد
            </button>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm">البريد الإلكتروني</label>
              <input
                type="email"
                required
                dir="ltr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm">كلمة المرور</label>
              <input
                type="password"
                required
                minLength={6}
                dir="ltr"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-primary"
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-full bg-primary py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {busy ? "…" : mode === "signup" ? "إنشاء الحساب" : "الدخول"}
            </button>
          </form>

          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            أو
            <span className="h-px flex-1 bg-border" />
          </div>

          <button
            type="button"
            onClick={google}
            className="w-full rounded-full border border-border bg-background py-3 text-sm font-medium transition-colors hover:bg-accent"
          >
            المتابعة باستخدام Google
          </button>
        </div>

        <p className="mt-6 text-center text-xs leading-relaxed text-muted-foreground">
          مكتبتك خاصة بك تمامًا: لا يرى أحد فوائدك أو كتبك إلا أنت.
        </p>
      </div>
    </div>
  );
}
