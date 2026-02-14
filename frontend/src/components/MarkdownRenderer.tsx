/**
 * Lightweight Markdown renderer for FleetBridge AI responses.
 * Handles: headers, bold, code, tables, lists, and line breaks.
 * No external dependencies required.
 */
import React from 'react';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

function parseInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Match **bold**, `code`, or plain text
  const regex = /(\*\*(.+?)\*\*|`([^`]+)`)/g;
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    // Text before the match
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    if (match[2]) {
      // Bold
      nodes.push(
        <strong key={key++} className="text-white font-semibold">
          {match[2]}
        </strong>
      );
    } else if (match[3]) {
      // Inline code
      nodes.push(
        <code
          key={key++}
          className="bg-[#252530] text-[#00d4ff] px-1.5 py-0.5 rounded text-[0.85em] font-mono"
        >
          {match[3]}
        </code>
      );
    }

    lastIndex = match.index + match[0].length;
  }

  // Remaining text
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes.length > 0 ? nodes : [text];
}

export default function MarkdownRenderer({ content, className = '' }: MarkdownRendererProps) {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines
    if (!trimmed) {
      i++;
      continue;
    }

    // ── Headers ──
    if (trimmed.startsWith('### ')) {
      elements.push(
        <h4 key={i} className="text-sm font-semibold text-white mt-3 mb-1.5 flex items-center gap-2">
          {parseInline(trimmed.slice(4))}
        </h4>
      );
      i++;
      continue;
    }
    if (trimmed.startsWith('## ')) {
      elements.push(
        <h3 key={i} className="text-base font-bold text-white mt-2 mb-2 flex items-center gap-2">
          {parseInline(trimmed.slice(3))}
        </h3>
      );
      i++;
      continue;
    }

    // ── Table ──
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const tableRows: string[][] = [];
      let isHeader = true;

      while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
        const row = lines[i].trim();
        // Skip separator row (|---|---|)
        if (/^\|[\s\-:|]+\|$/.test(row)) {
          i++;
          continue;
        }
        const cells = row
          .split('|')
          .slice(1, -1) // Remove empty first and last from split
          .map(c => c.trim());
        tableRows.push(cells);
        i++;
      }

      if (tableRows.length > 0) {
        const headerRow = tableRows[0];
        const bodyRows = tableRows.slice(1);

        elements.push(
          <div key={`table-${i}`} className="my-2 overflow-x-auto rounded-lg border border-white/[0.06]">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-[#1a1a25]">
                  {headerRow.map((cell, ci) => (
                    <th
                      key={ci}
                      className="text-left px-3 py-2 text-[#a0a0b0] font-semibold uppercase tracking-wider text-[10px] border-b border-white/[0.06]"
                    >
                      {parseInline(cell)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bodyRows.map((row, ri) => (
                  <tr
                    key={ri}
                    className="border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.02] transition-colors"
                  >
                    {row.map((cell, ci) => (
                      <td key={ci} className="px-3 py-1.5 text-[#a0a0b0]">
                        {parseInline(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      continue;
    }

    // ── Unordered list ──
    if (trimmed.startsWith('- ')) {
      const listItems: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('- ')) {
        listItems.push(lines[i].trim().slice(2));
        i++;
        // Also grab indented continuation lines
        while (i < lines.length && lines[i].startsWith('  ') && !lines[i].trim().startsWith('- ')) {
          listItems[listItems.length - 1] += ' ' + lines[i].trim();
          i++;
        }
      }
      elements.push(
        <ul key={`ul-${i}`} className="my-1.5 space-y-1">
          {listItems.map((item, li) => (
            <li key={li} className="flex items-start gap-2 text-sm text-[#a0a0b0]">
              <span className="text-[#00d4ff]/50 mt-0.5 flex-shrink-0">•</span>
              <span>{parseInline(item)}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // ── Ordered list ──
    if (/^\d+\.\s/.test(trimmed)) {
      const listItems: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
        listItems.push(lines[i].trim().replace(/^\d+\.\s/, ''));
        i++;
      }
      elements.push(
        <ol key={`ol-${i}`} className="my-1.5 space-y-1">
          {listItems.map((item, li) => (
            <li key={li} className="flex items-start gap-2 text-sm text-[#a0a0b0]">
              <span className="text-[#00d4ff] font-semibold text-xs mt-0.5 w-4 flex-shrink-0">{li + 1}.</span>
              <span>{parseInline(item)}</span>
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // ── Regular paragraph ──
    elements.push(
      <p key={i} className="text-sm text-[#a0a0b0] leading-relaxed my-1">
        {parseInline(trimmed)}
      </p>
    );
    i++;
  }

  return <div className={`markdown-response ${className}`}>{elements}</div>;
}
