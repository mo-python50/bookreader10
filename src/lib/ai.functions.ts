import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const InputSchema = z.object({
  imageDataUrl: z.string().min(16),
  bookTitle: z.string().optional(),
  authorName: z.string().optional(),
});

export type PageAnalysis = {
  text: string;
  title: string;
  tags: string[];
  flashcard_question: string | null;
  flashcard_answer: string | null;
  confidence: "high" | "medium" | "low";
  note: string | null;
};

const jsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    text: { type: "string" },
    title: { type: "string" },
    tags: { type: "array", items: { type: "string" } },
    flashcard_question: { type: ["string", "null"] },
    flashcard_answer: { type: ["string", "null"] },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    note: { type: ["string", "null"] },
  },
  required: ["text", "title", "tags", "flashcard_question", "flashcard_answer", "confidence", "note"],
};

const SYSTEM = `أنت مساعد لاستخراج النصوص العربية من صور صفحات الكتب وتنظيمها.
قواعد صارمة:
1. انسخ النص العربي من الصورة حرفيًا كما هو، دون إعادة صياغة أو تصحيح أو تلخيص.
2. حافظ على علامات الترقيم وفواصل الأسطر والفقرات قدر الإمكان.
3. لا تخترع أي نص غير موجود في الصورة. إن كانت الصورة غير واضحة فاكتب ما تستطيع قراءته فقط واجعل confidence = "low" واذكر السبب في note.
4. حقل text = النص الأصلي المستخرج فقط.
5. حقل title = عنوان مقترح قصير من تأليفك (بيانات وصفية، ليس جزءًا من الاقتباس).
6. tags = من 2 إلى 5 موضوعات عربية قصيرة بدون علامة #.
7. flashcard_question و flashcard_answer: سؤال ومراجعة مبنيان على النص المستخرج فقط، أو null إن لم يكن ذلك مناسبًا.
8. أعد النتيجة على هيئة JSON فقط.`;

export const analyzeBookPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }): Promise<PageAnalysis> => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("خدمة الذكاء الاصطناعي غير مهيأة.");

    const context = [
      data.bookTitle ? `الكتاب: ${data.bookTitle}` : null,
      data.authorName ? `المؤلف: ${data.authorName}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        stream: true,
        instructions: SYSTEM,
        reasoning: { effort: "low", summary: "auto" },
        include: ["reasoning.encrypted_content"],
        store: false,
        text: {
          format: {
            type: "json_schema",
            name: "page_analysis",
            strict: true,
            schema: jsonSchema,
          },
        },
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: `استخرج النص العربي من صورة صفحة الكتاب هذه ونظّمه.${context ? `\n${context}` : ""}`,
              },
              { type: "input_image", image_url: data.imageDataUrl },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (res.status === 429) throw new Error("الخدمة مشغولة حاليًا، أعد المحاولة بعد قليل.");
      if (res.status === 402)
        throw new Error("انتهت أرصدة الذكاء الاصطناعي. أضف رصيدًا من إعدادات المساحة للمتابعة.");
      console.error("AI gateway error", res.status, body);
      throw new Error("تعذّر استخراج النص من الصورة.");
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error("تعذّر قراءة نتيجة الاستخراج.");

    const decoder = new TextDecoder();
    let buffer = "";
    let out = "";

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const event = JSON.parse(payload) as {
            type?: string;
            delta?: string;
            response?: { output_text?: string };
          };
          if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
            out += event.delta;
          } else if (event.type === "response.completed" && !out && event.response?.output_text) {
            out = event.response.output_text;
          }
        } catch {
          // ignore keep-alive / non-JSON lines
        }
      }
    }

    if (!out.trim()) throw new Error("لم يتم استخراج أي نص من الصورة. جرّب صورة أوضح.");

    let parsed: PageAnalysis;
    try {
      parsed = JSON.parse(out) as PageAnalysis;
    } catch {
      throw new Error("تعذّر قراءة نتيجة التحليل. أعد المحاولة.");
    }

    return {
      text: (parsed.text ?? "").trim(),
      title: (parsed.title ?? "").trim(),
      tags: Array.isArray(parsed.tags) ? parsed.tags.map((t) => t.replace(/^#/, "").trim()).filter(Boolean) : [],
      flashcard_question: parsed.flashcard_question?.trim() || null,
      flashcard_answer: parsed.flashcard_answer?.trim() || null,
      confidence: parsed.confidence ?? "medium",
      note: parsed.note?.trim() || null,
    };
  });
