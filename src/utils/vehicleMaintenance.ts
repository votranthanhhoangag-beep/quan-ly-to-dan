import type { MileageLog, VehicleCategoryItem } from '../context/AppContext';

export interface VehicleMaintenanceWarning {
  vehicle: VehicleCategoryItem;
  currentKm: number;
  targetKm: number;
  kmRemaining: number;
  averageKmPerDay: number;
  estimatedDaysRemaining: number | null;
}

const localDateString = (date: Date) => (
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
);

export const getVehicleMaintenanceWarnings = (
  vehicles: VehicleCategoryItem[],
  mileageLogs: MileageLog[],
  currentDate = new Date()
): VehicleMaintenanceWarning[] => {
  const today = new Date(Date.UTC(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate()));
  const recentFrom = new Date(today);
  recentFrom.setUTCDate(recentFrom.getUTCDate() - 29);
  const todayISO = localDateString(currentDate);

  return vehicles.flatMap(vehicle => {
    const interval = Number(vehicle.maintenanceIntervalKm);
    if (!Number.isFinite(interval) || interval <= 0) return [];

    const logs = mileageLogs.filter(log =>
      log.plateNo === vehicle.plateNo &&
      typeof log.date === 'string' &&
      log.date >= `${recentFrom.toISOString().slice(0, 10)}` &&
      log.date <= todayISO
    );
    const latestLogKm = mileageLogs
      .filter(log => log.plateNo === vehicle.plateNo)
      .reduce((latest, log) => Math.max(latest, Number(log.endKm) || 0), 0);
    const currentKm = Math.max(Number(vehicle.currentKm) || 0, latestLogKm);
    const targetKm = (Number(vehicle.lastOilChangeKm) || 0) + interval;
    const kmRemaining = targetKm - currentKm;
    const totalRecentKm = logs.reduce((sum, log) => sum + (Number(log.totalKmRun) || 0), 0);
    const recentDates = logs
      .map(log => log.date as string)
      .sort();
    const elapsedDays = recentDates.length
      ? Math.max(1, Math.floor((today.getTime() - Date.parse(`${recentDates[0]}T00:00:00Z`)) / 86400000) + 1)
      : 0;
    const averageKmPerDay = elapsedDays ? totalRecentKm / elapsedDays : 0;
    const estimatedDaysRemaining = averageKmPerDay > 0
      ? Math.ceil(Math.max(0, kmRemaining) / averageKmPerDay)
      : null;

    if (kmRemaining > 0 && (estimatedDaysRemaining === null || estimatedDaysRemaining > 5)) return [];
    return [{
      vehicle,
      currentKm,
      targetKm,
      kmRemaining,
      averageKmPerDay,
      estimatedDaysRemaining
    }];
  }).sort((first, second) => first.kmRemaining - second.kmRemaining);
};

export const recordVehicleMaintenance = (
  vehicle: VehicleCategoryItem,
  odometerKm: number,
  date = new Date()
): VehicleCategoryItem => {
  const history = Array.isArray(vehicle.maintenanceHistory)
    ? vehicle.maintenanceHistory.filter(record =>
      record !== null &&
      typeof record === 'object' &&
      typeof record.date === 'string' &&
      Number.isFinite(Number(record.odometerKm))
    )
    : [];
  return {
    ...vehicle,
    currentKm: odometerKm,
    lastOilChangeKm: odometerKm,
    maintenanceHistory: [
      ...history,
      {
        id: Date.now(),
        date: localDateString(date),
        odometerKm
      }
    ]
  };
};
