/**
 * The codes two devices pass each other by hand to find one another: a connection's description,
 * squeezed and written in letters that survive being copied into a message.
 */

const toText = (bytes: Uint8Array): string => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const toBytes = (text: string): Uint8Array => {
  const s = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
};

async function through(bytes: Uint8Array, stream: { readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array> }): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  void writer.write(bytes).then(() => writer.close()).catch(() => undefined);
  const parts: Uint8Array[] = [];
  const reader = stream.readable.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
  }
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** A code for this text: 'z' and the text squeezed, or 'r' and the text as it is where the browser cannot squeeze. */
export async function packCode(text: string): Promise<string> {
  const raw = new TextEncoder().encode(text);
  if (typeof CompressionStream === 'undefined') return `r${toText(raw)}`;
  return `z${toText(await through(raw, new CompressionStream('deflate-raw') as never))}`;
}

/** The code inside whatever was pasted: a bare code, or a link that carries one after `join=`. */
export function codeIn(pasted: string): string {
  const text = pasted.trim();
  const at = text.lastIndexOf('join=');
  return (at >= 0 ? text.slice(at + 5) : text).replace(/[^A-Za-z0-9_-]/g, '');
}

/** The text a code stands for, or null if it is not one of ours. */
export async function unpackCode(pasted: string): Promise<string | null> {
  const code = codeIn(pasted);
  try {
    if (code[0] === 'r') return new TextDecoder().decode(toBytes(code.slice(1)));
    if (code[0] !== 'z' || typeof DecompressionStream === 'undefined') return null;
    return new TextDecoder().decode(await through(toBytes(code.slice(1)), new DecompressionStream('deflate-raw') as never));
  } catch {
    return null;
  }
}
