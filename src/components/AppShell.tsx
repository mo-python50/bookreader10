import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";

const NAV = [
  { to: "/", label: "الرئيسية" },
  { to: "/benefits", label: "الفوائد" },
  { to: "/library", label: "مكتبتي" },
  { to: "/flashcards", label: "البطاقات" },
  { to: "/export", label: "التصدير" },
  { to: "/settings", label: "الإعدادات" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link to="/" className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-primary font-display text-xl font-bold text-primary-foreground">
              ج
            </span>
            <span>
              <span className="block font-display text-2xl font-bold leading-none">جعبة الفوائد</span>
              <span className="mt-1 block text-xs text-muted-foreground">مكتبة اقتباسات الكتب والمعارف</span>
            </span>
          </Link>

          <nav className="-mx-1 order-3 flex w-full items-center gap-5 overflow-x-auto px-1 text-sm md:order-2 md:w-auto md:overflow-visible">
            {NAV.map((item) => {
              const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={
                    active
                      ? "shrink-0 font-medium text-foreground"
                      : "shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                  }
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <Link
            to="/add"
            className="order-2 shrink-0 rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
          >
            إضافة فائدة
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-12">{children}</main>
    </div>
  );
}
