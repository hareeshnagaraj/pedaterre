export const BOROUGHS = {
  "1": { code: "MN", name: "Manhattan" },
  "2": { code: "BX", name: "Bronx" },
  "3": { code: "BK", name: "Brooklyn" },
  "4": { code: "QN", name: "Queens" },
  "5": { code: "SI", name: "Staten Island" },
} as const;

export type BoroughNumber = keyof typeof BOROUGHS;
export type BoroughCode = (typeof BOROUGHS)[BoroughNumber]["code"];

const CODE_TO_NUMBER: Record<BoroughCode, BoroughNumber> = {
  MN: "1",
  BX: "2",
  BK: "3",
  QN: "4",
  SI: "5",
};

export function boroughNumber(value: string | number): BoroughNumber | null {
  const normalized = String(value).trim().toUpperCase();
  if (normalized in BOROUGHS) return normalized as BoroughNumber;
  return CODE_TO_NUMBER[normalized as BoroughCode] ?? null;
}

export function boroughCode(value: string | number): BoroughCode | null {
  const number = boroughNumber(value);
  return number ? BOROUGHS[number].code : null;
}

export function boroughName(value: string | number): string | null {
  const number = boroughNumber(value);
  return number ? BOROUGHS[number].name : null;
}
