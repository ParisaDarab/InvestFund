/**
 * Deterministic sample value for a JSON Schema, used as the fallback answer for `json_schema`
 * response formats and tool-call arguments when no fixture matches.
 *
 * Covers the subset that OpenAI structured outputs accept (and that `zod`'s `toJSONSchema`
 * emits): `type` (incl. arrays of types), `properties`, `items`, `enum`, `const`, `anyOf`,
 * `oneOf`, `allOf`, local `$ref`s (`#/$defs/…`, `#/definitions/…`), string `format`s,
 * `minLength`/`maxLength`, numeric bounds and `minItems`/`maxItems`. `pattern` is not honoured.
 */

const MAX_DEPTH = 12;
export const FIXED_DATE_TIME = '2026-01-01T00:00:00Z';

type Schema = Record<string, unknown>;

function isSchema(value: unknown): value is Schema {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? (value as unknown[]) : undefined;
}

function resolveRef(ref: string, root: unknown): unknown {
  if (!ref.startsWith('#')) return undefined;
  let node: unknown = root;
  for (const raw of ref.slice(1).split('/').filter(Boolean)) {
    const segment = decodeURIComponent(raw).replaceAll('~1', '/').replaceAll('~0', '~');
    if (!isSchema(node)) return undefined;
    node = node[segment];
  }
  return node;
}

function sampleString(schema: Schema): string {
  const formats: Record<string, string> = {
    'date-time': FIXED_DATE_TIME,
    date: '2026-01-01',
    time: '00:00:00Z',
    email: 'mock@example.test',
    uri: 'https://example.test/mock',
    url: 'https://example.test/mock',
    uuid: '00000000-0000-4000-8000-000000000000',
    hostname: 'example.test',
    ipv4: '192.0.2.1',
    ipv6: '2001:db8::1',
  };
  let value = (typeof schema.format === 'string' ? formats[schema.format] : undefined) ?? 'mock';
  const min = typeof schema.minLength === 'number' ? schema.minLength : 0;
  const max = typeof schema.maxLength === 'number' ? schema.maxLength : Number.POSITIVE_INFINITY;
  if (value.length < min) value = value.padEnd(min, 'x');
  if (value.length > max) value = value.slice(0, max);
  return value;
}

function sampleNumber(schema: Schema, integer: boolean): number {
  const num = (key: string): number | undefined =>
    typeof schema[key] === 'number' ? schema[key] : undefined;
  const step = integer ? 1 : 0.5;
  const lower = num('minimum') ?? (num('exclusiveMinimum') ?? Number.NaN) + step;
  const upper = num('maximum') ?? (num('exclusiveMaximum') ?? Number.NaN) - step;
  let value = Number.isNaN(lower) ? 0 : lower;
  if (!Number.isNaN(upper) && value > upper) value = upper;
  return integer ? Math.ceil(value) : value;
}

export function sampleFromSchema(schema: unknown, root: unknown = schema, depth = 0): unknown {
  if (!isSchema(schema) || depth > MAX_DEPTH) return null;
  if (typeof schema.$ref === 'string') {
    return sampleFromSchema(resolveRef(schema.$ref, root), root, depth + 1);
  }
  if ('const' in schema) return schema.const;
  const enumValues = asArray(schema.enum);
  if (enumValues !== undefined && enumValues.length > 0) return enumValues[0];

  for (const keyword of ['anyOf', 'oneOf'] as const) {
    const branches = asArray(schema[keyword]);
    if (branches !== undefined && branches.length > 0) {
      const preferred = branches.find((branch) => !(isSchema(branch) && branch.type === 'null'));
      return sampleFromSchema(preferred ?? branches[0], root, depth + 1);
    }
  }
  const allOf = asArray(schema.allOf);
  if (allOf !== undefined && allOf.length > 0) {
    const parts = allOf.map((part) => sampleFromSchema(part, root, depth + 1));
    if (parts.every(isSchema)) return Object.assign({}, ...parts) as unknown;
    return parts[0];
  }

  let type = schema.type;
  if (Array.isArray(type)) type = type.find((t) => t !== 'null') ?? 'null';
  if (type === undefined) {
    if (isSchema(schema.properties)) type = 'object';
    else if (schema.items !== undefined) type = 'array';
  }

  switch (type) {
    case 'object': {
      const result: Record<string, unknown> = {};
      const properties = isSchema(schema.properties) ? schema.properties : {};
      const required = Array.isArray(schema.required) ? schema.required : Object.keys(properties);
      for (const [name, propertySchema] of Object.entries(properties)) {
        // Deep in a recursive schema, only required members are generated so recursion ends.
        if (depth > MAX_DEPTH / 2 && !required.includes(name)) continue;
        result[name] = sampleFromSchema(propertySchema, root, depth + 1);
      }
      return result;
    }
    case 'array': {
      const min = typeof schema.minItems === 'number' ? schema.minItems : 0;
      const max = typeof schema.maxItems === 'number' ? schema.maxItems : Number.POSITIVE_INFINITY;
      const count = Math.min(Math.max(min, depth > MAX_DEPTH / 2 ? 0 : 1), max);
      return Array.from({ length: count }, () => sampleFromSchema(schema.items, root, depth + 1));
    }
    case 'string':
      return sampleString(schema);
    case 'integer':
      return sampleNumber(schema, true);
    case 'number':
      return sampleNumber(schema, false);
    case 'boolean':
      return false;
    default:
      return null;
  }
}
