'use client';

import { useState, useEffect } from 'react';
import type { CountryCode } from '@/types/country';

interface TileMetadataEntry {
  plz2Codes: string[];
  plz5Count: number;
}

export type TileMetadata = Partial<Record<CountryCode, TileMetadataEntry>>;

let cachedMetadata: TileMetadata | null = null;

export function useTileMetadata(): TileMetadata | null {
  const [metadata, setMetadata] = useState<TileMetadata | null>(cachedMetadata);

  useEffect(() => {
    if (cachedMetadata) return;
    fetch('/tiles/metadata.json')
      .then((r) => r.json())
      .then((data) => {
        cachedMetadata = data;
        setMetadata(data);
      })
      .catch(() => setMetadata(null));
  }, []);

  return metadata;
}
