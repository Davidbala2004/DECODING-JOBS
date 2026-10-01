"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Renders assistant chat content as real formatted markdown — headers,
 * bold, tables, lists — instead of raw `#`/`**`/`|` characters. This is
 * what makes a resume rewrite or a prep guide actually look structured,
 * the way Claude/Gemini render their own replies.
 */
export function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className="markdown-message text-sm leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 className="mb-2 mt-3 text-base font-extrabold text-gray-900 first:mt-0">{children}</h1>,
          h2: ({ children }) => <h2 className="mb-1.5 mt-3 text-sm font-bold text-gray-900 first:mt-0">{children}</h2>,
          h3: ({ children }) => <h3 className="mb-1 mt-2.5 text-sm font-bold text-gray-800 first:mt-0">{children}</h3>,
          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
          strong: ({ children }) => <strong className="font-bold text-gray-900">{children}</strong>,
          ul: ({ children }) => <ul className="mb-2 ml-4 list-disc space-y-1 last:mb-0">{children}</ul>,
          ol: ({ children }) => <ol className="mb-2 ml-4 list-decimal space-y-1 last:mb-0">{children}</ol>,
          li: ({ children }) => <li className="pl-0.5">{children}</li>,
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="font-semibold text-green-700 underline decoration-green-200 hover:text-green-700">
              {children}
            </a>
          ),
          hr: () => <hr className="my-3 border-gray-100" />,
          code: ({ children }) => (
            <code className="rounded-md bg-gray-100 px-1 py-0.5 font-mono text-xs text-gray-700">{children}</code>
          ),
          blockquote: ({ children }) => (
            <blockquote className="mb-2 border-l-2 border-green-200 pl-3 text-gray-500 last:mb-0">{children}</blockquote>
          ),
          table: ({ children }) => (
            <div className="mb-2 overflow-x-auto rounded-lg border border-gray-100 last:mb-0">
              <table className="w-full border-collapse text-xs">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-gray-50">{children}</thead>,
          th: ({ children }) => (
            <th className="border-b border-gray-100 px-2.5 py-1.5 text-left font-bold text-gray-600">{children}</th>
          ),
          td: ({ children }) => <td className="border-b border-gray-50 px-2.5 py-1.5 align-top text-gray-700">{children}</td>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
