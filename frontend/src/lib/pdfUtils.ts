export interface ParsedPdfPayload {
  name: string;
  base64: string;
  text: string;
  sizeBytes: number;
}

/**
 * Checks whether a candidate string is clean, human-readable prose
 * and not compressed binary or font-encoding gibberish.
 */
export function isCleanHumanText(value: string): boolean {
  const clean = value.replace(/\s+/g, ' ').trim();
  if (clean.length < 18) return false;

  const totalLen = clean.length;
  const letters = (clean.match(/[a-zA-Z]/g) || []).length;
  const spaces = (clean.match(/ /g) || []).length;
  const weirdSymbols = (clean.match(/[\\$%^&*~`|<>[\]{}_+=@#]/g) || []).length;

  // Reject if there are suspicious symbol clusters
  if (weirdSymbols >= 2 || weirdSymbols / totalLen > 0.02) {
    return false;
  }

  // Must be predominantly letters and spaces
  if ((letters + spaces) / totalLen < 0.8) {
    return false;
  }

  // Must have a natural English vowel ratio
  const vowels = (clean.match(/[aeiouAEIOU]/g) || []).length;
  if (letters > 0) {
    const vowelRatio = vowels / letters;
    if (vowelRatio < 0.22 || vowelRatio > 0.65) {
      return false;
    }
  }

  // Must have at least 4 real words (3+ letters each)
  const realWords = clean.match(/\b[a-zA-Z]{3,}\b/g) || [];
  if (realWords.length < 4) {
    return false;
  }

  // Reject strings with many single-character tokens ("\$ MW _ Z r lKEfv...")
  const tokens = clean.split(' ').filter(Boolean);
  if (tokens.length >= 5) {
    const shortTokens = tokens.filter((t) => t.replace(/[^a-zA-Z0-9]/g, '').length <= 1).length;
    if (shortTokens / tokens.length > 0.28) {
      return false;
    }
  }

  return true;
}

async function tryInflateBytes(bytes: Uint8Array, format: 'deflate' | 'deflate-raw'): Promise<Uint8Array | null> {
  if (typeof DecompressionStream === 'undefined') return null;
  try {
    const ds = new DecompressionStream(format);
    const writer = ds.writable.getWriter();
    writer.write(bytes as unknown as BufferSource).catch(() => {});
    writer.close().catch(() => {});

    const reader = ds.readable.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        total += value.byteLength;
        if (total > 512_000) break;
      }
    }
    const output = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      output.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return output;
  } catch {
    return null;
  }
}

function unescapePdfLiteral(str: string): string {
  return str
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, ' ')
    .replace(/\\t/g, ' ')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\')
    .replace(/[^\x20-\x7E\n]/g, ' ');
}

function extractTextFromDecodedStream(decoded: string): string[] {
  if (!decoded.includes('BT') || !decoded.includes('ET')) {
    return [];
  }

  const lines: string[] = [];
  const btBlocks = decoded.match(/BT[\s\S]*?ET/g) || [];

  for (const block of btBlocks) {
    let blockText = '';

    const tjArrays = block.match(/\[([\s\S]*?)\]\s*TJ/g) || [];
    if (tjArrays.length > 0) {
      for (const arr of tjArrays) {
        const parts = arr.match(/\((?:\\.|[^\\()])*\)/g) || [];
        for (const p of parts) {
          blockText += unescapePdfLiteral(p.slice(1, -1));
        }
        blockText += ' ';
      }
    } else {
      const literals = block.match(/\((?:\\.|[^\\()])*\)\s*(?:Tj|'|")/g) || [];
      for (const lit of literals) {
        const openIdx = lit.indexOf('(');
        const closeIdx = lit.lastIndexOf(')');
        if (openIdx !== -1 && closeIdx > openIdx) {
          blockText += unescapePdfLiteral(lit.slice(openIdx + 1, closeIdx)) + ' ';
        }
      }
    }

    const normalized = blockText.replace(/\s+/g, ' ').trim();
    if (normalized.length >= 3 && /[a-zA-Z]{2,}/.test(normalized)) {
      lines.push(normalized);
    }
  }

  return lines;
}

/**
 * Reads a PDF file in the browser, returning its filename, Base64 representation,
 * and verified human-readable text extracted from decompressed PDF text streams.
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
    const bytes = new Uint8Array(buffer);
    const decoder = new TextDecoder('latin1');
    const raw = decoder.decode(bytes);

    const streamRegex = /<<([\s\S]*?)>>\s*stream\r?\n/g;
    const collectedChunks: string[] = [];
    let match: RegExpExecArray | null;
    let streamCount = 0;

    while ((match = streamRegex.exec(raw)) !== null && streamCount < 120) {
      const dict = match[1] || '';
      if (/\/Subtype\s*\/Image|\/FontFile|\/Type\s*\/Metadata|\/Type\s*\/XRef/i.test(dict)) {
        continue;
      }

      const dataStart = match.index + match[0].length;
      const endIndex = raw.indexOf('endstream', dataStart);
      if (endIndex === -1) break;

      let dataEnd = endIndex;
      if (raw[dataEnd - 1] === '\n') dataEnd -= 1;
      if (raw[dataEnd - 1] === '\r') dataEnd -= 1;

      if (dataEnd <= dataStart || dataEnd - dataStart > 512_000) {
        continue;
      }

      streamCount += 1;
      const streamSlice = bytes.subarray(dataStart, dataEnd);
      let decodedStream = '';

      if (/\/FlateDecode/i.test(dict)) {
        const inflated =
          (await tryInflateBytes(streamSlice, 'deflate')) ||
          (await tryInflateBytes(streamSlice, 'deflate-raw'));
        if (!inflated) {
          // Never read raw compressed binary streams if decompression fails
          continue;
        }
        decodedStream = decoder.decode(inflated);
      } else {
        decodedStream = raw.slice(dataStart, dataEnd);
      }

      const lines = extractTextFromDecodedStream(decodedStream);
      if (lines.length > 0) {
        collectedChunks.push(lines.join(' '));
      }
    }

    const joined = collectedChunks.join('\n');
    const rawSentences = joined
      .split(/(?<=[.!?])\s+|\n+/)
      .map((s) => s.replace(/\s+/g, ' ').trim())
      .filter((s) => isCleanHumanText(s));

    extractedText = Array.from(new Set(rawSentences)).join(' ').slice(0, 14000);
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
