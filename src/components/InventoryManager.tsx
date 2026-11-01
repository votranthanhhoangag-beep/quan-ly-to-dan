import React, { useState, useEffect } from 'react';
import { useApp, type CategoryItem } from '../context/AppContext';
import { ImageCaptureInput } from './ImageCaptureInput';
import { usePersistentFormDraft } from '../hooks/usePersistentFormDraft';
import { createUniqueId } from '../utils/uniqueId';

type MaterialUnit = 'kg' | 'lọn' | 'bó' | 'cái';

interface AccompanyingMaterial {
  materialId: number;
  materialCode: string;
  materialName: string;
  quantity: number;
  unit: MaterialUnit;
}

interface AccompanyingMaterialFormRow {
  id: string;
  materialId: number | null;
  materialCode: string;
  materialName: string;
  query: string;
  unit: MaterialUnit;
  quantity: string;
  isDropdownOpen: boolean;
}

const createAccompanyingMaterialRow = (): AccompanyingMaterialFormRow => ({
  id: `material-${Date.now()}-${Math.random()}`,
  materialId: null,
  materialCode: '',
  materialName: '',
  query: '',
  unit: 'kg',
  quantity: '',
  isDropdownOpen: false
});

interface StockTransaction {
  id: string;
  type: 'NK' | 'NK_KHUNG' | string;
  slipNo: string;
  date: string;
  contractNo: string;
  productCode: string;
  productName: string;
  quantity: number;
  unit: string;
  partnerName: string;
  partner?: string;
  sourceContractId?: string | number;
  craftGroupLeader?: string;
  note: string;
  image?: string;
  imageProof?: string;
  sizeQuantities?: { [key: string]: number | string };
  accompanyingMaterials?: AccompanyingMaterial[];
}

interface Props {
  onNavigateToTab?: (tabName: string) => void;
}

export const InventoryManager: React.FC<Props> = ({ onNavigateToTab }) => {
  const { formDraftProps, clearDraft, isSubmitting } = usePersistentFormDraft('inventory-manager');
  const appContext = useApp() as any;
  const { 
    contracts = [], 
    materials = [],
    slips = [],
    inventoryLogs = [], 
    addInventoryLog, 
    addSlip,
    updateInventoryLog, 
    updateSlip,
    deleteInventoryLog,
    deleteSlip
  } = appContext || {};

  const masterLogs = (Array.isArray(inventoryLogs) && inventoryLogs.length > 0
    ? inventoryLogs
    : Array.isArray(slips) ? slips : [])
    .filter((item: unknown): item is StockTransaction =>
      Boolean(item) && typeof item === 'object'
    );
  const contractItems = Array.isArray(contracts)
    ? contracts.filter((item: unknown) => Boolean(item) && typeof item === 'object')
    : [];
  const materialItems = Array.isArray(materials)
    ? materials.filter((item: unknown) => Boolean(item) && typeof item === 'object')
    : [];

  const handleAdd = (payload: any) => {
    if (addInventoryLog) addInventoryLog(payload);
    else if (addSlip) addSlip(payload);
  };

  const handleUpdate = (payload: any) => {
    if (updateInventoryLog) updateInventoryLog(payload);
    else if (updateSlip) updateSlip(payload);
  };

  const handleDelete = (id: any) => {
    if (deleteInventoryLog) deleteInventoryLog(id);
    else if (deleteSlip) deleteSlip(id);
  };

  const getTodayISO = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getYear2Digits = () => {
    return new Date().getFullYear().toString().slice(-2);
  };

  const minDateString = getTodayISO();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState<boolean>(true);

  const [transType, setTransType] = useState<'NK_KHUNG' | 'NK'>('NK_KHUNG');
  const [slipNo, setSlipNo] = useState<string>('');
  const [transDate, setTransDate] = useState<string>(minDateString);
  const [contractNo, setContractNo] = useState<string>('');
  const [selectedProductCode, setSelectedProductCode] = useState<string>('');
  const [productName, setProductName] = useState<string>('');
  const [quantity, setQuantity] = useState<string>('1');
  const [partnerName, setPartnerName] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [transactionImage, setTransactionImage] = useState<string>('');

  const [unitOption, setUnitOption] = useState<'BO' | 'CAI' | 'CA_HAI'>('BO');
  const [sizeQuantities, setSizeQuantities] = useState<{ [key: string]: string }>({});
  const [accompanyingMaterials, setAccompanyingMaterials] = useState<AccompanyingMaterialFormRow[]>([
    createAccompanyingMaterialRow()
  ]);

  const [activeTab, setActiveTab] = useState<'ALL' | 'NK_KHUNG' | 'NK'>('NK_KHUNG');
  const [filterDate, setFilterDate] = useState<string>('');
  const [filterKeyword, setFilterKeyword] = useState<string>('');

  const parentContracts = contractItems.filter((c: any) => c.contractType === 'PARENT' || !c.contractType);
  const companyProductCodes = Array.from(new Set(parentContracts.map((c: any) => c.productCode).filter(Boolean)));

  const isCompanyFrameReceipt = (item: StockTransaction) => {
    if (!item || typeof item !== 'object') return false;
    const slip = String(item.slipNo || '').toUpperCase();
    const type = String(item.type || '').toUpperCase();
    return type === 'NK' || type === 'NHAP' || slip.startsWith('NK') ||
      ((type === 'NK_KHUNG' || type === 'KS' || slip.startsWith('KS')) &&
        !item.sourceContractId && !item.craftGroupLeader);
  };

  // TÌM HỢP ĐỒNG HIỆN TẠI DỰA TRÊN MÃ HÀNG ĐÃ CHỌN
  const matchedContract = parentContracts.find((c: any) => 
    String(c.productCode || '').trim().toLowerCase() === selectedProductCode.trim().toLowerCase()
  );

  const totalContractQty = matchedContract ? Number(matchedContract.quantity || 0) : 0;

  // TÍNH TỔNG SỐ LƯỢNG ĐÃ NHẬP CHO MÃ HÀNG NÀY TRƯỚC ĐÓ
  const totalReceivedQty = masterLogs
    .filter((l: any) => {
      const receipt = transType === 'NK'
        ? isCompanyFrameReceipt(l)
        : String(l.slipNo || '').toUpperCase().startsWith('KS') || l.type === 'NK_KHUNG' || l.type === 'KS';
      return receipt && String(l.productCode || '').trim().toLowerCase() === selectedProductCode.trim().toLowerCase() && String(l.id) !== String(editingId);
    })
    .reduce((sum: number, l: any) => sum + (Number(l.quantity) || 0), 0);

  const remainingQty = totalContractQty > 0 ? Math.max(0, totalContractQty - totalReceivedQty - (Number(quantity) || 0)) : 0;

  const getMaxSizesFromCode = (codeStr: string): number => {
    if (!codeStr) return 1;
    if (codeStr.includes('/')) {
      const parts = codeStr.trim().split('/');
      const lastPart = parts[parts.length - 1];
      const num = parseInt(lastPart, 10);
      if (!isNaN(num) && num > 1 && num <= 20) return num;
    }
    return 1;
  };

  const maxAllowedSizes = getMaxSizesFromCode(selectedProductCode);
  const isSetProduct = maxAllowedSizes > 1 || selectedProductCode.toLowerCase().includes('bộ');

  useEffect(() => {
    if (selectedProductCode && isSetProduct) {
      const newMap: { [key: string]: string } = {};
      for (let i = 1; i <= maxAllowedSizes; i++) {
        const sName = `Cái ${i}`;
        newMap[sName] = sizeQuantities[sName] || '';
      }
      setSizeQuantities(newMap);
    }
  }, [selectedProductCode, isSetProduct]);

  const generateSlipNo = (type: 'NK' | 'NK_KHUNG', partner: string) => {
    const yearShort = getYear2Digits();
    const cleanPartner = partner 
      ? partner.toUpperCase().replace(/(CTY|CÔNG TY|CP|CỔ PHẦN|TNHH)/g, '').trim().split(/\s+/)[0] || 'ARTEX' 
      : 'ARTEX';
      
    const count = masterLogs.filter((l: any) => {
      const s = String(l.slipNo || '').toUpperCase();
      const t = String(l.type || '').toUpperCase();
      if (type === 'NK_KHUNG') return s.startsWith('KS') || t === 'NK_KHUNG' || t === 'KS';
      return s.startsWith('NK') || t === 'NK' || t === 'NHAP';
    }).length + 1;
    
    const seq = count < 10 ? `0${count}` : `${count}`;

    if (type === 'NK_KHUNG') {
      return `KS-${seq}-${cleanPartner}-${yearShort}`;
    } else if (type === 'NK') {
      return `NK-${seq}/${yearShort}`;
    }
    return `NK-${seq}/${yearShort}`;
  };

  useEffect(() => {
    if (!editingId) {
      setSlipNo(generateSlipNo(transType, partnerName));
    }
  }, [transType, partnerName, editingId, masterLogs]);

  const handleProductSelect = (code: string) => {
    setSelectedProductCode(code);
    if (!code.trim()) return;

    const matched = parentContracts.find((c: any) => String(c.productCode || '').trim().toLowerCase() === code.trim().toLowerCase());
    
    if (matched) {
      setProductName(matched.productName || '');
      setContractNo(matched.contractNo || '');
      if (matched.companyName && matched.companyName !== 'Nội bộ Tổ Đan') {
        setPartnerName(matched.companyName);
      }
    } else {
      const confirmJump = window.confirm(
        `⚠️ Mã hàng [${code}] chưa có trong danh sách Hợp Đồng CTY!\n\n` +
        `Bạn có muốn chuyển sang giao diện "Tạo HĐ CTY" để tạo hợp đồng trước không?`
      );

      if (confirmJump) {
        if (onNavigateToTab) {
          onNavigateToTab('PARENT');
        } else {
          alert('Vui lòng chọn Tab "1. Tạo HĐ CTY" ở menu chính để khởi tạo hợp đồng này!');
        }
      }
    }
  };

  const handleReset = () => {
    clearDraft();
    setEditingId(null);
    setSelectedProductCode('');
    setProductName('');
    setContractNo('');
    setQuantity('1');
    setNote('');
    setTransactionImage('');
    setPartnerName('');
    setSizeQuantities({});
    setAccompanyingMaterials([createAccompanyingMaterialRow()]);
    setTransDate(getTodayISO());
    setTransType('NK_KHUNG');
  };

  const handleEditItem = (item: StockTransaction) => {
    setEditingId(item.id);
    setTransType(isCompanyFrameReceipt(item)
      ? 'NK'
      : (String(item.slipNo).toUpperCase().startsWith('KS') || item.type === 'KS' || item.type === 'NK_KHUNG')
        ? 'NK_KHUNG'
        : item.type as any);
    setSlipNo(item.slipNo);
    setTransDate(item.date);
    setContractNo(item.contractNo || '');
    setSelectedProductCode(item.productCode || '');
    setProductName(item.productName || '');
    setQuantity(String(item.quantity || 1));
    setPartnerName(item.partnerName || item.partner || '');
    setNote(item.note || '');
    setTransactionImage(item.image || item.imageProof || '');
    setAccompanyingMaterials(Array.isArray(item.accompanyingMaterials) && item.accompanyingMaterials.length
      ? item.accompanyingMaterials.filter(Boolean).map((material, index) => ({
      id: `${item.id}-material-${index}`,
      materialId: material.materialId,
      materialCode: material.materialCode,
      materialName: material.materialName,
      query: `${material.materialCode} - ${material.materialName}`,
      unit: material.unit,
      quantity: String(material.quantity),
      isDropdownOpen: false
    })) : [createAccompanyingMaterialRow()]);
    setShowForm(true);

    if (item.unit?.includes('Từng Size') || item.unit?.includes('Cái')) {
      setUnitOption('CAI');
    } else if (item.unit?.includes('Cả Bộ')) {
      setUnitOption('CA_HAI');
    } else {
      setUnitOption('BO');
    }

    if (item.sizeQuantities) {
      const strMap: { [key: string]: string } = {};
      Object.keys(item.sizeQuantities).forEach(k => {
        strMap[k] = String(item.sizeQuantities![k]);
      });
      setSizeQuantities(strMap);
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSaveTransaction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductCode) {
      alert('Vui lòng chọn hoặc nhập Mã Hàng!');
      return;
    }

    let totalQtyNum = Number(quantity) || 0;
    let finalUnit = 'Cái';
    let detailParts: string[] = [];

    if (isSetProduct) {
      if (unitOption === 'BO') {
        finalUnit = 'Bộ';
      } else if (unitOption === 'CAI' || unitOption === 'CA_HAI') {
        let caiTotal = 0;
        Object.keys(sizeQuantities).forEach(s => {
          const q = Number(sizeQuantities[s]) || 0;
          if (q > 0) {
            caiTotal += q;
            detailParts.push(`${q} ${s.toLowerCase()}`);
          }
        });

        if (unitOption === 'CAI') {
          totalQtyNum = caiTotal > 0 ? caiTotal : totalQtyNum;
          finalUnit = detailParts.length > 0 ? detailParts.join(', ') : 'Cái (Từng Size)';
        } else {
          finalUnit = `Bộ (${totalQtyNum} bộ) + [${detailParts.join(', ')}]`;
        }
      }
    }

    if (totalQtyNum <= 0) {
      alert('Số lượng phải lớn hơn 0!');
      return;
    }

    const selectedMaterials = accompanyingMaterials.filter(row => row.materialId !== null);
    if (selectedMaterials.some(row => !row.quantity || Number(row.quantity) <= 0)) {
      alert('Vui lòng nhập số lượng lớn hơn 0 cho từng nguyên phụ liệu đã chọn!');
      return;
    }

    const savedAccompanyingMaterials: AccompanyingMaterial[] = selectedMaterials.map(row => {
      if (row.materialId === null) return null;
      const material = materialItems.find((item: CategoryItem) => item.id === row.materialId);
      return {
        materialId: row.materialId,
        materialCode: material?.code || row.materialCode,
        materialName: material?.name || row.materialName,
        quantity: Number(row.quantity),
        unit: row.unit
      };
    }).filter((material): material is AccompanyingMaterial => material !== null);

    const finalSlipNo = slipNo || generateSlipNo(transType, partnerName);

    const payload: StockTransaction = {
      id: editingId || createUniqueId('TRANS-'),
      type: transType,
      slipNo: finalSlipNo,
      date: transDate,
      contractNo,
      productCode: selectedProductCode,
      productName,
      quantity: totalQtyNum,
      unit: finalUnit,
      partnerName,
      partner: partnerName,
      note,
      image: transactionImage,
      imageProof: transactionImage,
      sizeQuantities: (isSetProduct && (unitOption === 'CAI' || unitOption === 'CA_HAI')) ? sizeQuantities : undefined,
      accompanyingMaterials: savedAccompanyingMaterials
    };

    if (editingId) {
      handleUpdate(payload);
    } else {
      handleAdd(payload);
    }

    alert(`✅ Đã lưu phiếu [${finalSlipNo}] vào hệ thống thành công!`);
    handleReset();
    setActiveTab(transType === 'NK_KHUNG' ? 'NK_KHUNG' : transType);
  };

  const formatDateVN = (dateStr: string) => {
    if (!dateStr) return '';
    const normalizedDate = String(dateStr);
    const parts = normalizedDate.split('T')[0].split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return normalizedDate;
  };

  const isKhungItem = (i: any) => {
    if (!i) return false;
    const slip = String(i.slipNo || '').toUpperCase();
    const type = String(i.type || '').toUpperCase();
    if (isCompanyFrameReceipt(i)) return false;
    return slip.startsWith('KS') || type === 'NK_KHUNG' || type === 'KS';
  };

  const isNKItem = (i: any) => {
    if (!i) return false;
    const slip = String(i.slipNo || '').toUpperCase();
    const type = String(i.type || '').toUpperCase();
    return (slip.startsWith('NK') || type === 'NK' || type === 'NHAP') && !isKhungItem(i);
  };

  const managedReceiptLogs = masterLogs.filter(item => isNKItem(item) || isKhungItem(item));
  const countAll = managedReceiptLogs.length;
  const countKhungSon = managedReceiptLogs.filter(isKhungItem).length;
  const countNK = managedReceiptLogs.filter(isNKItem).length;

  const filteredLogs = managedReceiptLogs.filter((item: StockTransaction) => {
    if (activeTab === 'NK_KHUNG' && !isKhungItem(item)) return false;
    if (activeTab === 'NK' && !isNKItem(item)) return false;
    if (filterDate && !String(item.date || '').includes(filterDate)) return false;

    if (filterKeyword) {
      const kw = filterKeyword.toLowerCase();
      return (
        String(item.slipNo || '').toLowerCase().includes(kw) ||
        String(item.productCode || '').toLowerCase().includes(kw) ||
        String(item.productName || '').toLowerCase().includes(kw) ||
        String(item.partnerName || item.partner || '').toLowerCase().includes(kw) ||
        String(item.contractNo || '').toLowerCase().includes(kw) ||
        (Array.isArray(item.accompanyingMaterials) ? item.accompanyingMaterials.filter(Boolean) : []).some(material =>
          `${material.materialCode} ${material.materialName}`.toLowerCase().includes(kw)
        )
      );
    }
    return true;
  });

  return (
    <div style={{ padding: '24px', backgroundColor: '#ffffff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', border: '1px solid #e2e8f0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#1e293b', margin: 0 }}>
          📦 Quản Lý Phiếu Nhập
        </h2>
        <button
          type="button"
          onClick={() => { setShowForm(!showForm); if (showForm) handleReset(); }}
          style={{ padding: '8px 16px', backgroundColor: showForm ? '#dc2626' : '#10b981', color: '#fff', fontWeight: 'bold', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '13px' }}
        >
          {showForm ? '✖ Đóng Form' : '＋ Lập Phiếu Nhập / Xuất Mới'}
        </button>
      </div>

      <datalist id="companyProductList">
        {companyProductCodes.map((code: any, idx: number) => (
          <option key={idx} value={code} />
        ))}
      </datalist>

      {/* FORM LẬP / SỬA PHIẾU */}
      {showForm && (
        <form {...formDraftProps} onSubmit={handleSaveTransaction} style={{ backgroundColor: editingId ? '#fffbe3' : '#f8fafc', padding: '20px', borderRadius: '10px', border: editingId ? '2px solid #f59e0b' : '1px solid #cbd5e1', marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 'bold', color: editingId ? '#b45309' : '#0369a1', margin: 0 }}>
              {editingId ? `✏️ Cập Nhật Phiếu [${slipNo}]` : '➕ Lập Phiếu Nhập / Xuất Kho'}
            </h3>
            {editingId && (
              <button type="button" onClick={handleReset} style={{ padding: '4px 12px', backgroundColor: '#64748b', color: '#fff', fontSize: '12px', fontWeight: 'bold', borderRadius: '4px', border: 'none', cursor: 'pointer' }}>
                ❌ Hủy Chế Độ Sửa
              </button>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '6px' }}>Loại Phiếu:</label>
              <select
                value={transType}
                onChange={e => setTransType(e.target.value as any)}
                style={{ width: '100%', padding: '9px', borderRadius: '6px', border: '2px solid #0284c7', fontWeight: 'bold', fontSize: '13px', backgroundColor: '#fff', boxSizing: 'border-box' }}
              >
                <option value="NK">📥 Nhập Khung Từ CTY (NK)</option>
                <option value="NK_KHUNG">📥 Nhập KS Từ Tổ Đan / Trả Khung Lỗi (KS)</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '6px' }}>Số Phiếu (Tự sinh):</label>
              <input
                type="text"
                readOnly
                value={slipNo}
                style={{ width: '100%', padding: '9px', borderRadius: '6px', border: '1px solid #cbd5e1', fontWeight: 'bold', color: '#0369a1', backgroundColor: '#e0f2fe', fontSize: '13px', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '6px', color: '#047857' }}>📅 Ngày Nhận Khung:</label>
              <input
                type="date"
                required
                value={transDate}
                onChange={e => setTransDate(e.target.value)}
                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #10b981', fontWeight: 'bold', fontSize: '13px', backgroundColor: '#fff', color: '#047857', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '6px' }}>Mã Hợp Đồng CTY:</label>
              <input
                type="text"
                placeholder="VD: HĐ-03-ARTEX-26"
                value={contractNo}
                onChange={e => setContractNo(e.target.value)}
                style={{ width: '100%', padding: '9px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', fontWeight: 'bold', color: '#1e40af', backgroundColor: '#fff', boxSizing: 'border-box' }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', marginBottom: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '6px', color: '#7c3aed' }}>Mặt Hàng (Từ HĐ Cty):</label>
              <input
                type="text"
                required
                list="companyProductList"
                placeholder="Gõ hoặc chọn Mã Hàng..."
                value={selectedProductCode}
                onChange={e => handleProductSelect(e.target.value)}
                style={{ width: '100%', padding: '9px', borderRadius: '6px', border: '2px solid #7c3aed', fontWeight: 'bold', color: '#7c3aed', fontSize: '13px', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '6px' }}>Tên Mặt Hàng:</label>
              <input
                type="text"
                readOnly
                value={productName}
                placeholder="Tên tự nhảy..."
                style={{ width: '100%', padding: '9px', borderRadius: '6px', border: '1px solid #cbd5e1', backgroundColor: '#e2e8f0', color: '#334155', fontSize: '13px', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '6px' }}>Cty Đối Tác / Tổ Đan:</label>
              <input
                type="text"
                placeholder="VD: Cty Artex..."
                value={partnerName}
                onChange={e => setPartnerName(e.target.value)}
                style={{ width: '100%', padding: '9px', borderRadius: '6px', border: '1px solid #cbd5e1', fontWeight: 'bold', color: '#047857', fontSize: '13px', boxSizing: 'border-box' }}
              />
            </div>

            {/* Ô HIỂN THỊ SỐ LƯỢNG HỢP ĐỒNG & SỐ LƯỢNG CÒN LẠI CHƯA NHẬN */}
            {transType === 'NK' && (
            <div style={{ backgroundColor: '#f0fdf4', padding: '8px 10px', borderRadius: '6px', border: '1px solid #bbf7d0' }}>
              <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#166534', display: 'flex', justifyContent: 'space-between' }}>
                <span>Tổng HĐ: <b>{totalContractQty}</b></span>
                <span>Đã nhận: <b>{totalReceivedQty}</b></span>
              </div>
              <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#dc2626', marginTop: '4px' }}>
                Chưa nhận: <b>{remainingQty}</b> bộ
              </div>
            </div>
            )}

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '6px' }}>
                {isSetProduct && unitOption === 'BO' ? 'Số Lượng Lần Này:' : 'Số Lượng:'}
              </label>
              <input
                type="number"
                required
                min="1"
                max={transType === 'NK' && remainingQty > 0 ? remainingQty + (editingId ? 9999 : 0) : undefined}
                value={quantity}
                onChange={e => setQuantity(e.target.value)}
                style={{ width: '100%', padding: '9px', borderRadius: '6px', border: '1px solid #cbd5e1', fontWeight: 'bold', fontSize: '14px', boxSizing: 'border-box' }}
              />
            </div>
          </div>

          <div style={{ backgroundColor: '#fff', padding: '14px', borderRadius: '8px', border: '2px solid #0f766e', marginBottom: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <strong style={{ color: '#0f766e', fontSize: '13px' }}>Nguyên Phụ Liệu Kèm Theo</strong>
                <button
                  type="button"
                  onClick={() => setAccompanyingMaterials(rows => [...rows, createAccompanyingMaterialRow()])}
                  style={{ padding: '6px 10px', border: 'none', borderRadius: '5px', backgroundColor: '#0f766e', color: '#fff', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  + Thêm dòng
                </button>
              </div>
              {accompanyingMaterials.map(row => {
                const searchTerm = row.query.trim().toLowerCase();
                const suggestions = searchTerm
                  ? materialItems.filter((material: CategoryItem) =>
                    `${material.code} ${material.name} ${material.note || ''}`.toLowerCase().includes(searchTerm)
                  )
                  : [];

                return (
                  <div key={row.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 2fr) minmax(100px, 1fr) minmax(110px, 1fr) auto', gap: '8px', alignItems: 'start', marginTop: '8px' }}>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="search"
                        autoComplete="off"
                        placeholder="Gõ mã hoặc tên nguyên vật liệu..."
                        value={row.query}
                        onFocus={() => setAccompanyingMaterials(rows => rows.map(item =>
                          item.id === row.id ? { ...item, isDropdownOpen: true } : item
                        ))}
                        onBlur={() => setAccompanyingMaterials(rows => rows.map(item =>
                          item.id === row.id ? { ...item, isDropdownOpen: false } : item
                        ))}
                        onChange={event => setAccompanyingMaterials(rows => rows.map(item =>
                          item.id === row.id
                            ? { ...item, query: event.target.value, materialId: null, materialCode: '', materialName: '', isDropdownOpen: true }
                            : item
                        ))}
                        style={{ width: '100%', padding: '8px', border: '1px solid #94a3b8', borderRadius: '5px', boxSizing: 'border-box' }}
                      />
                      {row.isDropdownOpen && searchTerm && (
                        <div role="listbox" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, maxHeight: '180px', overflowY: 'auto', backgroundColor: '#fff', border: '1px solid #94a3b8', borderRadius: '5px', boxShadow: '0 4px 12px rgba(15, 23, 42, 0.15)' }}>
                          {suggestions.length > 0 ? suggestions.map((material: CategoryItem) => (
                            <button
                              key={material.id}
                              type="button"
                              role="option"
                              onMouseDown={event => event.preventDefault()}
                              onClick={() => setAccompanyingMaterials(rows => rows.map(item =>
                                item.id === row.id
                                  ? { ...item, materialId: material.id, materialCode: material.code, materialName: material.name, query: `${material.code} - ${material.name}`, isDropdownOpen: false }
                                  : item
                              ))}
                              style={{ display: 'block', width: '100%', padding: '8px 10px', border: 0, borderBottom: '1px solid #e2e8f0', backgroundColor: '#fff', color: '#1e293b', textAlign: 'left', cursor: 'pointer' }}
                            >
                              <strong>{material.code}</strong> - {material.name}
                            </button>
                          )) : (
                            <div style={{ padding: '8px 10px', color: '#64748b', fontSize: '12px' }}>Không tìm thấy nguyên vật liệu phù hợp.</div>
                          )}
                        </div>
                      )}
                    </div>
                    <select
                      aria-label="Đơn vị tính nguyên phụ liệu"
                      value={row.unit}
                      onChange={event => setAccompanyingMaterials(rows => rows.map(item =>
                        item.id === row.id ? { ...item, unit: event.target.value as MaterialUnit } : item
                      ))}
                      style={{ width: '100%', padding: '8px', border: '1px solid #94a3b8', borderRadius: '5px', backgroundColor: '#fff' }}
                    >
                      <option value="kg">kg</option>
                      <option value="lọn">lọn</option>
                      <option value="bó">bó</option>
                      <option value="cái">cái</option>
                    </select>
                    <input
                      type="number"
                      min="0.01"
                      step="any"
                      aria-label="Số lượng nguyên phụ liệu"
                      placeholder="Số lượng"
                      value={row.quantity}
                      onChange={event => setAccompanyingMaterials(rows => rows.map(item =>
                        item.id === row.id ? { ...item, quantity: event.target.value } : item
                      ))}
                      style={{ width: '100%', padding: '8px', border: '1px solid #94a3b8', borderRadius: '5px', boxSizing: 'border-box' }}
                    />
                    <button
                      type="button"
                      aria-label="Xóa dòng nguyên phụ liệu"
                      onClick={() => setAccompanyingMaterials(rows => {
                        const remainingRows = rows.filter(item => item.id !== row.id);
                        return remainingRows.length > 0 ? remainingRows : [createAccompanyingMaterialRow()];
                      })}
                      style={{ padding: '8px 12px', border: 'none', borderRadius: '5px', backgroundColor: '#fee2e2', color: '#b91c1c', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer' }}
                    >
                      −
                    </button>
                  </div>
                );
              })}
            </div>

          {/* CẤU HÌNH ĐƠN VỊ TÍNH VÀ NHẬP LẺ THEO SIZE */}
          {isSetProduct && (
            <div style={{ backgroundColor: '#ffffff', padding: '14px', borderRadius: '8px', border: '2px solid #0284c7', marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#0369a1', marginBottom: '8px' }}>
                ⚙️ PHÂN LOẠI ĐƠN VỊ TÍNH (Mã hàng BỘ gồm {maxAllowedSizes} Cái/Size):
              </label>

              <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginBottom: '10px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer' }}>
                  <input type="radio" name="unitOpt" checked={unitOption === 'BO'} onChange={() => setUnitOption('BO')} /> 📦 Chỉ Tính Theo BỘ
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer' }}>
                  <input type="radio" name="unitOpt" checked={unitOption === 'CAI'} onChange={() => setUnitOption('CAI')} /> 🧩 Tách Theo CÁI (Từng Size)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer' }}>
                  <input type="radio" name="unitOpt" checked={unitOption === 'CA_HAI'} onChange={() => setUnitOption('CA_HAI')} /> 🔄 Cả BỘ & CÁI
                </label>
              </div>

              {(unitOption === 'CAI' || unitOption === 'CA_HAI') && (
                <div style={{ marginTop: '10px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', backgroundColor: '#f0f9ff', padding: '12px', borderRadius: '6px', border: '1px dashed #7dd3fc' }}>
                  {Array.from({ length: maxAllowedSizes }).map((_, idx) => {
                    const sName = `Cái ${idx + 1}`;
                    return (
                      <div key={idx} style={{ backgroundColor: '#fff', padding: '8px', borderRadius: '6px', border: '1px solid #bae6fd' }}>
                        <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#0284c7', display: 'block', marginBottom: '4px' }}>{sName}:</span>
                        <input
                          type="number"
                          min="0"
                          placeholder="SL cái..."
                          value={sizeQuantities[sName] || ''}
                          onChange={e => setSizeQuantities({ ...sizeQuantities, [sName]: e.target.value })}
                          style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px', fontWeight: 'bold', boxSizing: 'border-box' }}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px', marginBottom: '16px', alignItems: 'flex-end' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '6px' }}>Ghi Chú Phiếu:</label>
              <input
                type="text"
                placeholder="Nhập ghi chú chi tiết đợt giao..."
                value={note}
                onChange={e => setNote(e.target.value)}
                style={{ width: '100%', padding: '9px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '6px' }}>📷 Chứng Từ / Hình Ảnh Đính Kèm:</label>
              <ImageCaptureInput onImageCaptured={url => setTransactionImage(url)} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button type="submit" disabled={isSubmitting} style={{ padding: '10px 24px', backgroundColor: isSubmitting ? '#94a3b8' : editingId ? '#d97706' : '#0284c7', color: '#fff', fontWeight: 'bold', borderRadius: '6px', border: 'none', cursor: isSubmitting ? 'wait' : 'pointer', fontSize: '13px' }}>
              {isSubmitting ? '⏳ Đang lưu...' : editingId ? '💾 Lưu Cập Nhật Phiếu' : '💾 Lưu Phiếu Kho'}
            </button>
            <button type="button" onClick={handleReset} style={{ padding: '10px 20px', backgroundColor: '#64748b', color: '#fff', fontWeight: 'bold', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '13px' }}>
              Hủy / Làm Mới
            </button>
          </div>
        </form>
      )}

      {/* TAB BÁO CÁO & BẢNG THÔNG TIN PHIẾU KHO */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <button type="button" onClick={() => setActiveTab('ALL')} style={{ padding: '8px 14px', fontWeight: 'bold', fontSize: '13px', borderRadius: '6px', border: 'none', cursor: 'pointer', backgroundColor: activeTab === 'ALL' ? '#1e293b' : '#f1f5f9', color: activeTab === 'ALL' ? '#fff' : '#475569' }}>
              📋 Tất Cả ({countAll})
            </button>
            <button type="button" onClick={() => setActiveTab('NK_KHUNG')} style={{ padding: '8px 14px', fontWeight: 'bold', fontSize: '13px', borderRadius: '6px', border: 'none', cursor: 'pointer', backgroundColor: activeTab === 'NK_KHUNG' ? '#0284c7' : '#f1f5f9', color: activeTab === 'NK_KHUNG' ? '#fff' : '#475569' }}>
              📥 Nhập KS Từ Tổ Đan / Trả Khung Lỗi ({countKhungSon})
            </button>
            <button type="button" onClick={() => setActiveTab('NK')} style={{ padding: '8px 14px', fontWeight: 'bold', fontSize: '13px', borderRadius: '6px', border: 'none', cursor: 'pointer', backgroundColor: activeTab === 'NK' ? '#16a34a' : '#f1f5f9', color: activeTab === 'NK' ? '#fff' : '#475569' }}>
              📥 Nhập Khung Từ CTY ({countNK})
            </button>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <input
              type="month"
              value={filterDate}
              onChange={e => setFilterDate(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
            />
            <input
              type="text"
              placeholder="Lọc theo Mã hoặc Tên hàng..."
              value={filterKeyword}
              onChange={e => setFilterKeyword(e.target.value)}
              style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', width: '220px' }}
            />
          </div>
        </div>

        <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
            <thead>
              <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '2px solid #cbd5e1' }}>
                <th style={{ padding: '10px' }}>Số Phiếu</th>
                <th style={{ padding: '10px' }}>Ngày Nhận</th>
                <th style={{ padding: '10px' }}>Mã Hợp Đồng</th>
                <th style={{ padding: '10px' }}>Mã & Tên Hàng</th>
                <th style={{ padding: '10px', textAlign: 'right' }}>Số Lượng</th>
                <th style={{ padding: '10px' }}>Nguyên Phụ Liệu Kèm Theo</th>
                <th style={{ padding: '10px' }}>Đơn Vị Tính</th>
                <th style={{ padding: '10px' }}>Đối Tác / Tổ Đan</th>
                <th style={{ padding: '10px' }}>Ghi Chú</th>
                <th style={{ padding: '10px', textAlign: 'center' }}>Thao Tác</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ padding: '20px', textAlign: 'center', color: '#64748b', fontStyle: 'italic' }}>
                    Chưa có phiếu kho nào phát sinh!
                  </td>
                </tr>
              ) : (
                filteredLogs.map((item: StockTransaction) => {
                  const isKhung = isKhungItem(item);
                  const isNK = isNKItem(item);
                  return (
                    <tr key={item.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '10px', fontWeight: 'bold', color: isKhung ? '#0284c7' : isNK ? '#16a34a' : '#dc2626' }}>
                        {item.slipNo}
                      </td>
                      <td style={{ padding: '10px', fontWeight: 'bold', color: '#047857' }}>{formatDateVN(item.date)}</td>
                      <td style={{ padding: '10px', fontWeight: 'bold', color: '#1e40af' }}>{item.contractNo || '—'}</td>
                      <td style={{ padding: '10px' }}>
                        <span style={{ fontWeight: 'bold', color: '#7c3aed' }}>[{item.productCode}]</span> {item.productName}
                      </td>
                      <td style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold', color: '#b45309' }}>
                        {Number(item.quantity || 0).toLocaleString()}
                      </td>
                      <td style={{ padding: '10px', color: '#0f766e', fontSize: '12px' }}>
                        {Array.isArray(item.accompanyingMaterials) && item.accompanyingMaterials.length
                          ? item.accompanyingMaterials.filter(Boolean).map(material =>
                            `${material.materialCode ? `${material.materialCode} - ` : ''}${material.materialName} ${Number(material.quantity).toLocaleString()} ${material.unit}`
                          ).join('; ')
                          : '—'}
                      </td>
                      <td style={{ padding: '10px', fontSize: '12px', fontWeight: '600' }}>{item.unit}</td>
                      <td style={{ padding: '10px', fontWeight: 'bold', color: '#334155' }}>{item.partnerName || item.partner || '—'}</td>
                      <td style={{ padding: '10px', color: '#64748b', fontSize: '12px' }}>{item.note || '—'}</td>
                      <td style={{ padding: '10px', textAlign: 'center' }}>
                        {isNK ? (
                          <span style={{ color: '#64748b', fontSize: '12px' }}>Chỉ xem</span>
                        ) : (
                          <div className="slip-action-buttons">
                            <button
                              type="button"
                              className="slip-action-button slip-action-edit"
                              onClick={() => handleEditItem(item)}
                            >
                              ✏️ Sửa
                            </button>
                            <button
                              type="button"
                              className="slip-action-button slip-action-delete"
                              onClick={() => {
                                if (window.confirm(`Xóa phiếu [${item.slipNo}]?`)) {
                                  handleDelete(item.id);
                                }
                              }}
                            >
                              🗑️ Xóa
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};