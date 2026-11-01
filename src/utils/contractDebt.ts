import type { ContractItem } from '../context/AppContext';

export type DebtDueStatus = 'upcoming' | 'due-today' | 'overdue' | null;

export const getTodayDateString = () => {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
};

export const getDateAfterDaysString = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

export const isValidDebtDueDate = (dueDate: string, today = getTodayDateString()) => {
  if (!dueDate) return true;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dueDate);
  if (!match) return false;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));
  const isValidCalendarDate = date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
  return isValidCalendarDate && dueDate > today;
};

export const getContractMaterialAmount = (contract: ContractItem) =>
  (Array.isArray(contract.accompanyingMaterials) ? contract.accompanyingMaterials : [])
    .reduce((sum, material) =>
      sum + (Number(material.amount) || (Number(material.quantity) || 0) * (Number(material.unitPrice) || 0)), 0);

export const getContractFinancialSummary = (contract: ContractItem) => {
  const logs = Array.isArray(contract.receivedGoodsLogs) ? contract.receivedGoodsLogs : [];
  const receivedQuantity = logs.reduce((sum, log) => sum + (Number(log.quantity) || 0), 0);
  const receivedAmount = logs.reduce((sum, log) => sum + (Number(log.amount) || 0), 0);
  const complete = Number(contract.quantity) > 0 && receivedQuantity >= Number(contract.quantity);
  const recognizedAmount = complete
    ? Number(contract.totalAmount) || (Number(contract.quantity) || 0) * (Number(contract.unitPrice) || 0)
    : receivedAmount;
  const paidAmount = logs.reduce((sum, log) => sum + (Number(log.paidAmount) || 0), 0);
  const deductedDeposit = logs.reduce((sum, log) => sum + (Number(log.deductedDeposit) || 0), 0);
  const materialAmount = getContractMaterialAmount(contract);
  const deductedMaterialAmount = logs.reduce((sum, log) => sum + (Number(log.deductedMaterialAmount) || 0), 0);
  const outstanding = Math.max(0, recognizedAmount - paidAmount - deductedDeposit - deductedMaterialAmount);
  const debtLogs = logs
    .filter(log => log.debtDueDate)
    .slice()
    .sort((first, second) => String(first.debtDueDate).localeCompare(String(second.debtDueDate)));

  return {
    receivedQuantity,
    totalQuantity: Number(contract.quantity) || 0,
    paidAmount,
    deductedDeposit,
    materialAmount,
    deductedMaterialAmount,
    outstanding,
    complete,
    status: complete
      ? outstanding === 0 ? 'Đã thanh toán đủ' : 'Công Nợ Phải Trả'
      : outstanding > 0 ? 'Còn công nợ lũy kế' : paidAmount + deductedDeposit + deductedMaterialAmount > receivedAmount ? 'Đã trả trước' : 'Đang nhận hàng',
    debtDueDate: outstanding > 0 ? debtLogs[0]?.debtDueDate || '' : ''
  };
};

export const getDebtDueStatus = (
  dueDate: string,
  outstanding: number,
  today = new Date()
): DebtDueStatus => {
  if (!dueDate || outstanding <= 0) return null;
  const [year, month, day] = dueDate.split('-').map(Number);
  if (!year || !month || !day) return null;

  const dueDay = Date.UTC(year, month - 1, day);
  const dueDateValue = new Date(dueDay);
  if (
    dueDateValue.getUTCFullYear() !== year ||
    dueDateValue.getUTCMonth() !== month - 1 ||
    dueDateValue.getUTCDate() !== day
  ) return null;
  const currentDay = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const daysUntilDue = Math.round((dueDay - currentDay) / 86_400_000);

  if (daysUntilDue < 0) return 'overdue';
  if (daysUntilDue === 0) return 'due-today';
  if (daysUntilDue <= 3) return 'upcoming';
  return null;
};

export const getDebtDueBadge = (status: DebtDueStatus) => {
  switch (status) {
    case 'overdue':
      return { label: 'Trễ hạn', color: '#b91c1c', backgroundColor: '#fee2e2' };
    case 'due-today':
      return { label: 'Đến hạn thanh toán', color: '#c2410c', backgroundColor: '#ffedd5' };
    case 'upcoming':
      return { label: 'Sắp tới hạn', color: '#a16207', backgroundColor: '#fef3c7' };
    default:
      return null;
  }
};
