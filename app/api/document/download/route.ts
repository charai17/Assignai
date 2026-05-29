import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import { createRequestId, jsonResult, parseJsonRequest } from "@/lib/api";

export const dynamic = "force-dynamic";

type DocumentPayload = {
  title?: unknown;
  content?: unknown;
};

export async function POST(request: Request) {
  const requestId = createRequestId();
  const parsed = await parseJsonRequest(request);

  if (!parsed.ok) {
    return jsonResult({ ok: false, result: parsed.error, raw: { requestId } }, 400, requestId);
  }

  const body = parsed.body as DocumentPayload;
  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : "AssignAI Document";
  const content = typeof body.content === "string" ? body.content.trim() : "";

  if (!content) {
    return jsonResult({ ok: false, result: "Missing document content.", raw: { requestId } }, 400, requestId);
  }

  if (content.length > 80_000) {
    return jsonResult({ ok: false, result: "Document content is too long to export.", raw: { requestId } }, 400, requestId);
  }

  const document = new Document({
    creator: "AssignAI",
    title,
    description: "Generated and edited in AssignAI",
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            text: title,
            heading: HeadingLevel.TITLE,
            spacing: { after: 300 },
          }),
          ...contentToParagraphs(content),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(document);

  return new Response(buffer as BodyInit, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "content-disposition": `attachment; filename="assignai-document.docx"`,
      "x-request-id": requestId,
    },
  });
}

function contentToParagraphs(content: string): Paragraph[] {
  return content
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .flatMap((block) => blockToParagraph(block));
}

function blockToParagraph(block: string): Paragraph[] {
  const clean = block.replace(/\r/g, "");

  if (/^#\s+/.test(clean)) {
    return [
      new Paragraph({
        text: clean.replace(/^#\s+/, ""),
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 240, after: 120 },
      }),
    ];
  }

  if (/^##\s+/.test(clean)) {
    return [
      new Paragraph({
        text: clean.replace(/^##\s+/, ""),
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 220, after: 100 },
      }),
    ];
  }

  const lines = clean.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.every((line) => /^[-*]\s+/.test(line))) {
    return lines.map((line) =>
      new Paragraph({
        children: [new TextRun(line.replace(/^[-*]\s+/, ""))],
        bullet: { level: 0 },
        spacing: { after: 80 },
      }),
    );
  }

  return [
    new Paragraph({
      children: [new TextRun(clean.replace(/\n/g, " "))],
      spacing: { after: 180 },
    }),
  ];
}
