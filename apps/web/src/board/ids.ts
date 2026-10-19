/** Random id for new sources. crypto.randomUUID needs a secure context (https/localhost); getRandomValues does not. */
export function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
