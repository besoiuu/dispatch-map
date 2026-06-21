export interface Plz5Properties {
  plz5: string;
  plz2: string;
  name?: string;
  [key: string]: unknown;
}

export interface Plz2Properties {
  plz2: string;
  label: string;
  centroid: [number, number]; // [lng, lat]
  bbox: [number, number, number, number]; // [west, south, east, north]
  featureCount: number;
}
