/**
 * Renders schema.org JSON-LD. `<` is escaped so content can never close the script element
 * (the payload is data built on the server, never user HTML).
 */
export function JsonLd({ data }: { data: Record<string, unknown> | (Record<string, unknown> | null)[] | null }) {
  const items = (Array.isArray(data) ? data : [data]).filter((d): d is Record<string, unknown> => !!d);
  if (!items.length) return null;
  return (
    <>
      {items.map((item, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(item).replace(/</g, '\u003c') }}
        />
      ))}
    </>
  );
}
