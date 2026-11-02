export interface ParsedPdfPayload {
  name: string;
  base64: string;
  text: string;
  sizeBytes: number;
}

/**
 * Reads a PDF file in the browser, returning its filename, Base64 representation,
 * and client-side extracted ASCII text segments from PDF text streams.
 */
export async function readPdfFile(file: File): Promise<ParsedPdfPayload> {
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const cleaned = result.replace(/^data:application\/pdf;base64,/i, '');
      resolve(cleaned);
    };
    reader.onerror = () => reject(new Error('Could not read the selected PDF file.'));
    reader.readAsDataURL(file);
  });

  let extractedText = '';
  try {
    const buffer = await file.arrayBuffer();
    const decoder = new TextDecoder('latin1');
    const raw = decoder.decode(new Uint8Array(buffer));
    const matches = raw.match(/\((?:\\.|[^\\()]){3,}\)/g) || [];
    const fragments: string[] = [];
    for (const token of matches) {
      const inner = token
        .slice(1, -1)
        .replace(/\\n|\\r|\\t/g, ' ')
        .replace(/\\\(/g, '(')
        .replace(/\\\)/g, ')')
        .replace(/[^\x20-\x7E]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (inner.length >= 3 && /[a-zA-Z]{3,}/.test(inner)) {
        fragments.push(inner);
      }
      if (fragments.length >= 400) break;
    }
    extractedText = fragments.join(' ').slice(0, 12000);
  } catch {
    extractedText = '';
  }

  return {
    name: file.name,
    base64,
    text: extractedText,
    sizeBytes: file.size,
  };
}
