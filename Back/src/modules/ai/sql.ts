export function assertSafeIdentifier(identifier: string, label = 'identifier') {
  if (!/^[a-z_][a-z0-9_]*$/.test(identifier)) {
    throw new Error(`Unsafe ${label}: ${identifier}`);
  }
}

export function quoteIdentifier(identifier: string) {
  assertSafeIdentifier(identifier);
  return `"${identifier}"`;
}

export function schemaNameForSlug(orgSlug: string) {
  const normalized = orgSlug.trim().toLowerCase().replace(/-/g, '_');
  if (!/^[a-z0-9_]+$/.test(normalized)) {
    throw new Error('Organization slug may only contain letters, numbers, hyphens, and underscores');
  }
  return `org_${normalized}`;
}

export function toPgVector(vector: number[]) {
  return `[${vector.map((value) => {
    if (!Number.isFinite(value)) {
      throw new Error('Embedding vector contains a non-finite value');
    }
    return value.toFixed(8);
  }).join(',')}]`;
}
