// Generates samples/zyntra-sample-leads.pdf — 10 FAKE Indian clothing-brand leads
// for testing the PDF import. Rows 2 and 4 are duplicates of seed.sql leads
// (Kesariya Threads by phone, Mumbai Streetwear Co. by Instagram link).
// Run: node scripts/make-sample-pdf.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const COLUMNS = [
  ["Brand", 92], ["Owner", 66], ["Phone", 66], ["WhatsApp", 66], ["Email", 112],
  ["Instagram", 124], ["Website", 96], ["City", 52], ["State", 60], ["Category", 66],
];

const ROWS = [
  ["Rangreza Apparel", "Imran Qureshi", "98290 11223", "98290 11223", "orders@rangreza.in", "@rangreza.apparel", "rangreza.in", "Jaipur", "Rajasthan", "Clothing"],
  ["Kesariya Threads", "Riya Patel", "+91-98765-43210", "-", "sales@kesariyathreads.in", "-", "-", "Ahmedabad", "Gujarat", "Clothing Brand"],
  ["Bombay Denim Lab", "Aditya Rao", "12345 678", "-", "hi@bombaydenimlab.com", "bombaydenimlab", "bombaydenimlab.com", "Mumbai", "Maharashtra", "Denim"],
  ["Mumbai Streetwear Co.", "Aarav Mehta", "99300 99887", "-", "-", "instagram.com/mumbaistreetwear", "-", "Mumbai", "MH", "Streetwear"],
  ["Bengaluru Loom Co.", "Kavya Reddy", "9845012345", "-", "hello@bengaluruloom.com", "bengaluruloom", "www.bengaluruloom.com", "Bangalore", "-", "Ethnic Wear"],
  ["Kolkata Kantha Studio", "Sharmila Das", "+91 98300 12345", "+91 98300 12345", "studio@kolkatakantha.in", "kolkatakantha", "kolkatakantha.in", "Kolkata", "West Bengal", "Clothing Brand"],
  ["Ludhiana Knits", "Harpreet Singh", "98140-22334", "-", "-", "ludhianaknits", "-", "Ludhiana", "Punjab", "Winter Wear"],
  ["Lucknow Chikan House", "Farah Naqvi", "9415098765", "9415098765", "farah@lucknowchikan.in", "lucknowchikanhouse", "-", "Lucknow", "Uttar Pradesh", "Ethnic Wear"],
  ["Goa Beach Threads", "-", "-", "-", "-", "goabeachthreads", "-", "Panaji", "Goa", "Resort Wear"],
  ["Mystery Fabrics", "-", "9988776655", "-", "-", "-", "-", "-", "-", "Clothing"],
];

const doc = await PDFDocument.create();
doc.setTitle("Zyntra sample leads (fake data)");
const font = await doc.embedFont(StandardFonts.Helvetica);
const bold = await doc.embedFont(StandardFonts.HelveticaBold);
const SIZE = 7;
const ROW_H = 18;

function page(rows, pageNo) {
  const p = doc.addPage([842, 595]); // A4 landscape
  let y = 555;
  p.drawText("Zyntra Lead List — Clothing Brands (SAMPLE, FAKE DATA)", { x: 20, y, size: 13, font: bold });
  p.drawText(`Page ${pageNo} of 2 · for testing the PDF import only`, { x: 20, y: y - 16, size: 8, font, color: rgb(0.4, 0.4, 0.4) });
  y -= 45;
  const drawRow = (cells, f, shade) => {
    if (shade) p.drawRectangle({ x: 16, y: y - 5, width: 812, height: ROW_H, color: rgb(0.93, 0.94, 0.98) });
    let x = 20;
    cells.forEach((c, i) => {
      p.drawText(c, { x, y, size: SIZE, font: f });
      x += COLUMNS[i][1];
    });
    y -= ROW_H;
  };
  drawRow(COLUMNS.map((c) => c[0]), bold, true);
  rows.forEach((r) => drawRow(r, font, false));
}

page(ROWS.slice(0, 6), 1);
page(ROWS.slice(6), 2);
mkdirSync("samples", { recursive: true });
writeFileSync("samples/zyntra-sample-leads.pdf", await doc.save());
console.log("Wrote samples/zyntra-sample-leads.pdf");
