import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';

/**
 * Safe Markdown rendering: raw HTML is skipped (never injected), images are dropped (the content pack forbids
 * them), links are rewritten through `resolveHref` (unknown/unsafe targets become plain text), external links
 * open in a new tab with rel="noopener noreferrer", and call-out block quotes get a `data-callout` type.
 */

interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

const CALLOUTS: [RegExp, string][] = [
  [/^(emergency|urgence|طوارئ)/i, 'emergency'],
  [/^(important|مهم)/i, 'important'],
  [/^(check before you travel|à vérifier|a verifier|تحقق قبل السفر)/i, 'check'],
  [/^(tip|conseil|نصيحة)/i, 'tip'],
  [/^(medical disclaimer|avertissement médical|إخلاء مسؤولية طبي)/i, 'disclaimer'],
];

function textOf(node: HastNode): string {
  if (node.type === 'text') return node.value ?? '';
  return (node.children ?? []).map(textOf).join('');
}

function firstStrong(node: HastNode): HastNode | null {
  for (const child of node.children ?? []) {
    if (child.type === 'element' && child.tagName === 'strong') return child;
    if (child.type === 'element' && child.tagName === 'p') {
      const first = (child.children ?? []).find((c) => c.type !== 'text' || (c.value ?? '').trim());
      return first && first.type === 'element' && first.tagName === 'strong' ? first : null;
    }
  }
  return null;
}

function rehypeSite(options: { resolveHref: (href: string) => string | null; shiftHeadings: number }) {
  return (tree: HastNode) => {
    const visit = (node: HastNode, parent: HastNode | null) => {
      if (node.type === 'element') {
        const tag = node.tagName ?? '';
        if (/^h[1-6]$/.test(tag)) {
          const level = Math.min(6, Math.max(2, Number(tag[1]) + options.shiftHeadings));
          node.tagName = `h${level}`;
        } else if (tag === 'a') {
          const href = String(node.properties?.href ?? '');
          const resolved = options.resolveHref(href);
          if (!resolved) {
            node.tagName = 'span';
            node.properties = {};
          } else {
            node.properties = { ...node.properties, href: resolved };
            if (/^https?:\/\//i.test(resolved)) {
              node.properties.target = '_blank';
              node.properties.rel = 'noopener noreferrer';
            }
          }
        } else if (tag === 'img' && parent?.children) {
          parent.children = parent.children.filter((c) => c !== node);
          return;
        } else if (tag === 'blockquote') {
          const strong = firstStrong(node);
          const label = strong ? textOf(strong).trim() : '';
          const match = CALLOUTS.find(([re]) => re.test(label));
          if (match) node.properties = { ...node.properties, dataCallout: match[1] };
        }
      }
      for (const child of [...(node.children ?? [])]) visit(child, node);
    };
    visit(tree, null);
  };
}

export function MarkdownContent({
  children,
  resolveHref,
  shiftHeadings = 0,
  className = '',
}: {
  children: string;
  resolveHref: (href: string) => string | null;
  shiftHeadings?: number;
  className?: string;
}) {
  return (
    <div className={`prose-hig ${className}`}>
      <Markdown
        skipHtml
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSlug, [rehypeSite, { resolveHref, shiftHeadings }]]}
      >
        {children}
      </Markdown>
    </div>
  );
}
