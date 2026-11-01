import type { CategoryItem, ContractItem, SlipItem } from '../context/AppContext';

export interface FrameStockRow {
  productCode: string;
  productName: string;
  opening: number;
  inbound: number;
  outbound: number;
  closing: number;
  note: string;
}

interface FrameMovement {
  productCode: string;
  productName: string;
  date: string;
  direction: 'in' | 'out';
  quantity: number;
  note: string;
}

const normalize = (value: unknown) => String(value || '').trim().toLocaleLowerCase('vi');
const normalizeDate = (value: unknown) => {
  const date = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '';
};
const normalizeSizeKey = (key: string) => {
  if (key.toLocaleLowerCase('vi') === 'bộ') return 'Bộ';
  const sizeNumber = /(?:cái|size)\s*(\d+)/i.exec(key)?.[1];
  return sizeNumber ? `C${sizeNumber}` : key;
};

const getSizeDetails = (sizes: Record<string, unknown> | undefined) =>
  Object.entries(sizes || {})
    .filter(([, quantity]) => Number(quantity) > 0)
    .map(([size, quantity]) => `${Number(quantity)}${normalizeSizeKey(size)}`);

const getSizeCount = (productCode: string) => {
  const count = Number(/\/(\d+)\s*$/.exec(productCode)?.[1]);
  return Number.isInteger(count) && count > 0 && count <= 20 ? count : 1;
};

const getSlipQuantity = (slip: SlipItem, productCode: string) => {
  if (Number(slip.returnQuantityInContractUnits) > 0) {
    return Number(slip.returnQuantityInContractUnits) || 0;
  }
  const quantity = Number(slip.quantity) || 0;
  const sizes = slip.sizeQuantities || {};
  const loosePieces = Object.entries(sizes)
    .filter(([name]) => name.toLocaleLowerCase('vi') !== 'bộ')
    .reduce((sum, [, count]) => sum + (Number(count) || 0), 0);
  const bundles = Number(sizes['Bộ']) || 0;
  const unit = String(slip.unit || '').toLocaleLowerCase('vi');
  if (bundles > 0 || unit.includes('bộ (')) {
    return (bundles || quantity) + loosePieces / getSizeCount(productCode);
  }
  if (loosePieces > 0) return loosePieces / getSizeCount(productCode);
  if (unit.includes('cái') || unit.includes('từng size')) {
    return quantity / getSizeCount(productCode);
  }
  return quantity;
};

const describeSizes = (
  sizes: Record<string, unknown> | undefined,
  direction: 'in' | 'out',
  originalNote: string
) => {
  const details = getSizeDetails(sizes);
  const detailText = details.length
    ? `${direction === 'in' ? 'Nhập' : 'Xuất'} lẻ: ${details.join(direction === 'in' ? '+' : ', ')}`
    : '';
  return [detailText, originalNote.trim()].filter(Boolean).join(' · ');
};

const isFrameReceipt = (slip: SlipItem) => {
  const slipNo = String(slip.slipNo || '').toUpperCase();
  const type = String(slip.type || '').toUpperCase();
  return type === 'NK' || type === 'NK_KHUNG' || type === 'KS' ||
    slipNo.startsWith('NK') || slipNo.startsWith('KS');
};

const getMovements = (contracts: ContractItem[], slips: SlipItem[]): FrameMovement[] => {
  const movements: FrameMovement[] = [];

  slips.forEach(slip => {
    const type = String(slip.type || '').toUpperCase();
    if (type === 'XUAT_KS_TRA_CTY') {
      const returnLines = Array.isArray(slip.companyReturnLines) ? slip.companyReturnLines : [];
      if (returnLines.length) {
        returnLines.forEach(line => {
          if (!line.productCode) return;
          const sizes = line.sizeQuantities || {};
          const loosePieces = Object.entries(sizes)
            .filter(([name]) => name.toLocaleLowerCase('vi') !== 'bộ')
            .reduce((sum, [, count]) => sum + (Number(count) || 0), 0);
          const quantity = Number(line.quantity) > 0
            ? Number(line.quantity)
            : (Number(line.bundleQuantity) || Number(sizes['Bộ']) || 0) +
              loosePieces / getSizeCount(line.productCode);
          movements.push({
            productCode: line.productCode,
            productName: line.productName || slip.productName || '',
            date: normalizeDate(slip.date),
            direction: 'out',
            quantity,
            note: describeSizes(line.sizeQuantities, 'out', slip.note || '')
          });
        });
      } else if (slip.productCode) {
        movements.push({
          productCode: slip.productCode,
          productName: slip.productName || '',
          date: normalizeDate(slip.date),
          direction: 'out',
          quantity: Number(slip.quantity) || 0,
          note: slip.note || ''
        });
      }
      return;
    }

    if (!isFrameReceipt(slip)) return;
    if (!slip.productCode) return;
    movements.push({
      productCode: slip.productCode,
      productName: slip.productName || '',
      date: normalizeDate(slip.date),
      direction: 'in',
      quantity: getSlipQuantity(slip, slip.productCode),
      note: describeSizes(
        slip.sizeQuantities,
        'in',
        [slip.sourceReturnSlipId ? 'Nhận lại khung từ tổ đan' : '', slip.note || ''].filter(Boolean).join(' · ')
      )
    });
  });

  contracts.forEach(contract => {
    if (contract.contractType !== 'SUB' && !contract.craftGroupLeader) return;
    (Array.isArray(contract.exportLogs) ? contract.exportLogs : []).forEach(log => {
      const date = normalizeDate(log.exportDate);
      if (!contract.productCode || !date) return;
      movements.push({
        productCode: contract.productCode,
        productName: contract.productName || '',
        date,
        direction: 'out',
        quantity: Number(log.actualQty) || 0,
        note: log.note?.trim() || `Xuất khung cho tổ ${contract.craftGroupLeader || ''}`.trim()
      });
    });
  });

  return movements.filter(movement =>
    movement.productCode.trim() &&
    Number.isFinite(movement.quantity) &&
    movement.quantity > 0
  );
};

export const getFrameStockRows = (
  products: CategoryItem[],
  contracts: ContractItem[],
  slips: SlipItem[],
  month: string
): FrameStockRow[] => {
  const periodStart = `${month}-01`;
  const movements = getMovements(contracts, slips);
  const productsByCode = new Map<string, { productCode: string; productName: string }>();

  products.forEach(product => {
    if (product.code?.trim()) {
      productsByCode.set(normalize(product.code), {
        productCode: product.code.trim(),
        productName: product.name || ''
      });
    }
  });
  contracts.forEach(contract => {
    if (contract.productCode?.trim() && !productsByCode.has(normalize(contract.productCode))) {
      productsByCode.set(normalize(contract.productCode), {
        productCode: contract.productCode.trim(),
        productName: contract.productName || ''
      });
    }
  });
  movements.forEach(movement => {
    const key = normalize(movement.productCode);
    const existing = productsByCode.get(key);
    productsByCode.set(key, {
      productCode: existing?.productCode || movement.productCode.trim(),
      productName: existing?.productName || movement.productName
    });
  });

  const rows = new Map<string, FrameStockRow>();
  productsByCode.forEach((product, key) => {
    rows.set(key, {
      ...product,
      opening: 0,
      inbound: 0,
      outbound: 0,
      closing: 0,
      note: ''
    });
  });
  const notesByProduct = new Map<string, Set<string>>();

  movements.forEach(movement => {
    const key = normalize(movement.productCode);
    const row = rows.get(key);
    if (!row || !normalizeDate(movement.date)) return;
    if (movement.date < periodStart) {
      row.opening += movement.direction === 'in' ? movement.quantity : -movement.quantity;
    } else if (movement.date.slice(0, 7) === month) {
      if (movement.direction === 'in') row.inbound += movement.quantity;
      else row.outbound += movement.quantity;
      const note = [
        movement.direction === 'in' ? 'Nhập' : 'Xuất',
        movement.date,
        movement.note
      ].filter(Boolean).join(': ');
      if (movement.note) {
        const notes = notesByProduct.get(key) || new Set<string>();
        notes.add(note);
        notesByProduct.set(key, notes);
      }
    }
  });

  return Array.from(rows.entries())
    .map(([key, row]) => ({
      ...row,
      closing: row.opening + row.inbound - row.outbound,
      note: Array.from(notesByProduct.get(key) || []).join(' | ')
    }))
    .filter(row => row.opening !== 0 || row.inbound !== 0 || row.outbound !== 0)
    .sort((first, second) => first.productCode.localeCompare(second.productCode, 'vi', { numeric: true }));
};
