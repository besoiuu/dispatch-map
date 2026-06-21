export type CountryCode = 'de' | 'nl' | 'fr' | 'be' | 'dk' | 'at' | 'cz' | 'pl' | 'hu' | 'ro' | 'it' | 'sk';

export interface CountryConfig {
  code: CountryCode;
  name: string;
  center: [number, number]; // [lng, lat]
  defaultZoom: number;
  overviewDigits: number;
  postcodeLength: number;
  postcodeFormat: RegExp;
  detailPath: string;
  overviewPath: string;
  overviewZoomThreshold: number;
  detailLabelMinZoom: number;
  detailPropertyKey: string;
  overviewPropertyKey: string;
}
