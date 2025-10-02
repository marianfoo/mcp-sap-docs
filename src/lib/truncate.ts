// Intelligent content truncation utility
// Preserves structure and readability while limiting content size

import { CONFIG } from "./config.js";

export interface TruncationResult {
  content: string;
  wasTruncated: boolean;
  originalLength: number;
  truncatedLength: number;
}

/**
 * Intelligently truncate content to a maximum length while preserving:
 * - Beginning (intro/overview)
 * - End (conclusions/examples)
 * - Code block integrity
 * - Markdown structure
 * 
 * @param content - The content to truncate
 * @param maxLength - Maximum length (defaults to CONFIG.MAX_CONTENT_LENGTH)
 * @returns TruncationResult with truncated content and metadata
 */
export function truncateContent(
  content: string, 
  maxLength: number = CONFIG.MAX_CONTENT_LENGTH
): TruncationResult {
  const originalLength = content.length;
  
  // No truncation needed
  if (originalLength <= maxLength) {
    return {
      content,
      wasTruncated: false,
      originalLength,
      truncatedLength: originalLength
    };
  }
  
  // Calculate how much content to preserve from start and end
  // Keep 60% from the start (intro/main content) and 20% from end (conclusions)
  // Reserve 20% for truncation notice and buffer
  const startLength = Math.floor(maxLength * 0.6);
  const endLength = Math.floor(maxLength * 0.2);
  const noticeLength = maxLength - startLength - endLength;
  
  // Extract start portion
  let startPortion = content.substring(0, startLength);
  
  // Try to break at a natural boundary (paragraph, heading, or code block)
  const naturalBreakPatterns = [
    /\n\n/g,           // Paragraph breaks
    /\n#{1,6}\s/g,    // Markdown headings
    /\n```\n/g,       // Code block ends
    /\n---\n/g,       // Horizontal rules
    /\.\s+/g          // Sentence ends
  ];
  
  for (const pattern of naturalBreakPatterns) {
    const matches = Array.from(startPortion.matchAll(pattern));
    if (matches.length > 0) {
      const lastMatch = matches[matches.length - 1];
      if (lastMatch.index && lastMatch.index > startLength * 0.8) {
        startPortion = startPortion.substring(0, lastMatch.index + lastMatch[0].length);
        break;
      }
    }
  }
  
  // Extract end portion
  let endPortion = content.substring(content.length - endLength);
  
  // Try to break at natural boundary from the beginning of end portion
  for (const pattern of naturalBreakPatterns) {
    const match = endPortion.match(pattern);
    if (match && match.index !== undefined && match.index < endLength * 0.2) {
      endPortion = endPortion.substring(match.index + match[0].length);
      break;
    }
  }
  
  // Create truncation notice
  const omittedChars = originalLength - (startPortion.length + endPortion.length);
  const omittedPercent = Math.round((omittedChars / originalLength) * 100);
  
  const truncationNotice = `

---

⚠️ **Content Truncated**

The full content was ${originalLength.toLocaleString()} characters (approximately ${Math.round(originalLength / 4)} tokens).
For readability and performance, ${omittedChars.toLocaleString()} characters (${omittedPercent}%) have been omitted from the middle section.

The beginning and end of the document are preserved above and below this notice.

---

`;
  
  // Combine portions
  const truncatedContent = startPortion + truncationNotice + endPortion;
  
  return {
    content: truncatedContent,
    wasTruncated: true,
    originalLength,
    truncatedLength: truncatedContent.length
  };
}

/**
 * Truncate content with a simple notice at the end
 * Used when preserving both beginning and end doesn't make sense
 * 
 * @param content - The content to truncate
 * @param maxLength - Maximum length (defaults to CONFIG.MAX_CONTENT_LENGTH)
 * @returns TruncationResult with truncated content and metadata
 */
export function truncateContentSimple(
  content: string,
  maxLength: number = CONFIG.MAX_CONTENT_LENGTH
): TruncationResult {
  const originalLength = content.length;
  
  // No truncation needed
  if (originalLength <= maxLength) {
    return {
      content,
      wasTruncated: false,
      originalLength,
      truncatedLength: originalLength
    };
  }
  
  // Reserve space for truncation notice
  const noticeLength = 300;
  const contentLength = maxLength - noticeLength;
  
  // Extract content
  let truncatedContent = content.substring(0, contentLength);
  
  // Try to break at natural boundary
  const lastParagraph = truncatedContent.lastIndexOf('\n\n');
  const lastSentence = truncatedContent.lastIndexOf('. ');
  
  if (lastParagraph > contentLength * 0.9) {
    truncatedContent = truncatedContent.substring(0, lastParagraph);
  } else if (lastSentence > contentLength * 0.9) {
    truncatedContent = truncatedContent.substring(0, lastSentence + 1);
  }
  
  // Add truncation notice
  const omittedChars = originalLength - truncatedContent.length;
  const omittedPercent = Math.round((omittedChars / originalLength) * 100);
  
  truncatedContent += `

---

⚠️ **Content Truncated**

The full content was ${originalLength.toLocaleString()} characters (approximately ${Math.round(originalLength / 4)} tokens).
${omittedChars.toLocaleString()} characters (${omittedPercent}%) have been omitted for readability.

---
`;
  
  return {
    content: truncatedContent,
    wasTruncated: true,
    originalLength,
    truncatedLength: truncatedContent.length
  };
}

