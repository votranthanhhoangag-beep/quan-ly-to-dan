import type {
  ContractItem,
  DepositSlip,
  KnittingExportSlip,
  SlipItem
} from '../context/AppContext';
import { getContractReceivedDeposit } from './contractDebt';

export type AssistantReminderGroup = 'urgent' | 'upcoming' | 'coordination';
export type AssistantDestination = 'contracts' | 'inventory' | 'knittingExport';

export interface AssistantReminder {
  id: string;
  group: AssistantReminderGroup;
  title: string;
  detail: string;
  destination: AssistantDestination;
  contractId?: string | number;
  inventoryTab?: 'NK_KHUNG' | 'FRAME_STOCK';
}

interface AssistantData {
  contracts: ContractItem[];
  slips: SlipItem[];
  depositSlips: DepositSlip[];
  knittingExportSlips: KnittingExportSlip[];
}

const normalize = (value: unknown) => String(value || '').trim().toLocaleLowerCase('vi');
const getAmount = (value: unknown) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
};

const parseDate = (value: unknown) => {
  const dateValue = String(value || '').trim();
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateValue);
  const vietnameseMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(dateValue);
  const year = Number(isoMatch?.[1] || vietnameseMatch?.[3]);
  const month = Number(isoMatch?.[2] || vietnameseMatch?.[2]);
  const day = Number(isoMatch?.[3] || vietnameseMatch?.[1]);
  if (!year || !month || !day) return null;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) return null;
  return parsed;
};

const getParentContracts = (contracts: ContractItem[]) =>
  contracts.filter(contract => contract.contractType === 'PARENT' || !contract.contractType);

const getSubContracts = (contracts: ContractItem[]) =>
  contracts.filter(contract => contract.contractType === 'SUB');

const getPiecesPerSet = (productCode: string) => {
  const sizeCount = Number(/\/(\d+)\s*$/.exec(productCode)?.[1]);
  return Number.isInteger(sizeCount) && sizeCount > 1 && sizeCount <= 20 ? sizeCount : 1;
};

const getSubcontractReceivedQuantity = (contract: ContractItem) => {
  const sizeCount = getPiecesPerSet(contract.productCode);
  const configuredSizes = Object.keys(contract.sizeQuantities || {})
    .filter(size => size !== 'Bộ')
    .sort((first, second) => first.localeCompare(second, 'vi', { numeric: true }));
  const sizeKeys = sizeCount > 1
    ? Array.from({ length: sizeCount }, (_, index) => configuredSizes[index] || `Cái ${index + 1}`)
    : [];

  return (Array.isArray(contract.receivedGoodsLogs) ? contract.receivedGoodsLogs : [])
    .reduce((sum, log) => {
      const quantity = getAmount(log.quantity);
      const itemType = log.itemTypeOption || contract.itemTypeOption || 'BO';
      const completeSets = sizeKeys.length
        ? Math.min(...sizeKeys.map(size => getAmount(log.sizeQuantities?.[size])))
        : 0;
      if (itemType === 'CAI') return sum + (completeSets || quantity);
      if (itemType === 'CA_HAI') return sum + quantity + completeSets;
      if (Object.prototype.hasOwnProperty.call(log.sizeQuantities || {}, 'Bộ')) {
        return sum + getAmount(log.sizeQuantities?.['Bộ']);
      }
      return sum + quantity;
    }, 0);
};

const getParentGoodExportQuantity = (
  parent: ContractItem,
  knittingExportSlips: KnittingExportSlip[]
) => knittingExportSlips.reduce((sum, slip) => {
  const sameProduct = normalize(slip.productCode) === normalize(parent.productCode);
  const matchesParent = slip.companyBContractId !== undefined
    ? String(slip.companyBContractId) === String(parent.id)
    : normalize(slip.companyBContractNo || slip.parentContractNo) === normalize(parent.contractNo);
  return sameProduct && matchesParent
    ? sum + getAmount(slip.goodContractQuantity)
    : sum;
}, 0);

const isCompanyFrameReceipt = (slip: SlipItem) => {
  const slipNo = String(slip.slipNo || '').toUpperCase();
  const type = String(slip.type || '').toUpperCase();
  return type === 'NK' || type === 'NHAP' || slipNo.startsWith('NK') ||
    ((type === 'NK_KHUNG' || type === 'KS' || slipNo.startsWith('KS')) &&
      !slip.sourceContractId && !slip.craftGroupLeader);
};

const getParentFrameReceiptQuantity = (
  parent: ContractItem,
  parentContracts: ContractItem[],
  frameReceipts: SlipItem[]
) => {
  const contractNo = normalize(parent.contractNo);
  const productCode = normalize(parent.productCode);
  const sameCodeParents = parentContracts.filter(item => normalize(item.productCode) === productCode);
  return frameReceipts.reduce((sum, slip) => {
    const slipContractNo = normalize(slip.contractNo);
    const matchesParent = slipContractNo
      ? slipContractNo === contractNo
      : sameCodeParents.length === 1 && normalize(slip.productCode) === productCode;
    return matchesParent ? sum + getAmount(slip.quantity) : sum;
  }, 0);
};

const getSubcontractIssuedQuantity = (contract: ContractItem) => {
  const logsTotal = (Array.isArray(contract.exportLogs) ? contract.exportLogs : [])
    .reduce((sum, log) => sum + getAmount(log.actualQty), 0);
  return Math.max(getAmount(contract.totalActualExported), logsTotal);
};

const getIssuedForParent = (
  parent: ContractItem,
  parentContracts: ContractItem[],
  subContracts: ContractItem[]
) => {
  const parentNo = normalize(parent.contractNo);
  const productCode = normalize(parent.productCode);
  const sameCodeParents = parentContracts.filter(item => normalize(item.productCode) === productCode);
  return subContracts
    .filter(contract =>
      normalize(contract.productCode) === productCode &&
      (normalize(contract.parentContractNo)
        ? normalize(contract.parentContractNo) === parentNo
        : sameCodeParents.length === 1)
    )
    .reduce((sum, contract) => sum + getSubcontractIssuedQuantity(contract), 0);
};

const getCompanyDepositAmount = (
  contract: ContractItem,
  depositSlips: DepositSlip[]
) => {
  const recordedSlips = depositSlips
    .filter(slip => normalize(slip.contractNo) === normalize(contract.contractNo))
    .reduce((sum, slip) => sum + getAmount(slip.amount), 0);
  return Math.max(getContractReceivedDeposit(contract), recordedSlips);
};

const getExportedGoodQuantityForSubcontract = (
  contract: ContractItem,
  knittingExportSlips: KnittingExportSlip[]
) => knittingExportSlips.reduce((sum, slip) => {
  if (Array.isArray(slip.sourceAllocations) && slip.sourceAllocations.length > 0) {
    const sourceAllocations = slip.sourceAllocations.filter(
      allocation => String(allocation.sourceContractId) === String(contract.id)
    );
    if (sourceAllocations.length === 0) return sum;
    const totalAllocatedPieces = slip.sourceAllocations.reduce(
      (total, allocation) => total + getAmount(allocation.quantityPieces),
      0
    );
    const thisContractPieces = sourceAllocations.reduce(
      (total, allocation) => total + getAmount(allocation.quantityPieces),
      0
    );
    if (totalAllocatedPieces <= 0) return sum;
    return sum + getAmount(slip.goodContractQuantity) * thisContractPieces / totalAllocatedPieces;
  }
  const matchesContract = String(slip.sourceContractId) === String(contract.id) ||
    normalize(slip.sourceContractNo) === normalize(contract.contractNo);
  return matchesContract ? sum + getAmount(slip.goodContractQuantity) : sum;
}, 0);

const formatNumber = (value: number) =>
  value.toLocaleString('vi-VN', { maximumFractionDigits: 2 });

export const analyzeAiAssistant = (
  data: AssistantData,
  now = new Date()
): AssistantReminder[] => {
  const { contracts, slips, depositSlips, knittingExportSlips } = data;
  const parentContracts = getParentContracts(contracts);
  const subContracts = getSubContracts(contracts);
  const frameReceipts = slips.filter(isCompanyFrameReceipt);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const reminders: AssistantReminder[] = [];

  const addDeadlineReminder = (contract: ContractItem, completedQuantity: number) => {
    const dueDate = parseDate(contract.dueDate);
    if (!dueDate || contract.isLiquidated) return;
    const targetQuantity = getAmount(contract.quantity);
    if (targetQuantity > 0 && completedQuantity >= targetQuantity) return;

    const daysRemaining = Math.round((dueDate.getTime() - today) / 86_400_000);
    if (daysRemaining > 7) return;
    const group: AssistantReminderGroup = daysRemaining <= 3 ? 'urgent' : 'upcoming';
    const contractKind = contract.contractType === 'SUB' ? 'HĐ Tổ Đan' : 'HĐ Công ty';
    const recipient = contract.contractType === 'SUB'
      ? contract.craftGroupLeader || 'Tổ đan'
      : contract.companyName || contract.company || contract.partner || 'Công ty';
    const deadlineText = daysRemaining < 0
      ? `Quá hạn ${formatNumber(Math.abs(daysRemaining))} ngày`
      : daysRemaining === 0
        ? 'Đến hạn hôm nay'
        : `Còn ${formatNumber(daysRemaining)} ngày`;

    reminders.push({
      id: `deadline:${contract.id}`,
      group,
      title: `${contractKind} ${contract.contractNo || 'chưa có số'} · ${deadlineText}`,
      detail: `${recipient} · Mã ${contract.productCode || '—'} · Đã hoàn thành ${formatNumber(completedQuantity)}/${formatNumber(targetQuantity)}.`,
      destination: 'contracts',
      contractId: contract.id
    });
  };

  parentContracts.forEach(contract => {
    const completed = getParentGoodExportQuantity(contract, knittingExportSlips);
    addDeadlineReminder(contract, completed);
  });

  subContracts.forEach(contract => {
    const linkedParent = parentContracts.find(parent =>
      normalize(parent.contractNo) === normalize(contract.parentContractNo)
    );
    if (linkedParent?.isLiquidated) return;
    addDeadlineReminder(contract, getSubcontractReceivedQuantity(contract));
  });

  parentContracts.forEach(parent => {
    const received = getParentFrameReceiptQuantity(parent, parentContracts, frameReceipts);
    if (parent.isLiquidated) return;
    const issued = getIssuedForParent(parent, parentContracts, subContracts);
    const remaining = Math.max(0, received - issued);
    if (remaining > 0) {
      reminders.push({
        id: `frames-unallocated:${parent.id}`,
        group: 'coordination',
        title: `Còn khung chưa phát · HĐ ${parent.contractNo || '—'}`,
        detail: `Mã ${parent.productCode || '—'} còn ${formatNumber(remaining)} khung sơn đã nhận từ công ty chưa giao khoán cho tổ đan.`,
        destination: 'contracts'
      });
    }

    const targetQuantity = getAmount(parent.quantity);
    const remainingFrames = Math.max(0, targetQuantity - received);
    if (remainingFrames > 0) {
      reminders.push({
        id: `frames-incomplete:${parent.id}`,
        group: 'coordination',
        title: `Chưa nhận đủ khung · HĐ ${parent.contractNo || '—'}`,
        detail: `Mã ${parent.productCode || '—'} đã nhận ${formatNumber(received)}/${formatNumber(targetQuantity)}; còn thiếu ${formatNumber(remainingFrames)} khung.`,
        destination: 'inventory',
        contractId: parent.id,
        inventoryTab: 'NK_KHUNG'
      });
    }

    if (
      !parent.isLiquidated &&
      getAmount(parent.totalAmount) > 0 &&
      getCompanyDepositAmount(parent, depositSlips) <= 0
    ) {
      reminders.push({
        id: `deposit-missing:${parent.id}`,
        group: 'coordination',
        title: `Chưa ghi nhận tiền cọc · HĐ ${parent.contractNo || '—'}`,
        detail: `Mã ${parent.productCode || '—'} chưa có khoản cọc nào được ghi nhận trong hệ thống.`,
        destination: 'contracts',
        contractId: parent.id
      });
    }
  });

  subContracts.forEach(contract => {
    if (!Array.isArray(contract.receivedGoodsLogs) || contract.receivedGoodsLogs.length === 0) return;
    const received = getSubcontractReceivedQuantity(contract);
    const exported = getExportedGoodQuantityForSubcontract(contract, knittingExportSlips);
    const unexported = Math.max(0, received - exported);
    if (unexported <= 0) return;
    reminders.push({
      id: `goods-unexported:${contract.id}`,
      group: 'coordination',
      title: `Hàng đạt chưa xuất giao · ${contract.craftGroupLeader || contract.contractNo || 'Tổ đan'}`,
      detail: `HĐ ${contract.contractNo || '—'} · Mã ${contract.productCode || '—'} còn ${formatNumber(unexported)} ${contract.unit || 'đơn vị'} hàng đã nhận nhưng chưa ghi nhận xuất giao công ty.`,
      destination: 'knittingExport',
      contractId: contract.id
    });
  });

  return reminders.sort((first, second) => {
    const groupOrder: Record<AssistantReminderGroup, number> = {
      urgent: 0,
      upcoming: 1,
      coordination: 2
    };
    return groupOrder[first.group] - groupOrder[second.group] ||
      first.title.localeCompare(second.title, 'vi', { numeric: true });
  });
};
