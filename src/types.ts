export interface ContractItem {
  id: string | number;
  contractNo: string;
  productCode: string;
  productName?: string;
  partner?: string;
  quantity?: number;
  totalQty?: number;
  unitType?: 'Bộ' | 'Cái' | 'Cả Bộ lẫn Cái';
  unitPrice?: number;
  isLiquidated?: boolean;
}

export interface FrameExportItem {
  id: number;
  contractNo: string;
  artisanName: string;
  productCode: string;
  exportQty: number;
}