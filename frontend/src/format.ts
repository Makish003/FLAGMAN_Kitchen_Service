export const units: Record<string, string> = { g: 'г', kg: 'кг', ml: 'мл', l: 'л', pcs: 'шт' };
export const number = (n: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 }).format(n);
export const qty = (n: number, unit: string) => `${number(n)} ${units[unit] ?? unit}`;
export const shortId = (id: string) => id.slice(0, 8).toUpperCase();
