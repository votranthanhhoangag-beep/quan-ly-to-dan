import type { CategoryItem, ExpenseItem, SlipItem } from '../context/AppContext';

type MaterialPriceLine = {
  materialId?: number | string | null;
  materialCode?: string;
  materialName?: string;
  quantity?: number;
  unitPrice?: number;
  amount?: number;
  sourceType?: string;
};

const normalizeMaterialIdentity = (value: unknown) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/gi, 'd')
  .replace(/[^a-zA-Z0-9]/g, '')
  .toLocaleLowerCase('vi');

const getMaterialIdentityAliases = (...values: unknown[]) => {
  const aliases = new Set<string>();
  values.forEach(value => {
    const text = String(value || '').trim();
    const normalized = normalizeMaterialIdentity(text);
    if (normalized) aliases.add(normalized);
    text.split(/\s+[-–—]\s+/).forEach(part => {
      const alias = normalizeMaterialIdentity(part);
      if (alias) aliases.add(alias);
    });
  });
  return aliases;
};

export const matchesMaterialIdentity = (
  material: CategoryItem,
  line: Pick<MaterialPriceLine, 'materialId' | 'materialCode' | 'materialName'>
) => {
  if (
    line.materialId !== undefined &&
    line.materialId !== null &&
    String(line.materialId) !== '0' &&
    String(line.materialId) === String(material.id)
  ) return true;

  const materialAliases = getMaterialIdentityAliases(material.code, material.name);
  const lineAliases = getMaterialIdentityAliases(line.materialCode, line.materialName);
  return Array.from(lineAliases).some(alias => materialAliases.has(alias));
};

const parseMaterialNumber = (value: unknown) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const raw = String(value || '').trim().replace(/[^\d,.-]/g, '');
  if (!raw) return 0;
  const separators = raw.match(/[.,]/g) || [];
  if (!separators.length) {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  const lastSeparator = Math.max(raw.lastIndexOf(','), raw.lastIndexOf('.'));
  const decimalDigits = raw.length - lastSeparator - 1;
  const normalized = decimalDigits === 3
    ? raw.replace(/[.,]/g, '')
    : `${raw.slice(0, lastSeparator).replace(/[.,]/g, '')}.${raw.slice(lastSeparator + 1)}`;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const normalizeMaterialSearch = (value: unknown) => String(value || '')
  .toLocaleLowerCase('vi')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd');

export const matchesMaterialSearch = (material: CategoryItem, query: string) => {
  const searchTerm = normalizeMaterialSearch(query.trim());
  if (!searchTerm) return true;
  return normalizeMaterialSearch(`${material.code} ${material.name} ${material.note || ''}`)
    .includes(searchTerm);
};

export const matchesMaterialNameSearch = (material: CategoryItem, query: string) => {
  const searchTerm = normalizeMaterialSearch(query.trim());
  if (!searchTerm) return true;
  return normalizeMaterialSearch(material.name).includes(searchTerm);
};

const getMaterialPurchaseLines = (
  material: CategoryItem,
  slips: SlipItem[],
  expenses: ExpenseItem[]
): Array<{ date: string; line: MaterialPriceLine }> => {
  const priceLines: Array<{ date: string; line: MaterialPriceLine }> = [];
  const addLine = (line: MaterialPriceLine, date: string) => {
    if (matchesMaterialIdentity(material, line)) priceLines.push({ date, line });
  };

  (Array.isArray(slips) ? slips : []).forEach(slip => {
    const type = String(slip.type || '').toUpperCase();
    const isPurchase = type === 'NK' || type === 'NHAP' ||
      (type === 'NK_KHUNG' && !slip.sourceContractId && !slip.sourceReturnSlipId && !slip.craftGroupLeader);
    if (!isPurchase || !Array.isArray(slip.accompanyingMaterials)) return;
    slip.accompanyingMaterials.forEach(line => addLine(line, String(slip.date || '')));
  });

  (Array.isArray(expenses) ? expenses : []).forEach(expense => {
    if (!Array.isArray(expense.items)) return;
    expense.items.forEach(line => {
      if (line.sourceType === 'Sản phẩm') return;
      addLine({
        materialCode: line.sourceCode,
        materialName: line.name,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        amount: line.amount,
        sourceType: line.sourceType
      }, String(expense.date || ''));
    });
  });

  return priceLines;
};

export const getLatestMaterialUnitPrice = (
  material: CategoryItem,
  slips: SlipItem[],
  expenses: ExpenseItem[]
) => {
  const priceLines = getMaterialPurchaseLines(material, slips, expenses)
    .map(({ date, line }) => {
      const quantity = parseMaterialNumber(line.quantity);
      const amount = parseMaterialNumber(line.amount);
      const unitPrice = amount > 0 && quantity > 0
        ? amount / quantity
        : parseMaterialNumber(line.unitPrice);
      return { date, unitPrice };
    })
    .filter(({ unitPrice }) => unitPrice > 0 && Number.isFinite(unitPrice));
  return priceLines.sort((first, second) => second.date.localeCompare(first.date))[0]?.unitPrice || 0;
};

export const getHighestMaterialUnitPrice = (
  material: CategoryItem,
  slips: SlipItem[],
  expenses: ExpenseItem[]
) => getMaterialPurchaseLines(material, slips, expenses).reduce((highest, { line }) => {
  const quantity = parseMaterialNumber(line.quantity);
  const amount = parseMaterialNumber(line.amount);
  const unitPrice = amount > 0 && quantity > 0
    ? amount / quantity
    : parseMaterialNumber(line.unitPrice);
  return unitPrice > 0 && Number.isFinite(unitPrice) ? Math.max(highest, unitPrice) : highest;
}, 0);
