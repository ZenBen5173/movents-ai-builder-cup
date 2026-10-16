/**
 * Checks tool arguments against the tool's JSON Schema subset (object,
 * string, number, integer, boolean, array, enum, required). Unknown keys are
 * dropped; numeric strings become numbers. Throws InvalidArgs with every
 * problem listed, so the AI client can correct itself.
 */
type Schema = {
  type?: string;
  properties?: Record<string, Schema>;
  required?: string[];
  items?: Schema;
  enum?: unknown[];
  maxLength?: number;
  maxItems?: number;
};

export class InvalidArgs extends Error {}

const MAX_STRING = 20_000;
const MAX_ITEMS = 200;

export function validateArgs(schema: Schema, input: unknown): Record<string, unknown> {
  const errors: string[] = [];
  const out = check(schema, input ?? {}, "arguments", errors);
  if (errors.length) throw new InvalidArgs(`Invalid arguments: ${errors.slice(0, 10).join("; ")}`);
  return (out ?? {}) as Record<string, unknown>;
}

function check(s: Schema, v: unknown, path: string, errors: string[]): unknown {
  if (v === undefined || v === null) return undefined;
  if (s.enum && !s.enum.includes(v)) {
    errors.push(`${path} must be one of ${s.enum.map((x) => JSON.stringify(x)).join(", ")}`);
    return undefined;
  }
  switch (s.type) {
    case "object": {
      if (typeof v !== "object" || Array.isArray(v)) return void errors.push(`${path} must be an object`);
      const obj = v as Record<string, unknown>;
      const res: Record<string, unknown> = {};
      for (const [k, sub] of Object.entries(s.properties ?? {})) {
        const r = check(sub, obj[k], `${path}.${k}`, errors);
        if (r !== undefined) res[k] = r;
      }
      for (const k of s.required ?? []) if (res[k] === undefined || res[k] === "") errors.push(`${path}.${k} is required`);
      return res;
    }
    case "array": {
      if (!Array.isArray(v)) return void errors.push(`${path} must be an array`);
      if (v.length > (s.maxItems ?? MAX_ITEMS)) return void errors.push(`${path} has too many items (max ${s.maxItems ?? MAX_ITEMS})`);
      return s.items ? v.map((x, i) => check(s.items!, x, `${path}[${i}]`, errors)).filter((x) => x !== undefined) : v;
    }
    case "string": {
      if (typeof v === "number" || typeof v === "boolean") v = String(v);
      if (typeof v !== "string") return void errors.push(`${path} must be a string`);
      if (v.length > (s.maxLength ?? MAX_STRING)) return void errors.push(`${path} is too long (max ${s.maxLength ?? MAX_STRING} characters)`);
      return v;
    }
    case "number":
    case "integer": {
      const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
      if (typeof n !== "number" || !Number.isFinite(n)) return void errors.push(`${path} must be a number`);
      if (s.type === "integer" && !Number.isInteger(n)) return void errors.push(`${path} must be a whole number`);
      return n;
    }
    case "boolean":
      if (typeof v === "boolean") return v;
      if (v === "true" || v === "false") return v === "true";
      return void errors.push(`${path} must be true or false`);
    default:
      return v;
  }
}
