'use client';

import { useState, useEffect } from 'react';
import type { CountryCode } from '@/types/country';

interface TileMetadataEntry {
  plz2Codes: string[];
  plz5Count: number;
}

export type TileMetadata = Partial<Record<CountryCode, TileMetadataEntry>>;

let cachedMetadata: TileMetadata | null = null;

/**
 * `enabled` exists so this can be called unconditionally. MapShell used to
 * call it behind `USE_PMTILES ? useTileMetadata() : null`, which is a hook in
 * a conditional - it happened to be stable only because the flag comes from
 * the build environment.
 */
export function useTileMetadata(enabled = true): TileMetadata | null {
  const [metadata, setMetadata] = useState<TileMetadata | null>(cachedMetadata);

  useEffect(() => {
    if (!enabled || cachedMetadata) return;
    fetch('/tiles/metadata.json')
      .then((r) => r.json())
      .then((data) => {
        cachedMetadata = data;
        setMetadata(data);
      })
      .catch(() => setMetadata(null));
  }, [enabled]);

  return enabled ? metadata : null;
}
