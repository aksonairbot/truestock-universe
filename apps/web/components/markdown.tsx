// apps/web/components/markdown.tsx
//
// Zero-dependency, safe-by-construction markdown renderer for task
// descriptions and comments. Raw text is HTML-escaped FIRST, then a small
// set of markdown patterns is converted to tags we generate ourselves —
// user-supplied HTML can never reach the DOM.
//
// Supported: **bold**, *italic*, `code`, [text](https://link), # headings,
// - / * bullet lists, 1. numbered lists, --- rules, blank-line paragraphs.
// Deliberately NOT supported: raw HTML, images, tables.

import React from "react";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Inline transforms on an already-escaped line. */
function inline(escaped: string): string {
  let h = escaped;
  // `code`
  h = h.replace(/`([^`]+)`/g, '<code class="md-code">$1</code>');
  // [text](https://url) — http(s) only
  h = h.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="md-link">$1</a>',
  );
  // **bold** before *italic*
  h = h.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  h = h.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
  return h;
}

function toHtml(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let list: "ul" | "ol" | null = null;
  let para: string[] = [];

  const flushPara = () => {
    if (para.length) {
      out.push(`<p class="md-p">${para.join("<br/>")}</p>`);
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      out.push(`</${list}>`);
      list = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const esc = escapeHtml(line);

    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);

    if (!line.trim()) {
      flushPara();
      flushList();
    } else if (bullet) {
      flushPara();
      if (list !== "ul") { flushList(); out.push('<ul class="md-ul">'); list = "ul"; }
      out.push(`<li>${inline(escapeHtml(bullet[1]!))}</li>`);
    } else if (numbered) {
      flushPara();
      if (list !== "ol") { flushList(); out.push('<ol class="md-ol">'); list = "ol"; }
      out.push(`<li>${inline(escapeHtml(numbered[1]!))}</li>`);
    } else if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      flushPara();
      flushList();
      out.push('<hr class="md-hr"/>');
    } else if (heading) {
      flushPara();
      flushList();
      const level = Math.min(heading[1]!.length + 2, 6); // # → h3 … #### → h6
      out.push(`<h${level} class="md-h">${inline(escapeHtml(heading[2]!))}</h${level}>`);
    } else {
      flushList();
      para.push(inline(esc));
    }
  }
  flushPara();
  flushList();
  return out.join("");
}

export function Markdown({ text, className }: { text: string; className?: string }) {
  return (
    <div
      className={className ?? "md-body text-sm leading-relaxed text-text"}
      // Safe: input is fully HTML-escaped before our own tags are added.
      dangerouslySetInnerHTML={{ __html: toHtml(text) }}
    />
  );
}
