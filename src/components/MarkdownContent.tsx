import ReactMarkdown from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'

import { toRenderableAttachmentUrl } from '../lib/attachmentUrl'

interface MarkdownContentProps {
  content: string
  compact?: boolean
}

export function MarkdownContent({ content, compact = false }: MarkdownContentProps) {
  return (
    <div className={`markdown-content text-stone-800 ${compact ? 'text-sm leading-6' : 'text-sm leading-6'}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        urlTransform={(url) => toRenderableAttachmentUrl(url)}
        components={{
          p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer" className="text-stone-900 underline decoration-stone-300 underline-offset-4 transition hover:text-black">
              {children}
            </a>
          ),
          img: ({ src, alt }) => (
            (() => {
              const resolvedSrc = toRenderableAttachmentUrl(src)

              if (!resolvedSrc) {
                return null
              }

              return (
                <img
                  src={resolvedSrc}
                  alt={alt ?? ''}
                  loading="lazy"
                  className="my-3 max-h-[320px] w-full rounded-lg border border-stone-200 object-contain bg-stone-50"
                />
              )
            })()
          ),
          code: ({ children, className }) => {
            const isBlock = Boolean(className)

            if (!isBlock) {
              return <code className="rounded bg-stone-100 px-1.5 py-0.5 text-[0.92em] text-stone-900">{children}</code>
            }

            return <code className={className}>{children}</code>
          },
          pre: ({ children }) => (
            <pre className="my-3 overflow-x-auto rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm leading-6 text-stone-800">{children}</pre>
          ),
          ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
          blockquote: ({ children }) => <blockquote className="my-3 border-l-4 border-stone-300 bg-stone-50 px-3 py-2 text-stone-700">{children}</blockquote>,
          table: ({ children }) => <table className="my-4 w-full border-collapse text-left text-sm">{children}</table>,
          thead: ({ children }) => <thead className="border-b-2 border-stone-300">{children}</thead>,
          tbody: ({ children }) => <tbody>{children}</tbody>,
          tr: ({ children }) => <tr className="border-b border-stone-200">{children}</tr>,
          th: ({ children }) => <th className="px-3 py-2 font-semibold text-stone-900">{children}</th>,
          td: ({ children }) => <td className="px-3 py-2 text-stone-700">{children}</td>,
          hr: () => <hr className="my-5 border-none border-t border-stone-200" />,
          h1: ({ children }) => <h1 className="mt-4 mb-2 font-['Newsreader'] text-2xl font-semibold text-stone-950 first:mt-0">{children}</h1>,
          h2: ({ children }) => <h2 className="mt-3 mb-2 font-['Newsreader'] text-xl font-semibold text-stone-950 first:mt-0">{children}</h2>,
          h3: ({ children }) => <h3 className="mt-3 mb-1.5 font-['Newsreader'] text-lg font-semibold text-stone-900 first:mt-0">{children}</h3>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
