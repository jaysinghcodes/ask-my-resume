declare module "pdf-parse/lib/pdf-parse.js" {
  interface PdfData {
    text: string;
  }
  function pdfParse(data: Buffer): Promise<PdfData>;
  export default pdfParse;
}
