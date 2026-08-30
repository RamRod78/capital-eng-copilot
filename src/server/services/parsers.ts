import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import * as xlsx from 'xlsx';

export async function parseUploadedFileBuffer(
  buffer: Buffer,
  filename: string
): Promise<{ text: string; error?: string }> {
  if (!buffer || buffer.length === 0) {
    return { text: '', error: 'Uploaded file buffer is empty.' };
  }

  const ext = filename.toLowerCase().split('.').pop() || '';

  try {
    if (['txt', 'md', 'json'].includes(ext)) {
      return { text: buffer.toString('utf-8') };
    }

    if (ext === 'pdf') {
      const pdfData = await pdfParse(buffer);
      const extractedText = pdfData.text || '';
      if (!extractedText.trim()) {
        return { text: '', error: 'PDF contained no extractable text (it might be a scanned image).' };
      }
      return { text: extractedText };
    }

    if (['docx', 'doc'].includes(ext)) {
      const result = await mammoth.extractRawText({ buffer });
      const extractedText = result.value || '';
      if (!extractedText.trim()) {
        return { text: '', error: 'Word document contained no extractable text.' };
      }
      return { text: extractedText };
    }

    if (['xlsx', 'xls'].includes(ext)) {
      const workbook = xlsx.read(buffer, { type: 'buffer' });
      const sheetTexts: string[] = [];
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const csvContent = xlsx.utils.sheet_to_csv(sheet);
        if (csvContent.trim()) {
          sheetTexts.push(`--- [Sheet: ${sheetName}] ---\n${csvContent}`);
        }
      }
      return { text: sheetTexts.join('\n\n') };
    }

    if (ext === 'csv') {
      return { text: buffer.toString('utf-8') };
    }

    // Default fallback
    return { text: buffer.toString('utf-8') };
  } catch (err: any) {
    console.error(`Error parsing file ${filename}:`, err);
    return { text: '', error: `Failed to parse ${filename}: ${err.message || String(err)}` };
  }
}
