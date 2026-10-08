export type MeasurementSystem = 'metric' | 'imperial';

interface MeasurementUnit {
  measurement_system: MeasurementSystem | 'universal';
}

/** Returns units available to an organization while retaining universal units. */
export function selectableUoms<T extends MeasurementUnit>(
  units: T[],
  measurementSystem: MeasurementSystem,
): T[] {
  return units.filter((unit) => unit.measurement_system === 'universal'
    || unit.measurement_system === measurementSystem);
}
