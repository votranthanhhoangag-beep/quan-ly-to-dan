import type { CategoryItem, ExpenseItem, SlipItem } from '../context/AppContext';

type MaterialPriceLine = {
  materialId?: number;
  materialCode?: string;
  materialName?: string;
  quantity?: number;
  unitPrice?: number;
  amount?: number;
};

export const normalizeMaterialSearch = (value: string) => value
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

export const getLatestMaterialUnitPrice = (
  material: CategoryItem,
  slips: SlipItem[],
  expenses: ExpenseItem[]
) => {
  const priceLines: Array<{ date: string; unitPrice: number }> = [];
  const matches = (line: MaterialPriceLine) => (
    (line.materialId !== undefined && String(line.materialId) === String(material.id)) ||
    (Boolean(line.materialCode) && line.materialCode?.trim().toLocaleLowerCase('vi') === material.code.trim().toLocaleLowerCase('vi')) ||
    String(line.materialName || '').trim().toLocaleLowerCase('vi') === material.name.trim().toLocaleLowerCase('vi')
  );
  const addPrice = (line: MaterialPriceLine, date: string) => {
    if (!matches(line)) return;
    const quantity = Number(line.quantity) || 0;
    const amount = Number(line.amount) || 0;
    const unitPrice = Number(line.unitPrice) || (quantity > 0 ? amount / quantity : 0);
    if (unitPrice > 0 && Number.isFinite(unitPrice)) priceLines.push({ date, unitPrice });
  };

  slips.forEach(slip => {
    const type = String(slip.type || '').toUpperCase();
    const isPurchase = type === 'NK' || type === 'NHAP' ||
      (type === 'NK_KHUNG' && !slip.sourceContractId && !slip.sourceReturnSlipId && !slip.craftGroupLeader);
    if (!isPurchase || !Array.isArray(slip.accompanyingMaterials)) return;
    slip.accompanyingMaterials.forEach(line => addPrice(line, String(slip.date || '')));
  });

  expenses.forEach(expense => {
    if (!Array.isArray(expense.items)) return;
    expense.items.forEach(line => addPrice({
      materialCode: line.sourceCode,
      materialName: line.name,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      amount: line.amount
    }, String(expense.date || '')));
  });

  return priceLines.sort((first, second) => second.date.localeCompare(first.date))[0]?.unitPrice || 0;
};
