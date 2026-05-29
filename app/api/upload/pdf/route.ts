import { NextResponse } from "next/server";
import pdfParse from "pdf-parse/lib/pdf-parse";

const MAX_PDF_BYTES = 8 * 1024 * 1024;
const MAX_TEXT_CHARS = 24000;

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "Upload a PDF file." }, { status: 400 });
  }

  if (file.type && file.type !== "application/pdf") {
    return NextResponse.json({ ok: false, error: "Only PDF files are supported right now." }, { status: 400 });
  }

  if (file.size > MAX_PDF_BYTES) {
    return NextResponse.json({ ok: false, error: "PDF is too large. Upload a file under 8 MB." }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = await pdfParse(buffer);
    const text = normalizePdfText(parsed.text).slice(0, MAX_TEXT_CHARS);

    if (text.length < 80) {
      return NextResponse.json(
        { ok: false, error: "I could not read enough text from this PDF. It may be scanned or image-only." },
        { status: 422 },
      );
    }

    return NextResponse.json({
      ok: true,
      filename: file.name,
      pages: parsed.numpages,
      text,
      truncated: parsed.text.length > MAX_TEXT_CHARS,
    });
  } catch {
    return NextResponse.json({ ok: false, error: "I could not extract text from that PDF." }, { status: 422 });
  }
}

function normalizePdfText(text: string): string {
  return text
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
