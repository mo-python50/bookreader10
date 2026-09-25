import { supabase } from "@/integrations/supabase/client";

export type Benefit = {
  id: string;
  title: string;
  text: string;
  page_number: string | null;
  source_image_url: string | null;
  title_is_ai: boolean;
  ocr_confidence: string | null;
  created_at: string;
  book: { id: string; title: string } | null;
  author: { id: string; name: string } | null;
  tags: { id: string; name: string }[];
};

export type Flashcard = {
  id: string;
  benefit_id: string | null;
  question: string;
  answer: string;
  deck: string | null;
  created_at: string;
};

const BENEFIT_SELECT =
  "id,title,text,page_number,source_image_url,title_is_ai,ocr_confidence,created_at,books(id,title,authors(id,name)),benefit_tags(tags(id,name))";

type RawBenefit = {
  id: string;
  title: string;
  text: string;
  page_number: string | null;
  source_image_url: string | null;
  title_is_ai: boolean;
  ocr_confidence: string | null;
  created_at: string;
  books: { id: string; title: string; authors: { id: string; name: string } | null } | null;
  benefit_tags: { tags: { id: string; name: string } | null }[] | null;
};

function normalize(row: RawBenefit): Benefit {
  return {
    id: row.id,
    title: row.title,
    text: row.text,
    page_number: row.page_number,
    source_image_url: row.source_image_url,
    title_is_ai: row.title_is_ai,
    ocr_confidence: row.ocr_confidence,
    created_at: row.created_at,
    book: row.books ? { id: row.books.id, title: row.books.title } : null,
    author: row.books?.authors ? { id: row.books.authors.id, name: row.books.authors.name } : null,
    tags: (row.benefit_tags ?? []).flatMap((bt) => (bt.tags ? [bt.tags] : [])),
  };
}

export async function fetchBenefits(): Promise<Benefit[]> {
  const { data, error } = await supabase
    .from("benefits")
    .select(BENEFIT_SELECT)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as RawBenefit[]).map(normalize);
}

export async function fetchBenefit(id: string): Promise<Benefit | null> {
  const { data, error } = await supabase.from("benefits").select(BENEFIT_SELECT).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? normalize(data as unknown as RawBenefit) : null;
}

export async function fetchFlashcards(): Promise<Flashcard[]> {
  const { data, error } = await supabase
    .from("flashcards")
    .select("id,benefit_id,question,answer,deck,created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Flashcard[];
}

export async function signedImageUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage.from("benefit-images").createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

/* ---------- formatting ---------- */

export function formatFullBenefit(b: Benefit) {
  const lines = [b.title, "", `«${b.text}»`, ""];
  if (b.book) lines.push(`— ${b.book.title}`);
  if (b.author) lines.push(b.author.name);
  if (b.page_number) lines.push(`ص ${b.page_number}`);
  if (b.tags.length) {
    lines.push("");
    lines.push(b.tags.map((t) => `#${t.name.replace(/\s+/g, "_")}`).join(" "));
  }
  return lines.join("\n").trim();
}

export function arabicDate(iso: string) {
  return new Date(iso).toLocaleDateString("ar", { year: "numeric", month: "long", day: "numeric" });
}

/* ---------- export ---------- */

function csvCell(value: string | null | undefined) {
  const v = (value ?? "").replace(/"/g, '""');
  return `"${v}"`;
}

export function benefitsToCsv(items: Benefit[]) {
  const header = ["العنوان", "نص الفائدة", "الكتاب", "المؤلف", "الصفحة", "الموضوعات", "صورة المصدر", "تاريخ الإضافة"];
  const rows = items.map((b) =>
    [
      b.title,
      b.text,
      b.book?.title ?? "",
      b.author?.name ?? "",
      b.page_number ?? "",
      b.tags.map((t) => `#${t.name}`).join(" "),
      b.source_image_url ?? "",
      new Date(b.created_at).toISOString().slice(0, 10),
    ]
      .map(csvCell)
      .join(","),
  );
  return [header.map(csvCell).join(","), ...rows].join("\r\n");
}

export function flashcardsToAnkiCsv(cards: { question: string; answer: string; deck?: string | null }[]) {
  return cards
    .map((c) => [c.question, c.answer, c.deck ?? "جعبة الفوائد"].map(csvCell).join(","))
    .join("\r\n");
}

export function benefitsToNotionMarkdown(items: Benefit[]) {
  return items
    .map((b) => {
      const meta = [b.book?.title, b.author?.name, b.page_number ? `ص ${b.page_number}` : null]
        .filter(Boolean)
        .join(" · ");
      const tags = b.tags.map((t) => `#${t.name.replace(/\s+/g, "_")}`).join(" ");
      return [
        `## ${b.title}`,
        "",
        b.text
          .split("\n")
          .map((line) => `> ${line}`)
          .join("\n"),
        "",
        meta ? `**المصدر:** ${meta}` : null,
        tags ? `**الموضوعات:** ${tags}` : null,
        `**تاريخ الإضافة:** ${new Date(b.created_at).toISOString().slice(0, 10)}`,
        "",
        "---",
        "",
      ]
        .filter((line) => line !== null)
        .join("\n");
    })
    .join("\n");
}

export function downloadFile(filename: string, content: string, mime: string) {
  const bom = mime.includes("csv") ? "\uFEFF" : "";
  const blob = new Blob([bom + content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
