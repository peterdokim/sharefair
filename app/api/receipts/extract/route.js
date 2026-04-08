import { NextResponse } from "next/server";
import { PDFParse } from "pdf-parse";

export const runtime = "nodejs";

export async function POST(request) {
  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");

  if (!file || typeof file.arrayBuffer !== "function") {
    return NextResponse.json({ error: "Upload a PDF receipt file first." }, { status: 400 });
  }

  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");

  if (!isPdf) {
    return NextResponse.json({ error: "Only PDF receipt extraction is supported on this route." }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const parser = new PDFParse({ data: buffer });

    try {
      const parsed = await parser.getText();
      const text = String(parsed.text || "").trim();

      if (!text) {
        return NextResponse.json(
          {
            error: "No selectable text was found in that PDF. This works best for electronic receipts, not scanned images."
          },
          { status: 422 }
        );
      }

      return NextResponse.json({ text });
    } finally {
      await parser.destroy().catch(() => {});
    }
  } catch (error) {
    return NextResponse.json(
      {
        error: error.message || "Could not extract text from that PDF receipt."
      },
      { status: 500 }
    );
  }
}
