declare module "pdf-parse" {
  type PdfParseResult = {
    numpages: number;
    text: string;
  };

  export default function pdfParse(buffer: Buffer): Promise<PdfParseResult>;
}

declare module "pdf-parse/lib/pdf-parse" {
  type PdfParseResult = {
    numpages: number;
    text: string;
  };

  export default function pdfParse(buffer: Buffer): Promise<PdfParseResult>;
}
