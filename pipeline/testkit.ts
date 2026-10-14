/** Helpers for the pipeline tests. Everything generated here is invented. */

export const HEADER =
  'Model year,Make,Model,Vehicle class,Engine size (L),Cylinders,Transmission,Fuel type,City (L/100 km),Highway (L/100 km),Combined (L/100 km),Combined (mpg),CO2 emissions (g/km),CO2 rating,Smog rating';

/** n distinct invented rows for one model year, ratings between 5.0 and 11.3. */
export function makeCsv(n: number, year = 2026, extraLines: string[] = []): string {
  const rows: string[] = [HEADER];
  for (let i = 0; i < n; i++) {
    const comb = (5 + (i % 10) * 0.7).toFixed(1);
    rows.push(`${year},Samplecar${i % 7},Model ${i},Compact,${(1 + (i % 5) * 0.5).toFixed(1)},4,A8,X,${(Number(comb) + 1.5).toFixed(1)},${(Number(comb) - 1).toFixed(1)},${comb},30,190,6,6`);
  }
  return [...rows, ...extraLines].join('\n') + '\n';
}
