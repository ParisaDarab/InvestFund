/** Helpers for the RFC 2822 messages that Gmail `users.messages.send` receives as `raw`. */

export interface Header {
  name: string;
  value: string;
}

export interface ParsedMessage {
  headers: Header[];
  body: string;
}

export class MimeError extends Error {
  override name = 'MimeError';
}

/** Decodes base64url (RFC 4648 §5). Also accepts standard base64 and padding, as Gmail does. */
export function decodeBase64Url(input: string): Buffer {
  const compact = input.replace(/\s+/g, '');
  if (compact === '' || !/^[A-Za-z0-9\-_+/]+={0,2}$/.test(compact)) {
    throw new MimeError('raw is not valid base64url');
  }
  return Buffer.from(compact.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

export function encodeBase64Url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url');
}

/** Splits header block and body at the first empty line and unfolds folded header lines. */
export function parseRfc2822(raw: string): ParsedMessage {
  const match = /\r?\n\r?\n/.exec(raw);
  const headerBlock = match === null ? raw : raw.slice(0, match.index);
  const body = match === null ? '' : raw.slice(match.index + match[0].length);
  const headers: Header[] = [];
  for (const line of headerBlock.split(/\r?\n/)) {
    if (line === '') continue;
    const last = headers.at(-1);
    if (/^[ \t]/.test(line) && last !== undefined) {
      last.value = `${last.value} ${line.trim()}`;
      continue;
    }
    const colon = line.indexOf(':');
    if (colon <= 0) throw new MimeError(`Malformed header line: ${line.slice(0, 40)}`);
    headers.push({ name: line.slice(0, colon).trim(), value: line.slice(colon + 1).trim() });
  }
  return {
    headers: headers.map((header) => ({ ...header, value: decodeEncodedWords(header.value) })),
    body,
  };
}

function decodeCharset(bytes: Buffer, charset: string): string {
  const normalised = charset.toLowerCase();
  if (normalised === 'iso-8859-1' || normalised === 'latin1' || normalised === 'us-ascii') {
    return bytes.toString('latin1');
  }
  return bytes.toString('utf8');
}

function decodeQ(text: string): Buffer {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const char = text.charAt(i);
    const hex = text.slice(i + 1, i + 3);
    if (char === '_') {
      bytes.push(0x20);
    } else if (char === '=' && /^[0-9A-Fa-f]{2}$/.test(hex)) {
      bytes.push(Number.parseInt(hex, 16));
      i += 2;
    } else {
      bytes.push(char.charCodeAt(0));
    }
  }
  return Buffer.from(bytes);
}

/** RFC 2047 encoded words (`=?UTF-8?B?…?=`, `=?UTF-8?Q?…?=`); whitespace between words is dropped. */
export function decodeEncodedWords(value: string): string {
  return value
    .replace(/(=\?[^?\s]+\?[BbQq]\?[^?\s]*\?=)\s+(?==\?)/g, '$1')
    .replace(
      /=\?([^?\s]+)\?([BbQq])\?([^?\s]*)\?=/g,
      (_match, charset: string, encoding: string, text: string) =>
        decodeCharset(
          encoding.toUpperCase() === 'B' ? Buffer.from(text, 'base64') : decodeQ(text),
          charset,
        ),
    );
}

export function headerValue(headers: readonly Header[], name: string): string | undefined {
  const lower = name.toLowerCase();
  return headers.find((header) => header.name.toLowerCase() === lower)?.value;
}

/** Email addresses in an address-list header (`"Doe, Jane" <jane@x.test>, bob@y.test`). */
export function parseAddressList(value: string | undefined): string[] {
  if (value === undefined) return [];
  const items: string[] = [];
  let current = '';
  let quoted = false;
  let angle = false;
  for (const char of value) {
    if (char === '"') quoted = !quoted;
    else if (char === '<' && !quoted) angle = true;
    else if (char === '>' && !quoted) angle = false;
    if (char === ',' && !quoted && !angle) {
      items.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  items.push(current);
  return items
    .map((item) => (/<([^>]+)>/.exec(item)?.[1] ?? item).trim().toLowerCase())
    .filter((address) => address.includes('@'));
}
