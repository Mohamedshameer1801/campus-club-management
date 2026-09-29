import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";
import type { CertificateTemplate } from "./clubs";

/** Standard PDF fonts only support WinAnsi; replace anything else so rendering never throws. */
export const safe = (s: string) => s.replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");

function hex(color: string) {
  const n = parseInt(color.replace("#", ""), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of safe(text).split(/\s+/)) {
    const test = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(test, size) > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

export interface CertificatePdfData {
  certificateNumber: string;
  studentName: string;
  raNumber: string;
  eventTitle: string;
  clubName: string;
  eventDate: string;
  participationRole: string;
  issuedAt: Date;
}

export async function renderCertificatePdf(d: CertificatePdfData, tpl: CertificateTemplate, verifyUrl: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Certificate ${d.certificateNumber}`);
  pdf.setAuthor(safe(d.clubName));
  const page = pdf.addPage([842, 595]);
  const serifBold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const serif = await pdf.embedFont(StandardFonts.TimesRoman);
  const italic = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  const sans = await pdf.embedFont(StandardFonts.Helvetica);
  const accent = hex(tpl.accentColor);
  const ink = rgb(0.12, 0.12, 0.18);
  const W = 842;
  const center = (text: string, y: number, font: PDFFont, size: number, color = ink) => {
    const t = safe(text);
    page.drawText(t, { x: (W - font.widthOfTextAtSize(t, size)) / 2, y, size, font, color });
  };

  page.drawRectangle({ x: 20, y: 20, width: W - 40, height: 555, borderColor: accent, borderWidth: 4 });
  page.drawRectangle({ x: 32, y: 32, width: W - 64, height: 531, borderColor: accent, borderWidth: 1 });

  center(safe(d.clubName).toUpperCase(), 520, sans, 12, accent);
  center(tpl.headerTitle || "Certificate of Participation", 478, serifBold, 34, ink);
  center("This is to certify that", 434, italic, 15);
  center(d.studentName, 388, serifBold, 32, accent);
  center(`RA Number: ${d.raNumber}`, 364, sans, 11, rgb(0.35, 0.35, 0.4));

  const defaultBody = `has taken part as ${d.participationRole} in "${d.eventTitle}" organised by ${d.clubName} on ${d.eventDate}, with attendance confirmed by the organisers.`;
  const body = tpl.bodyText
    ? tpl.bodyText.replace(/\{name\}/g, d.studentName).replace(/\{event\}/g, d.eventTitle).replace(/\{club\}/g, d.clubName).replace(/\{date\}/g, d.eventDate).replace(/\{role\}/g, d.participationRole)
    : defaultBody;
  wrap(body, serif, 15, 620).forEach((l, i) => center(l, 322 - i * 22, serif, 15));

  center(`Participation role: ${d.participationRole}`, 232, sans, 12, ink);

  // signature block
  page.drawLine({ start: { x: 90, y: 120 }, end: { x: 290, y: 120 }, thickness: 1, color: ink });
  const sigName = safe(tpl.signatoryName || "Authorised signatory");
  page.drawText(sigName, { x: 90, y: 104, size: 12, font: serifBold, color: ink });
  page.drawText(safe(tpl.signatoryTitle), { x: 90, y: 90, size: 10, font: sans, color: rgb(0.35, 0.35, 0.4) });

  // certificate id + verification QR
  center(`Certificate ID: ${d.certificateNumber}`, 78, sans, 11, ink);
  center(`Issued ${d.issuedAt.toISOString().slice(0, 10)}  |  Verify at ${verifyUrl}`, 62, sans, 8, rgb(0.4, 0.4, 0.45));
  if (tpl.footerText) center(tpl.footerText, 46, italic, 9, rgb(0.4, 0.4, 0.45));
  const qr = await pdf.embedPng(await QRCode.toBuffer(verifyUrl, { width: 220, margin: 1 }));
  page.drawImage(qr, { x: 650, y: 78, width: 100, height: 100 });
  page.drawText("Scan to verify", { x: 665, y: 66, size: 8, font: sans, color: rgb(0.4, 0.4, 0.45) });

  return pdf.save();
}

/** Minimal flowing-text PDF writer (wrapping + automatic page breaks) used for the portfolio export. */
export class PdfWriter {
  private page!: PDFPage;
  private y = 0;
  private constructor(private pdf: PDFDocument, private font: PDFFont, private bold: PDFFont) {}
  static async create(title: string) {
    const pdf = await PDFDocument.create();
    pdf.setTitle(safe(title));
    const w = new PdfWriter(pdf, await pdf.embedFont(StandardFonts.Helvetica), await pdf.embedFont(StandardFonts.HelveticaBold));
    w.newPage();
    return w;
  }
  private newPage() {
    this.page = this.pdf.addPage([595, 842]);
    this.y = 800;
  }
  gap(n = 8) {
    this.y -= n;
  }
  text(t: string, o: { size?: number; bold?: boolean; indent?: number; color?: [number, number, number] } = {}) {
    const size = o.size ?? 10;
    const font = o.bold ? this.bold : this.font;
    const indent = o.indent ?? 0;
    for (const line of wrap(t, font, size, 495 - indent)) {
      if (this.y < 50) this.newPage();
      const c = o.color ?? [0.1, 0.1, 0.15];
      this.page.drawText(line, { x: 50 + indent, y: this.y, size, font, color: rgb(c[0], c[1], c[2]) });
      this.y -= size + 4;
    }
  }
  heading(t: string) {
    this.gap(10);
    this.text(t.toUpperCase(), { size: 11, bold: true, color: [0.3, 0.25, 0.7] });
    if (this.y < 50) this.newPage();
    this.page.drawLine({ start: { x: 50, y: this.y + 6 }, end: { x: 545, y: this.y + 6 }, thickness: 0.5, color: rgb(0.7, 0.7, 0.8) });
    this.gap(2);
  }
  async save() {
    return this.pdf.save();
  }
}
