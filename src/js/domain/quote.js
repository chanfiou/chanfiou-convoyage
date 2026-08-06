import {
  APPROACH_FREE_KILOMETERS,
  APPROACH_MAX_FEE,
  APPROACH_PRICE_PER_KM,
  DISTANCE_BRACKETS,
  EXTRA_SERVICES,
  MINIMUM_FEE,
  MINIMUM_FEE_DISTANCE,
  NIGHT_SURCHARGE,
  SCHEDULE_SURCHARGES,
  SECOND_VEHICLE_DISCOUNT,
  URGENCY_LEVELS,
  VAT_RATE,
  VEHICLE_CATEGORIES,
  VOLUME_DISCOUNTS,
} from '../config/pricing.js';

const roundToCents = (amount) => Math.round(amount * 100) / 100;

const findById = (collection, id) => collection.find((entry) => entry.id === id) ?? collection[0];

// La majoration d'urgence découle de la date de prise en charge choisie :
// départ aujourd'hui ou demain = express, surlendemain = rapide.
export const urgencyIdFromPickupDate = (pickupDay, reference = new Date()) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(pickupDay ?? '')) return 'standard';
  const start = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
  const target = new Date(`${pickupDay}T00:00:00`);
  const diffDays = Math.round((target - start) / 86400000);
  if (diffDays <= 1) return 'express';
  if (diffDays <= 2) return 'rapide';
  return 'standard';
};

export const roadBasePrice = (kilometers) => {
  if (kilometers <= MINIMUM_FEE_DISTANCE) return MINIMUM_FEE;
  let remaining = kilometers;
  let previousLimit = 0;
  let total = 0;
  DISTANCE_BRACKETS.forEach((bracket) => {
    if (remaining <= 0) return;
    const bracketWidth = Math.min(remaining, bracket.upTo - previousLimit);
    total += bracketWidth * bracket.pricePerKm;
    remaining -= bracketWidth;
    previousLimit = bracket.upTo;
  });
  return Math.max(MINIMUM_FEE, total);
};

export const approachPrice = (approachKilometers) => {
  const billable = Math.max(0, Math.round(approachKilometers) - APPROACH_FREE_KILOMETERS);
  return Math.min(APPROACH_MAX_FEE, billable * APPROACH_PRICE_PER_KM);
};

export const volumeDiscountFor = (monthlyMissions) =>
  VOLUME_DISCOUNTS.filter((tier) => monthlyMissions >= tier.minMonthlyMissions).at(-1) ?? null;

export const computeQuote = (input) => {
  const kilometers = Math.max(1, Number(input.kilometers) || 0);
  const vehicle = findById(VEHICLE_CATEGORIES, input.vehicleId);
  const urgency = findById(URGENCY_LEVELS, input.urgencyId);
  const schedule = findById(SCHEDULE_SURCHARGES, input.scheduleId);
  const vehicleCount = Math.max(1, Number(input.vehicleCount) || 1);

  const base = roadBasePrice(kilometers);

  const includeApproach = input.includeApproach !== false;
  const approachKilometers = includeApproach ? Math.max(0, Math.round(Number(input.approachKilometers) || 0)) : 0;
  const approachTotal = includeApproach ? approachPrice(approachKilometers) : 0;
  const approachBillableKilometers = includeApproach
    ? Math.max(0, approachKilometers - APPROACH_FREE_KILOMETERS)
    : 0;

  const surchargeLines = [];
  if (vehicle.surcharge > 0) {
    surchargeLines.push({
      label: vehicle.label,
      rate: vehicle.surcharge,
      amount: base * vehicle.surcharge,
    });
  }
  if (urgency.surcharge > 0) {
    surchargeLines.push({
      label: `Délai ${urgency.label.toLowerCase()}`,
      rate: urgency.surcharge,
      amount: base * urgency.surcharge,
    });
  }
  if (schedule.surcharge > 0) {
    surchargeLines.push({
      label: schedule.label,
      rate: schedule.surcharge,
      amount: base * schedule.surcharge,
    });
  }
  if (input.isNightDeparture) {
    surchargeLines.push({
      label: NIGHT_SURCHARGE.label,
      rate: NIGHT_SURCHARGE.surcharge,
      amount: base * NIGHT_SURCHARGE.surcharge,
    });
  }

  const surchargeTotal = surchargeLines.reduce((sum, line) => sum + line.amount, 0);
  const singleVehiclePrice = base + surchargeTotal;

  const additionalVehicles = vehicleCount - 1;
  const additionalVehiclesPrice =
    additionalVehicles * singleVehiclePrice * (1 - SECOND_VEHICLE_DISCOUNT);
  const additionalVehiclesDiscount =
    additionalVehicles * singleVehiclePrice * SECOND_VEHICLE_DISCOUNT;

  const selectedExtras = EXTRA_SERVICES.filter((service) =>
    (input.extraIds ?? []).includes(service.id),
  );
  const extrasTotal = selectedExtras.reduce((sum, service) => sum + service.price, 0);
  const extrasDiscountRate = selectedExtras.reduce(
    (rate, service) => rate + (service.discount ?? 0),
    0,
  );

  const subtotalBeforeDiscounts =
    singleVehiclePrice + additionalVehiclesPrice + extrasTotal + approachTotal;

  const volumeTier = volumeDiscountFor(Number(input.monthlyMissions) || 0);
  const volumeDiscountRate = volumeTier?.discount ?? 0;
  const totalDiscountRate = Math.min(0.3, volumeDiscountRate + extrasDiscountRate);
  const discountAmount = subtotalBeforeDiscounts * totalDiscountRate;

  const totalExcludingVat = Math.max(MINIMUM_FEE, subtotalBeforeDiscounts - discountAmount);
  const vatAmount = totalExcludingVat * VAT_RATE;

  return {
    kilometers,
    vehicle,
    urgency,
    schedule,
    isNightDeparture: Boolean(input.isNightDeparture),
    vehicleCount,
    includeApproach,
    approachKilometers,
    approachBillableKilometers,
    approachTotal: roundToCents(approachTotal),
    base: roundToCents(base),
    surchargeLines: surchargeLines.map((line) => ({ ...line, amount: roundToCents(line.amount) })),
    surchargeTotal: roundToCents(surchargeTotal),
    additionalVehiclesPrice: roundToCents(additionalVehiclesPrice),
    additionalVehiclesDiscount: roundToCents(additionalVehiclesDiscount),
    extras: selectedExtras,
    extrasTotal: roundToCents(extrasTotal),
    volumeTier,
    totalDiscountRate,
    discountAmount: roundToCents(discountAmount),
    totalExcludingVat: roundToCents(totalExcludingVat),
    vatAmount: roundToCents(vatAmount),
    totalIncludingVat: roundToCents(totalExcludingVat + vatAmount),
    pricePerKilometer: roundToCents(totalExcludingVat / kilometers / vehicleCount),
  };
};
