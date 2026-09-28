import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const ImageInputSchema = z.object({
  imageDataUrl: z.string().min(16),
  bookTitle: z.string().optional(),
  authorName: z.string().optional(),
});

const TextInputSchema = z.object({
  text: z.string().trim().min(2).max(20000),
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
1. استخرج كل الكلمات العربية من الصورة كما هي حرفيًا، دون إعادة صياغة أو تصحيح أو تلخيص أو تغيير ترتيب الجمل.
2. نسّق النص ليكون جاهزًا للقراءة والنسخ: أزل فواصل الأسطر الناتجة عن ضيق عمود الصفحة، واجمع أسطر الفقرة الواحدة، وضع سطرًا فارغًا بين الفقرات الحقيقية.
3. أزل أرقام الصفحات والترويسات والتذييلات المتكررة فقط إذا كانت عناصر طباعية منفصلة بوضوح، ولا تحذف شيئًا من متن الاقتباس.
4. حافظ على علامات الترقيم الأصلية كما هي. لا تضف عناوين فرعية أو تعدادًا أو علامات ترقيم غير موجودة.
5. لا تخترع أي نص غير موجود في الصورة. إن كانت الصورة غير واضحة فاكتب ما تستطيع قراءته فقط واجعل confidence = "low" واذكر السبب في note.
6. حقل text = النص الأصلي بعد تنسيق الفقرات فقط.
7. حقل title = عنوان مقترح قصير من تأليفك (بيانات وصفية، ليس جزءًا من الاقتباس).
8. tags = من 2 إلى 5 موضوعات عربية قصيرة بدون علامة #.
9. flashcard_question و flashcard_answer: سؤال ومراجعة مبنيان على النص المستخرج فقط، أو null إن لم يكن ذلك مناسبًا.
10. أعد النتيجة على هيئة JSON فقط.`;

const TEXT_SYSTEM = `أنت مساعد لتنظيم فوائد الكتب العربية.
لديك نص كتبه المستخدم بنفسه من كتاب (مقتطف أو فائدة). قواعد صارمة:
1. لا تغيّر نص المستخدم أبدًا: أعد حقل text مطابقًا للنص المُعطى حرفيًا، دون أي تعديل أو صياغة أو تلخيص أو تصحيح.
2. حقل title = عنوان مقترح قصير من تأليفك (بيانات وصفية، ليس جزءًا من النص).
3. tags = من 2 إلى 5 موضوعات عربية قصيرة بدون علامة #.
4. flashcard_question و flashcard_answer: سؤال ومراجعة مبنيان على النص فقط، أو null إن لم يكن ذلك مناسبًا.
5. اجعل confidence = "high" دائمًا، لأن النص مكتوب وليس مستخرجًا من صورة.
6. أعد النتيجة على هيئة JSON فقط.`;

async function runResponses(body: Record<string, unknown>, emptyMessage: string): Promise<string> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("خدمة الذكاء الاصطناعي غير مهيأة.");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    if (res.status === 429) throw new Error("الخدمة مشغولة حاليًا، أعد المحاولة بعد قليل.");
    if (res.status === 402)
      throw new Error("انتهت أرصدة الذكاء الاصطناعي. أضف رصيدًا من إعدادات المساحة للمتابعة.");
    console.error("AI gateway error", res.status, errBody);
    throw new Error(emptyMessage);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("تعذّر قراءة النتيجة.");

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

  if (!out.trim()) throw new Error(emptyMessage);
  return out;
}

function parseAnalysis(out: string): PageAnalysis {
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
}

export const analyzeBookPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ImageInputSchema.parse(input))
  .handler(async ({ data }): Promise<PageAnalysis> => {
    const context = [
      data.bookTitle ? `الكتاب: ${data.bookTitle}` : null,
      data.authorName ? `المؤلف: ${data.authorName}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const out = await runResponses(
      {
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
      },
      "تعذّر استخراج النص من الصورة.",
    );

    return parseAnalysis(out);
  });

export const suggestForWrittenText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => TextInputSchema.parse(input))
  .handler(async ({ data }): Promise<PageAnalysis> => {
    const context = [
      data.bookTitle ? `الكتاب: ${data.bookTitle}` : null,
      data.authorName ? `المؤلف: ${data.authorName}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const out = await runResponses(
      {
        model: "openai/gpt-6-astra",
        stream: true,
        instructions: TEXT_SYSTEM,
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
                text: `هذا نصٌ كتبه المستخدم بنفسه. اقترح عنوانًا وموضوعات وبطاقة مراجعة له دون تغيير النص.${context ? `\n${context}` : ""}\n\nالنص:\n${data.text}`,
              },
            ],
          },
        ],
      },
      "تعذّر تحليل النص.",
    );

    return parseAnalysis(out);
  });
