import { getAIConfig } from "@/lib/ai-provider";
import { processAndSynthesizeInput } from "@/lib/knowledge-engine";
import { saveKnowledgeWithEmbedding } from "@/lib/search-pipeline";

export interface DocumentExtraction {
  title: string;
  summary: string;
  aiMemory: string;
  category: string;
  tags: string[];
  vendor?: string;
  extractedAmount?: number;
  expiryDate?: Date;
  documentType?: string;
  rawText: string;
}

export async function extractTextFromImage(base64Image: string): Promise<string> {
  try {
    const Tesseract = await import("tesseract.js");
    const result = await Tesseract.recognize(
      `data:image/png;base64,${base64Image}`,
      "eng+hin",
      { logger: () => {} }
    );
    return result.data.text.trim();
  } catch (error) {
    console.warn("[DocumentOCR] Tesseract failed:", error);
    return "";
  }
}

export async function analyzeDocumentText(rawText: string, sourceLabel = "upload"): Promise<DocumentExtraction> {
  const config = getAIConfig();

  if (!config || !rawText.trim()) {
    const processed = await processAndSynthesizeInput(rawText.slice(0, 2000), "document");
    return {
      title: processed.title,
      summary: processed.summary,
      aiMemory: processed.aiMemory,
      category: processed.category,
      tags: processed.tags,
      rawText,
    };
  }

  const prompt = `Analyze this document text and return JSON:
{
  "title": "document title",
  "summary": "2 sentence summary",
  "aiMemory": "1 sentence memory of what this document is",
  "category": "Bill|Receipt|ID|Contract|Invoice|General",
  "tags": ["tag1", "tag2"],
  "vendor": "company or issuer name or null",
  "extractedAmount": 1234.56 or null,
  "expiryDate": "YYYY-MM-DD or null",
  "documentType": "bill|receipt|passport|license|invoice|other"
}

Document source: ${sourceLabel}
Text:
${rawText.slice(0, 4000)}`;

  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
      }),
    });

    if (!response.ok) throw new Error("LLM extraction failed");
    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content || "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

    return {
      title: parsed.title || "Uploaded Document",
      summary: parsed.summary || rawText.slice(0, 150),
      aiMemory: parsed.aiMemory || "Uploaded document for reference.",
      category: parsed.category || "General",
      tags: Array.isArray(parsed.tags) ? parsed.tags : ["document"],
      vendor: parsed.vendor || undefined,
      extractedAmount: typeof parsed.extractedAmount === "number" ? parsed.extractedAmount : undefined,
      expiryDate: parsed.expiryDate ? new Date(parsed.expiryDate) : undefined,
      documentType: parsed.documentType || "other",
      rawText,
    };
  } catch (error) {
    console.warn("[DocumentOCR] LLM analysis failed:", error);
    const processed = await processAndSynthesizeInput(rawText.slice(0, 2000), "document");
    return {
      title: processed.title,
      summary: processed.summary,
      aiMemory: processed.aiMemory,
      category: processed.category,
      tags: processed.tags,
      rawText,
    };
  }
}

export async function processDocumentUpload(
  userId: string,
  rawText: string,
  sourceLabel = "web-upload"
) {
  const extraction = await analyzeDocumentText(rawText, sourceLabel);
  const item = await saveKnowledgeWithEmbedding(userId, {
    title: extraction.title,
    summary: extraction.summary,
    aiMemory: extraction.aiMemory,
    type: "document",
    category: extraction.category,
    tags: extraction.tags,
    content: extraction.rawText,
    vendor: extraction.vendor || null,
    extractedAmount: extraction.extractedAmount || null,
    expiryDate: extraction.expiryDate || null,
    documentType: extraction.documentType || null,
    metadata: { source: sourceLabel },
  });
  return { item, extraction };
}
