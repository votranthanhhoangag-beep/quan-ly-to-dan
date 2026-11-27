import type { CategoryItem, ExpenseItem, SlipItem } from '../context/AppContext';

type MaterialPriceLine = {
  materialId?: number;
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
  .replace(/[^a-zA-Z0-9]/g, '')
  .toLocaleLowerCase('vi');

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
  const materialCode = normalizeMaterialIdentity(material.code);
  const materialName = normalizeMaterialIdentity(material.name);
  const matches = (line: MaterialPriceLine) => {
    if (line.materialId !== undefined && String(line.materialId) === String(material.id)) return true;
    const lineCode = normalizeMaterialIdentity(line.materialCode);
    if (materialCode && lineCode === materialCode) return true;
    const lineName = normalizeMaterialIdentity(line.materialName);
    if (materialName && (
      lineName === materialName ||
      (materialName.length >= 3 && lineName.includes(materialName))
    )) return true;
    return Boolean(materialCode && materialName && (
      (lineCode.startsWith(materialCode) && lineCode.includes(materialName)) ||
      (lineName.startsWith(materialCode) && lineName.includes(materialName))
    ));
  };
  const priceLines: Array<{ date: string; line: MaterialPriceLine }> = [];
  const addLine = (line: MaterialPriceLine, date: string) => {
    if (matches(line)) priceLines.push({ date, line });
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
      const unitPrice = parseMaterialNumber(line.unitPrice) || (quantity > 0 ? amount / quantity : 0);
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
  const unitPrice = parseMaterialNumber(line.unitPrice) || (quantity > 0 ? amount / quantity : 0);
  return unitPrice > 0 && Number.isFinite(unitPrice) ? Math.max(highest, unitPrice) : highest;
}, 0);
