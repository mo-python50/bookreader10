import { supabase } from "@/integrations/supabase/client";
import type { Benefit } from "@/lib/library";

export type Folder = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};

export type FolderNote = {
  id: string;
  folder_id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
};

export type FolderSummary = Folder & { noteCount: number; benefitCount: number };

export async function fetchFolders(): Promise<FolderSummary[]> {
  const { data, error } = await supabase
    .from("folders")
    .select("id,name,description,created_at,updated_at,folder_notes(id),folder_benefits(benefit_id)")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((folder) => ({
    id: folder.id,
    name: folder.name,
    description: folder.description,
    created_at: folder.created_at,
    updated_at: folder.updated_at,
    noteCount: folder.folder_notes.length,
    benefitCount: folder.folder_benefits.length,
  }));
}

export async function fetchFolder(id: string): Promise<Folder | null> {
  const { data, error } = await supabase
    .from("folders")
    .select("id,name,description,created_at,updated_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchFolderNotes(folderId: string): Promise<FolderNote[]> {
  const { data, error } = await supabase
    .from("folder_notes")
    .select("id,folder_id,title,content,created_at,updated_at")
    .eq("folder_id", folderId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

type FolderBenefitRow = {
  benefits: {
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
  } | null;
};

export async function fetchFolderBenefits(folderId: string): Promise<Benefit[]> {
  const { data, error } = await supabase
    .from("folder_benefits")
    .select("benefits(id,title,text,page_number,source_image_url,title_is_ai,ocr_confidence,created_at,books(id,title,authors(id,name)),benefit_tags(tags(id,name)))")
    .eq("folder_id", folderId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as FolderBenefitRow[]).flatMap((row) => {
    const benefit = row.benefits;
    if (!benefit) return [];
    return [{
      id: benefit.id,
      title: benefit.title,
      text: benefit.text,
      page_number: benefit.page_number,
      source_image_url: benefit.source_image_url,
      title_is_ai: benefit.title_is_ai,
      ocr_confidence: benefit.ocr_confidence,
      created_at: benefit.created_at,
      book: benefit.books ? { id: benefit.books.id, title: benefit.books.title } : null,
      author: benefit.books?.authors ? { id: benefit.books.authors.id, name: benefit.books.authors.name } : null,
      tags: (benefit.benefit_tags ?? []).flatMap((item) => (item.tags ? [item.tags] : [])),
    }];
  });
}