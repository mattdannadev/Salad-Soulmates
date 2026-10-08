import { z } from 'zod';

export const languageSchema = z.enum(['en', 'es']);
export const regionalLocaleSchema = z.enum(['en-US', 'es-MX']);

export type Language = z.infer<typeof languageSchema>;
export type RegionalLocale = z.infer<typeof regionalLocaleSchema>;

export const regionalLocaleOptions: readonly {
  value: RegionalLocale;
  label: string;
}[] = [
  { value: 'en-US', label: 'United States (en-US)' },
  { value: 'es-MX', label: 'Mexico (es-MX)' },
];
