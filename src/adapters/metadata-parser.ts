import type { AdapterMeta } from '../shared/types';

const HEADER_START = '// ==MangaSyncAdapter==';
const HEADER_END = '// ==/MangaSyncAdapter==';

function parseField(line: string): { key: string; value: string } | null {
  const match = line.match(/^\/\/\s*@([a-zA-Z]+)\s+(.+)$/);
  if (!match) return null;
  return { key: match[1], value: match[2].trim() };
}

export function parseAdapterMetadata(sourceCode: string): AdapterMeta {
  const start = sourceCode.indexOf(HEADER_START);
  const end = sourceCode.indexOf(HEADER_END);
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Adapter metadata header is missing or malformed.');
  }

  const block = sourceCode
    .slice(start + HEADER_START.length, end)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const values: Record<string, string[]> = {};
  for (const line of block) {
    const field = parseField(line);
    if (!field) continue;
    values[field.key] ??= [];
    values[field.key].push(field.value);
  }

  const id = values.id?.[0];
  const name = values.name?.[0];
  const version = values.version?.[0];
  const site = values.site?.[0];
  const matches = values.match ?? [];

  if (!id || !/^[a-z0-9_-]{3,64}$/i.test(id)) {
    throw new Error('Adapter @id is required and must be 3-64 chars (letters, numbers, _ or -).');
  }
  if (!name) throw new Error('Adapter @name is required.');
  if (!version) throw new Error('Adapter @version is required.');
  if (!site) throw new Error('Adapter @site is required.');
  if (!matches.length) throw new Error('Adapter needs at least one @match pattern.');

  return {
    id,
    name,
    version,
    site,
    description: values.description?.[0],
    matches,
  };
}

export function validateAdapterSource(sourceCode: string): void {
  parseAdapterMetadata(sourceCode);
  const denied = [
    /\beval\s*\(/,
    /\bnew Function\s*\(/,
    /chrome\.runtime\.sendNativeMessage/,
  ];
  for (const pattern of denied) {
    if (pattern.test(sourceCode)) {
      throw new Error('Adapter contains a disallowed runtime pattern.');
    }
  }
}
