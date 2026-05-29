import pptxgen from "pptxgenjs";
import { applyRateLimit, createRequestId, jsonResult, parseJsonRequest, validateGenerationPayload } from "@/lib/api";
import { generateResult } from "@/lib/ai";
import { getConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

type DeckSlide = {
  title: string;
  bullets: string[];
  notes: string;
  visual: string;
};

export async function POST(request: Request) {
  const requestId = createRequestId();
  const rateLimited = applyRateLimit(request, "powerpoint", requestId);
  if (rateLimited) return rateLimited;

  const parsed = await parseJsonRequest(request);
  if (!parsed.ok) {
    return jsonResult({ ok: false, result: parsed.error, raw: { requestId } }, 400, requestId);
  }

  const validated = validateGenerationPayload(parsed.body, getConfig().limits.maxInputChars);
  if (!validated.ok) {
    return jsonResult({ ok: false, result: validated.error, raw: { requestId } }, 400, requestId);
  }

  const body = parsed.body as Record<string, unknown>;
  let deckText = typeof body.deckText === "string" && body.deckText.trim() ? body.deckText.trim() : "";

  if (!deckText) {
    const { result, status } = await generateResult({
      kind: "powerpoint",
      input: validated.value.input,
      payload: validated.value.payload,
      requestId,
    });

    if (!result.ok) {
      return jsonResult(result, status, requestId);
    }

    deckText = result.result;
  }

  const slides = parseDeck(deckText, validated.value.input);
  const buffer = await buildPresentation(slides);

  return new Response(buffer as BodyInit, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "content-disposition": `attachment; filename="assignai-presentation.pptx"`,
      "x-request-id": requestId,
    },
  });
}

function parseDeck(text: string, fallbackTitle: string): DeckSlide[] {
  const chunks = text
    .split(/(?=^Slide\s+\d+\s*[:.-])/gim)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  const slides = chunks.map((chunk, index) => parseSlide(chunk, index + 1)).filter(Boolean) as DeckSlide[];

  if (slides.length > 0) return slides.slice(0, 12);

  return [
    {
      title: cleanTitle(fallbackTitle) || "AssignAI Presentation",
      bullets: ["Introduce the topic", "State the central argument", "Preview the presentation structure"],
      visual: "Title slide",
      notes: "Open with the topic, the audience need, and the conclusion you will defend.",
    },
    {
      title: "Key Points",
      bullets: text.split("\n").map((line) => line.replace(/^[-*]\s*/, "").trim()).filter(Boolean).slice(0, 5),
      visual: "Simple evidence cards",
      notes: "Use this slide to summarize the generated outline if the deck text did not follow slide formatting.",
    },
  ];
}

function parseSlide(chunk: string, number: number): DeckSlide | null {
  const lines = chunk.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return null;

  const title = cleanTitle(lines[0].replace(/^Slide\s+\d+\s*[:.-]\s*/i, "")) || `Slide ${number}`;
  const bullets: string[] = [];
  let visual = "Relevant image, chart, or simple diagram";
  let notes = "Use speaker notes to explain the slide rather than reading it word for word.";

  for (const line of lines.slice(1)) {
    const normalized = line.replace(/^[-*]\s*/, "").trim();
    if (/^suggested visual\s*:/i.test(normalized)) {
      visual = normalized.replace(/^suggested visual\s*:/i, "").trim() || visual;
    } else if (/^speaker notes\s*:/i.test(normalized)) {
      notes = normalized.replace(/^speaker notes\s*:/i, "").trim() || notes;
    } else if (normalized && !/^slide\s+\d+/i.test(normalized)) {
      bullets.push(normalized);
    }
  }

  return {
    title,
    bullets: bullets.slice(0, 5),
    visual,
    notes,
  };
}

async function buildPresentation(slides: DeckSlide[]): Promise<Buffer> {
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "AssignAI";
  pptx.company = "AssignAI";
  pptx.subject = "Generated academic presentation";
  pptx.title = slides[0]?.title || "AssignAI Presentation";
  pptx.theme = {
    headFontFace: "Aptos Display",
    bodyFontFace: "Aptos",
  };

  slides.forEach((deckSlide, index) => {
    const slide = pptx.addSlide();
    slide.background = { color: index === 0 ? "FBF7EF" : "FFFDF8" };

    slide.addText(index === 0 ? "AssignAI" : `Slide ${index + 1}`, {
      x: 0.55,
      y: 0.3,
      w: 2.2,
      h: 0.3,
      fontFace: "Aptos",
      fontSize: 10,
      bold: true,
      color: "78716C",
      margin: 0,
    });

    slide.addText(deckSlide.title, {
      x: 0.55,
      y: 0.75,
      w: 8.0,
      h: 0.65,
      fontFace: "Aptos Display",
      fontSize: index === 0 ? 30 : 25,
      bold: true,
      color: "1C1917",
      margin: 0,
      fit: "shrink",
    });

    slide.addShape(pptx.ShapeType.rect, {
      x: 0.58,
      y: 1.65,
      w: 4.95,
      h: 3.8,
      fill: { color: "FFFFFF" },
      line: { color: "E7E5E4", width: 1 },
    });

    slide.addText(formatBullets(deckSlide.bullets), {
      x: 0.9,
      y: 1.95,
      w: 4.25,
      h: 2.9,
      fontFace: "Aptos",
      fontSize: 16,
      color: "292524",
      fit: "shrink",
      valign: "middle",
      bullet: { type: "bullet" },
      paraSpaceAfter: 10,
    });

    slide.addShape(pptx.ShapeType.rect, {
      x: 6.0,
      y: 1.65,
      w: 6.7,
      h: 2.0,
      fill: { color: "F5F5F4" },
      line: { color: "E7E5E4", width: 1 },
    });

    slide.addText("Suggested visual", {
      x: 6.35,
      y: 1.95,
      w: 5.9,
      h: 0.25,
      fontFace: "Aptos",
      fontSize: 10,
      bold: true,
      color: "78716C",
      margin: 0,
    });

    slide.addText(deckSlide.visual, {
      x: 6.35,
      y: 2.3,
      w: 5.9,
      h: 0.8,
      fontFace: "Aptos Display",
      fontSize: 19,
      bold: true,
      color: "1C1917",
      fit: "shrink",
      margin: 0,
    });

    slide.addText(`Speaker notes: ${deckSlide.notes}`, {
      x: 6.0,
      y: 4.05,
      w: 6.7,
      h: 1.1,
      fontFace: "Aptos",
      fontSize: 12,
      color: "57534E",
      fit: "shrink",
    });
  });

  const written = await pptx.write({ outputType: "nodebuffer" });
  return Buffer.isBuffer(written) ? written : Buffer.from(written as ArrayBuffer);
}

function formatBullets(bullets: string[]): string {
  const clean = bullets.length > 0 ? bullets : ["Add the main point", "Add evidence", "Explain why it matters"];
  return clean.map((bullet) => bullet.replace(/^[-*]\s*/, "").trim()).filter(Boolean).join("\n");
}

function cleanTitle(value: string): string {
  return value.replace(/[*#_`]/g, "").replace(/\s+/g, " ").trim().slice(0, 90);
}
