import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const root = import.meta.dir.replace(/\\scripts$/, "");
const txtPath = join(root, "assets", "guidelines", "demo-guideline.txt");
const pdfPath = join(root, "assets", "guidelines", "demo-guideline.pdf");

function escapePdf(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function makeContent(text: string): string {
  const lines = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .flatMap((line) => {
      if (line.length <= 88) return [line];
      const chunks: string[] = [];
      let rest = line;
      while (rest.length > 88) {
        const cut = rest.lastIndexOf(" ", 88);
        const index = cut > 20 ? cut : 88;
        chunks.push(rest.slice(0, index));
        rest = rest.slice(index).trimStart();
      }
      chunks.push(rest);
      return chunks;
    });

  const body = lines
    .slice(0, 42)
    .map((line, index) => {
      const y = index === 0 ? 744 : -16;
      return `${index === 0 ? "" : "0 "}${y} Td\n(${escapePdf(line)}) Tj`;
    })
    .join("\n");

  return `BT\n/F1 10 Tf\n72 744 Td\n${body}\nET\n`;
}

function makePdf(text: string): string {
  const stream = makeContent(text);
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 0; i < objects.length; i += 1) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefOffset}\n%%EOF\n`;
  return pdf;
}

mkdirSync(dirname(pdfPath), { recursive: true });
writeFileSync(pdfPath, makePdf(readFileSync(txtPath, "utf8")));
console.log(`Wrote ${pdfPath}`);
