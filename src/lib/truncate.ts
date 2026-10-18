// Bounded excerpts with explicit loss accounting. Boundaries are best effort:
// an excerpt can contain incomplete Markdown, HTML, sentences or code blocks.
import { CONFIG } from "./config.js";

export interface TruncationResult {
  content: string;
  wasTruncated: boolean;
  /** Lengths use JavaScript string units (UTF-16), including markup. */
  originalLength: number;
  /** Returned content length, including the notice. */
  truncatedLength: number;
  /** Source characters omitted; the notice is not source content. */
  omittedCharacters: number;
}

export type TruncationInfo = Omit<TruncationResult, "content">;

function notice(original: number, omitted: number, keepEnd: boolean): string {
  return `\n\n---\n\n⚠️ **Content Truncated**\n\n${omitted} of ${original} characters omitted from the ${keepEnd ? "middle" : "end"}. Open the source URL for the complete content.\n\n---\n\n`;
}

// Prefer nearby paragraph/heading/sentence boundaries. Never discard thousands
// of characters just to reach a paragraph in a large document.
function nearbyBoundary(content: string, cut: number, window: number, fromEnd: boolean): number {
  if (fromEnd ? content[cut - 1] === "\n" : content[cut] === "\n") return cut;
  // Inspect the original line, including a heading marker cut before its space.
  if (!fromEnd) {
    const lineStart = content.lastIndexOf("\n", cut - 1) + 1;
    const lineEnd = content.indexOf("\n", lineStart);
    if (lineStart < cut && cut - lineStart <= 200 &&
        (lineEnd < 0 || cut < lineEnd) && /^#{1,6} /.test(content.slice(lineStart))) {
      return lineStart;
    }
  }
  const start = fromEnd ? cut : Math.max(0, cut - window);
  const end = fromEnd ? Math.min(content.length, cut + window) : cut;
  const region = content.slice(start, end);
  for (const pattern of [/\n\n/g, /\n(?=#{1,6} )/g, /\.\s+/g]) {
    const matches = [...region.matchAll(pattern)];
    const match = fromEnd ? matches[0] : matches[matches.length - 1];
    if (match) return start + match.index! + match[0].length;
  }
  return cut;
}

function isSurrogatePairAt(content: string, cut: number): boolean {
  return /[\uD800-\uDBFF]/.test(content.charAt(cut - 1)) && /[\uDC00-\uDFFF]/.test(content.charAt(cut));
}

function truncate(content: string, maxLength: number, keepEnd: boolean): TruncationResult {
  if (!Number.isSafeInteger(maxLength) || maxLength <= 0) {
    throw new RangeError("maxLength must be a positive safe integer");
  }
  const originalLength = content.length;
  if (originalLength <= maxLength) {
    return { content, wasTruncated: false, originalLength, truncatedLength: originalLength, omittedCharacters: 0 };
  }

  // Measuring the largest possible notice makes the output bound independent
  // of digit count and locale. Tiny budgets use a compact marker + metadata.
  const fullNoticeLength = notice(originalLength, originalLength, keepEnd).length;
  const shortMarker = "[truncated]";
  const compactNotice = maxLength >= shortMarker.length ? shortMarker : "…";
  const useFullNotice = fullNoticeLength <= maxLength;
  const budget = maxLength - (useFullNotice ? fullNoticeLength : compactNotice.length);
  const tailLength = keepEnd ? Math.floor(budget * 0.2) : 0;
  const headLength = budget - tailLength;
  let headEnd = nearbyBoundary(content, headLength, Math.min(200, Math.floor(headLength * 0.1)), false);
  let tailStart = nearbyBoundary(content, originalLength - tailLength, Math.min(200, Math.floor(tailLength * 0.1)), true);
  if (isSurrogatePairAt(content, headEnd)) headEnd--;
  if (isSurrogatePairAt(content, tailStart)) tailStart++;
  const omittedCharacters = tailStart - headEnd;
  const marker = useFullNotice ? notice(originalLength, omittedCharacters, keepEnd) : compactNotice;
  const excerpt = content.slice(0, headEnd) + marker + content.slice(tailStart);
  return { content: excerpt, wasTruncated: true, originalLength, truncatedLength: excerpt.length, omittedCharacters };
}

/** Keep the beginning and end, with a notice where the middle was removed. */
export function truncateContent(content: string, maxLength = CONFIG.MAX_CONTENT_LENGTH): TruncationResult {
  return truncate(content, maxLength, true);
}

/** Keep the beginning, with a notice where the rest was removed. */
export function truncateContentSimple(content: string, maxLength = CONFIG.MAX_CONTENT_LENGTH): TruncationResult {
  return truncate(content, maxLength, false);
}
