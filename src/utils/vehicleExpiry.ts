import type { VehicleCategoryItem } from '../context/AppContext';

export interface VehicleExpiryWarning {
  vehicle: VehicleCategoryItem;
  expiryDate: string;
  daysRemaining: number;
}

export interface VehicleExpiryWarnings {
  insurance: VehicleExpiryWarning[];
  registration: VehicleExpiryWarning[];
}

const parseDate = (value: string | undefined) => {
  if (!value) return null;
  const isoDate = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const localDate = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const year = isoDate ? Number(isoDate[1]) : localDate ? Number(localDate[3]) : NaN;
  const month = isoDate ? Number(isoDate[2]) : localDate ? Number(localDate[2]) : NaN;
  const day = isoDate ? Number(isoDate[3]) : localDate ? Number(localDate[1]) : NaN;
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
};

export const formatVehicleExpiryDate = (value: string | undefined) => {
  if (!value) return '';
  const date = parseDate(value);
  if (!date) return value;
  return `${String(date.getUTCDate()).padStart(2, '0')}/${String(date.getUTCMonth() + 1).padStart(2, '0')}/${date.getUTCFullYear()}`;
};

const getWarningsForField = (
  vehicles: VehicleCategoryItem[],
  field: 'insuranceExpiry' | 'registrationExpiry',
  today: Date
): VehicleExpiryWarning[] => vehicles
  .flatMap(vehicle => {
    const expiry = parseDate(vehicle[field]);
    if (!expiry) return [];
    const daysRemaining = Math.round((expiry.getTime() - today.getTime()) / 86400000);
    if (daysRemaining > 5) return [];
    return [{
      vehicle,
      expiryDate: formatVehicleExpiryDate(vehicle[field]),
      daysRemaining
    }];
  })
  .sort((first, second) => first.daysRemaining - second.daysRemaining);

export const getVehicleExpiryWarnings = (
  vehicles: VehicleCategoryItem[],
  currentDate = new Date()
): VehicleExpiryWarnings => {
  const today = new Date(Date.UTC(
    currentDate.getFullYear(),
    currentDate.getMonth(),
    currentDate.getDate()
  ));
  return {
    insurance: getWarningsForField(vehicles, 'insuranceExpiry', today),
    registration: getWarningsForField(vehicles, 'registrationExpiry', today)
  };
};
