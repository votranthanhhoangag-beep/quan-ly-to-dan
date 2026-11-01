import type { CategoryItem, ContractItem, ExpenseItem, SlipItem } from '../context/AppContext';

type MaterialLine = {
  materialId?: number | string;
  materialCode?: string;
  materialName?: string;
  quantity?: number;
  unit?: string;
  unitPrice?: number;
  amount?: number;
};

export interface MaterialStockRow {
  key: string;
  name: string;
  code: string;
  unit: string;
  opening: number;
  incoming: number;
  outgoing: number;
  closing: number;
  averagePrice: number;
  highestPurchasePrice: number;
  outgoingValue: number;
  closingValue: number;
  notes: string[];
}

type Movement = {
  key: string;
  name: string;
  code: string;
  unit: string;
  date: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  direction: 'in' | 'out';
  source: string;
  reference: string;
  legacyUndated?: boolean;
};

const toDateString = (value: unknown) => {
  if (!value) return '';
  const date = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '';
};

const normalizeMaterialIdentity = (value: unknown) =>
  String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

const findCatalogMaterial = (line: MaterialLine, materials: CategoryItem[]) => {
  if (line.materialId !== undefined && line.materialId !== null) {
    const byId = materials.find(material => String(material.id) === String(line.materialId));
    if (byId) return byId;
  }
  const code = normalizeMaterialIdentity(line.materialCode);
  if (code) {
    const byCode = materials.find(material => normalizeMaterialIdentity(material.code) === code);
    if (byCode) return byCode;
  }
  const name = normalizeMaterialIdentity(line.materialName);
  if (!name) return undefined;
  const exactMatch = materials.find(material => normalizeMaterialIdentity(material.name) === name);
  if (exactMatch) return exactMatch;
  const nameMatches = materials.filter(material => {
    const catalogName = normalizeMaterialIdentity(material.name);
    return catalogName.length >= 3 && name.includes(catalogName);
  });
  return nameMatches.length === 1 ? nameMatches[0] : undefined;
};

const getMaterialKey = (line: MaterialLine, materials: CategoryItem[]) => {
  const catalogMaterial = findCatalogMaterial(line, materials);
  if (catalogMaterial) return `id:${catalogMaterial.id}`;
  if (line.materialId !== undefined && line.materialId !== null) return `id:${line.materialId}`;
  const code = String(line.materialCode || '').trim().toLocaleLowerCase('vi');
  if (code) return `code:${code}`;
  return `name:${String(line.materialName || '').trim().toLocaleLowerCase('vi')}`;
};

const formatNumber = (value: number) => value.toLocaleString('vi-VN', { maximumFractionDigits: 2 });
const formatCurrency = (value: number) => `${Math.round(value).toLocaleString('vi-VN')} đ`;

export const getMaterialStockRows = (
  materials: CategoryItem[],
  slips: SlipItem[],
  contracts: ContractItem[],
  expenses: ExpenseItem[],
  selectedMonth: string
): MaterialStockRow[] => {
  const movements: Movement[] = [];
  const addLines = (
    lines: MaterialLine[] | undefined,
    direction: Movement['direction'],
    date: unknown,
    source: string,
    reference: string,
    legacyUndated = false
  ) => {
    if (!Array.isArray(lines)) return;
    lines.forEach(line => {
      const quantity = Number(line.quantity) || 0;
      const catalogMaterial = findCatalogMaterial(line, materials);
      const name = String(line.materialName || catalogMaterial?.name || '').trim();
      if (quantity <= 0 || !name) return;
      const amount = Number(line.amount) > 0
        ? Number(line.amount)
        : quantity * (Number(line.unitPrice) || 0);
      movements.push({
        key: getMaterialKey(line, materials),
        name,
        code: String(catalogMaterial?.code || line.materialCode || ''),
        unit: String(line.unit || catalogMaterial?.unit || ''),
        date: toDateString(date),
        quantity,
        unitPrice: amount > 0 ? amount / quantity : Number(line.unitPrice) || 0,
        amount,
        direction,
        source,
        reference,
        legacyUndated
      });
    });
  };

  slips.forEach(slip => {
    const type = String(slip.type || '').toUpperCase();
    const reference = String(slip.slipNo || '');
    const isCompanyReceipt = type === 'NK' || type === 'NHAP' ||
      (type === 'NK_KHUNG' &&
        !slip.sourceContractId &&
        !slip.sourceReturnSlipId &&
        !slip.craftGroupLeader);
    if (isCompanyReceipt) {
      const supplier = String(slip.partnerName || slip.partner || 'Nhà cung cấp');
      addLines(
        slip.accompanyingMaterials as MaterialLine[] | undefined,
        'in',
        slip.date,
        `Nhập kho Cty B (${supplier})`,
        reference
      );
    }
    if (type === 'XUAT_SUA_KHOAN') {
      addLines(slip.accompanyingMaterials as MaterialLine[] | undefined, 'out', slip.date, 'Xuất sửa khoán', reference);
    }
  });

  contracts.forEach(contract => {
    if (contract.contractType !== 'SUB') return;
    const hasIssueDate = Boolean(contract.accompanyingMaterialsIssuedDate);
    addLines(
      contract.accompanyingMaterials,
      'out',
      contract.accompanyingMaterialsIssuedDate,
      'Cấp phát tổ đan',
      String(contract.contractNo || contract.productCode || ''),
      !hasIssueDate
    );
  });

  expenses.forEach(expense => {
    if (!Array.isArray(expense.items)) return;
    expense.items.forEach(item => {
      const name = String(item.name || '').trim();
      const sourceType = String(item.sourceType || '');
      const catalogMaterial = findCatalogMaterial({
        materialCode: item.sourceCode,
        materialName: name
      }, materials);
      const isMaterialCode = Boolean(item.sourceCode && materials.some(material =>
        normalizeMaterialIdentity(material.code) === normalizeMaterialIdentity(item.sourceCode)
      ));
      const isRawMaterial = sourceType === 'Nguyên liệu' ||
        isMaterialCode ||
        (sourceType !== 'Sản phẩm' && Boolean(catalogMaterial));
      if (!isRawMaterial) return;

      const quantity = Number(item.quantity) || 0;
      if (quantity <= 0 || !name) return;
      const amount = Number(item.amount) || quantity * (Number(item.unitPrice) || 0);
      addLines([{
        materialId: catalogMaterial?.id,
        materialCode: item.sourceCode || catalogMaterial?.code || '',
        materialName: name,
        quantity,
        unit: item.unit || catalogMaterial?.unit || '',
        unitPrice: Number(item.unitPrice) || amount / quantity,
        amount
      }], 'in', expense.date, `Mua qua Phiếu Chi (${expense.supplierName || expense.handler || 'Nhà cung cấp'})`, String(expense.expenseCode || expense.id));
    });
  });

  const periodStart = `${selectedMonth}-01`;
  const periodEnd = `${selectedMonth}-${new Date(
    Number(selectedMonth.slice(0, 4)),
    Number(selectedMonth.slice(5, 7)),
    0
  ).getDate().toString().padStart(2, '0')}`;
  const purchaseMovements = movements.filter(movement =>
    movement.direction === 'in' && movement.date && movement.date <= periodEnd
  );
  const materialKeys = new Set<string>([
    ...materials.map(material => `id:${material.id}`),
    ...movements.map(movement => movement.key)
  ]);

  return Array.from(materialKeys).map(key => {
    const catalogMaterial = materials.find(material => `id:${material.id}` === key);
    const materialMovements = movements.filter(movement => movement.key === key);
    const purchases = purchaseMovements.filter(movement => movement.key === key);
    const currentMovements = materialMovements.filter(movement =>
      movement.date >= periodStart && movement.date <= periodEnd
    );
    const openingMovements = materialMovements.filter(movement =>
      movement.legacyUndated || (movement.date && movement.date < periodStart)
    );
    const opening = openingMovements.reduce(
      (sum, movement) => sum + (movement.direction === 'in' ? movement.quantity : -movement.quantity),
      0
    );
    const incoming = currentMovements
      .filter(movement => movement.direction === 'in')
      .reduce((sum, movement) => sum + movement.quantity, 0);
    const outgoingMovements = currentMovements.filter(movement => movement.direction === 'out');
    const outgoing = outgoingMovements.reduce((sum, movement) => sum + movement.quantity, 0);
    const closing = opening + incoming - outgoing;
    const pricedPurchases = purchases.filter(movement => movement.amount > 0 && movement.quantity > 0);
    const purchaseQuantity = pricedPurchases.reduce((sum, movement) => sum + movement.quantity, 0);
    const purchaseValue = pricedPurchases.reduce((sum, movement) => sum + movement.amount, 0);
    const averagePrice = purchaseQuantity > 0 ? purchaseValue / purchaseQuantity : 0;
    const highestPurchasePrice = pricedPurchases.reduce(
      (highest, movement) => Math.max(highest, movement.unitPrice),
      0
    );
    const outgoingValue = outgoingMovements.reduce((sum, movement) => {
      const purchasesByIssueDate = pricedPurchases.filter(purchase =>
        purchase.date <= movement.date
      );
      const issuePrice = purchasesByIssueDate.reduce(
        (highest, purchase) => Math.max(highest, purchase.unitPrice),
        0
      );
      return sum + movement.quantity * issuePrice;
    }, 0);
    const notes = [
      ...currentMovements
        .filter(movement => movement.direction === 'in')
        .map(movement => `${movement.source} ${movement.reference}: +${formatNumber(movement.quantity)}${movement.unit ? ` ${movement.unit}` : ''}`),
      ...outgoingMovements.map(movement => `${movement.source} ${movement.reference}: -${formatNumber(movement.quantity)}${movement.unit ? ` ${movement.unit}` : ''}`)
    ];
    if (outgoing > 0) {
      notes.push(`Xuất tính theo giá nhập cao nhất; thành tiền xuất kỳ: ${formatCurrency(outgoingValue)}`);
    }
    const firstMovement = materialMovements[0];
    return {
      key,
      name: catalogMaterial?.name || firstMovement?.name || 'Nguyên phụ liệu',
      code: catalogMaterial?.code || firstMovement?.code || '',
      unit: catalogMaterial?.unit || firstMovement?.unit || '',
      opening,
      incoming,
      outgoing,
      closing,
      averagePrice,
      highestPurchasePrice,
      outgoingValue,
      closingValue: closing * averagePrice,
      notes
    };
  }).sort((first, second) => first.name.localeCompare(second.name, 'vi'));
};
