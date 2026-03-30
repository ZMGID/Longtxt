import ReactMarkdown from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'

interface MarkdownContentProps {
  content: string
  compact?: boolean
}

export function MarkdownContent({ content, compact = false }: MarkdownContentProps) {
  return (
    <div className={`markdown-content text-stone-800 ${compact ? 'text-sm leading-7' : 'text-[15px] leading-8'}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={{
          p: ({ children }) => <p className="my-3 first:mt-0 last:mb-0">{children}</p>,
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer" className="text-stone-900 underline decoration-stone-300 underline-offset-4 transition hover:text-black">
              {children}
            </a>
          ),
          img: ({ src, alt }) => (
            <img
              src={src ?? ''}
              alt={alt ?? ''}
              loading="lazy"
              className="my-4 max-h-[420px] w-full rounded-[18px] border border-stone-200 object-contain bg-stone-50"
            />
          ),
          code: ({ children, className }) => {
            const isBlock = Boolean(className)

            if (!isBlock) {
              return <code className="rounded bg-stone-100 px-1.5 py-0.5 text-[0.92em] text-stone-900">{children}</code>
            }

            return <code className={className}>{children}</code>
          },
          pre: ({ children }) => (
            <pre className="my-4 overflow-x-auto rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4 text-sm leading-7 text-stone-800">{children}</pre>
          ),
          ul: ({ children }) => <ul className="my-3 list-disc space-y-2 pl-6">{children}</ul>,
          ol: ({ children }) => <ol className="my-3 list-decimal space-y-2 pl-6">{children}</ol>,
          blockquote: ({ children }) => <blockquote className="my-4 border-l-4 border-stone-300 bg-stone-50 px-4 py-3 text-stone-700">{children}</blockquote>,
          table: ({ children }) => <table className="my-4 w-full border-collapse text-left text-sm">{children}</table>,
          thead: ({ children }) => <thead className="border-b-2 border-stone-300">{children}</thead>,
          tbody: ({ children }) => <tbody>{children}</tbody>,
          tr: ({ children }) => <tr className="border-b border-stone-200">{children}</tr>,
          th: ({ children }) => <th className="px-3 py-2 font-semibold text-stone-900">{children}</th>,
          td: ({ children }) => <td className="px-3 py-2 text-stone-700">{children}</td>,
          hr: () => <hr className="my-5 border-none border-t border-stone-200" />,
          h1: ({ children }) => <h1 className="mt-5 mb-3 font-['Newsreader'] text-3xl font-semibold text-stone-950 first:mt-0">{children}</h1>,
          h2: ({ children }) => <h2 className="mt-5 mb-3 font-['Newsreader'] text-2xl font-semibold text-stone-950 first:mt-0">{children}</h2>,
          h3: ({ children }) => <h3 className="mt-4 mb-2 font-['Newsreader'] text-xl font-semibold text-stone-900 first:mt-0">{children}</h3>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
