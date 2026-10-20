/**
 * Render answer text, turning [n] markers into clay citation numbers.
 * @param {{ text: string }} props
 */
export function CitedText({ text }) {
  const parts = String(text).split(/\[(\d+)\]/);
  return parts.map((part, index) =>
    index % 2 === 1 ? <sup key={index}>{part}</sup> : <span key={index}>{part}</span>,
  );
}

/**
 * @param {{ role: string, content: string }} props
 */
export function Message({ role, content }) {
  if (role === "user") {
    return <p className="turn-q">{content}</p>;
  }
  return (
    <p className="turn-a">
      <CitedText text={content} />
    </p>
  );
}
