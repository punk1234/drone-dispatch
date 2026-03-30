import {
  RegisterDroneSchema,
  LoadDroneSchema,
  CreateMedicationSchema,
  UpdateDroneStateSchema,
} from '../src/validations';
import { DroneModel, DroneState } from '../src/types';

// ── RegisterDroneSchema ───────────────────────────────────────────────────

describe('RegisterDroneSchema', () => {
  const valid = {
    serialNumber: 'DRN-TEST-001',
    model: DroneModel.Heavyweight,
    weightLimit: 500,
    batteryCapacity: 90,
  };

  it('accepts a valid drone payload', () => {
    const result = RegisterDroneSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('defaults state to IDLE when not provided', () => {
    const result = RegisterDroneSchema.safeParse(valid);
    expect(result.success && result.data.state).toBe(DroneState.IDLE);
  });

  it('accepts all valid drone models', () => {
    for (const model of Object.values(DroneModel)) {
      const result = RegisterDroneSchema.safeParse({ ...valid, model });
      expect(result.success).toBe(true);
    }
  });

  it('rejects an invalid model value', () => {
    const result = RegisterDroneSchema.safeParse({ ...valid, model: 'Ultralight' });
    expect(result.success).toBe(false);
  });

  it('rejects a serial number longer than 100 characters', () => {
    const result = RegisterDroneSchema.safeParse({ ...valid, serialNumber: 'A'.repeat(101) });
    expect(result.success).toBe(false);
  });

  it('rejects an empty serial number', () => {
    const result = RegisterDroneSchema.safeParse({ ...valid, serialNumber: '' });
    expect(result.success).toBe(false);
  });

  it('rejects weight limit above 500gr', () => {
    const result = RegisterDroneSchema.safeParse({ ...valid, weightLimit: 501 });
    expect(result.success).toBe(false);
  });

  it('accepts weight limit of exactly 500gr', () => {
    const result = RegisterDroneSchema.safeParse({ ...valid, weightLimit: 500 });
    expect(result.success).toBe(true);
  });

  it('rejects negative weight limit', () => {
    const result = RegisterDroneSchema.safeParse({ ...valid, weightLimit: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects battery capacity above 100', () => {
    const result = RegisterDroneSchema.safeParse({ ...valid, batteryCapacity: 101 });
    expect(result.success).toBe(false);
  });

  it('accepts battery capacity of exactly 100', () => {
    const result = RegisterDroneSchema.safeParse({ ...valid, batteryCapacity: 100 });
    expect(result.success).toBe(true);
  });

  it('accepts battery capacity of 0', () => {
    const result = RegisterDroneSchema.safeParse({ ...valid, batteryCapacity: 0 });
    expect(result.success).toBe(true);
  });

  it('rejects negative battery capacity', () => {
    const result = RegisterDroneSchema.safeParse({ ...valid, batteryCapacity: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer battery capacity', () => {
    const result = RegisterDroneSchema.safeParse({ ...valid, batteryCapacity: 90.5 });
    expect(result.success).toBe(false);
  });

  it('rejects missing required fields', () => {
    const result = RegisterDroneSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

// ── LoadDroneSchema ───────────────────────────────────────────────────────

describe('LoadDroneSchema', () => {
  it('accepts a valid array of medication codes', () => {
    const result = LoadDroneSchema.safeParse({ medicationCodes: ['AMX_500'] });
    expect(result.success).toBe(true);
  });

  it('accepts multiple valid codes', () => {
    const result = LoadDroneSchema.safeParse({ medicationCodes: ['AMX_500', 'PCM_250'] });
    expect(result.success).toBe(true);
  });

  it('rejects an empty medicationCodes array', () => {
    const result = LoadDroneSchema.safeParse({ medicationCodes: [] });
    expect(result.success).toBe(false);
  });

  it('rejects codes with lowercase letters', () => {
    const result = LoadDroneSchema.safeParse({ medicationCodes: ['amx_500'] });
    expect(result.success).toBe(false);
  });

  it('rejects when medicationCodes is missing entirely', () => {
    const result = LoadDroneSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects when medicationCodes is not an array', () => {
    const result = LoadDroneSchema.safeParse({ medicationCodes: 'AMX_500' });
    expect(result.success).toBe(false);
  });
});

// ── CreateMedicationSchema ────────────────────────────────────────────────

describe('CreateMedicationSchema', () => {
  const valid = {
    name: 'Amoxicillin_500mg',
    weight: 50,
    code: 'AMX_500',
  };

  it('accepts a valid medication payload', () => {
    const result = CreateMedicationSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('accepts names with letters, numbers, hyphens, and underscores', () => {
    for (const name of ['Drug-A', 'Drug_B', 'Drug123', 'a-b_c']) {
      const result = CreateMedicationSchema.safeParse({ ...valid, name });
      expect(result.success).toBe(true);
    }
  });

  it('rejects names with special characters', () => {
    for (const name of ['Drug@500', 'Drug 500', 'Drug.500', 'Drug#1']) {
      const result = CreateMedicationSchema.safeParse({ ...valid, name });
      expect(result.success).toBe(false);
    }
  });

  it('rejects an empty name', () => {
    const result = CreateMedicationSchema.safeParse({ ...valid, name: '' });
    expect(result.success).toBe(false);
  });

  it('accepts codes with uppercase letters, underscores, and numbers', () => {
    for (const code of ['AMX500', 'AMX_500', 'CODE_123', 'A1B2C3']) {
      const result = CreateMedicationSchema.safeParse({ ...valid, code });
      expect(result.success).toBe(true);
    }
  });

  it('rejects codes with lowercase letters', () => {
    const result = CreateMedicationSchema.safeParse({ ...valid, code: 'amx_500' });
    expect(result.success).toBe(false);
  });

  it('rejects codes with hyphens', () => {
    const result = CreateMedicationSchema.safeParse({ ...valid, code: 'AMX-500' });
    expect(result.success).toBe(false);
  });

  it('rejects codes with spaces', () => {
    const result = CreateMedicationSchema.safeParse({ ...valid, code: 'AMX 500' });
    expect(result.success).toBe(false);
  });

  it('rejects an empty code', () => {
    const result = CreateMedicationSchema.safeParse({ ...valid, code: '' });
    expect(result.success).toBe(false);
  });

  it('rejects zero weight', () => {
    const result = CreateMedicationSchema.safeParse({ ...valid, weight: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects negative weight', () => {
    const result = CreateMedicationSchema.safeParse({ ...valid, weight: -10 });
    expect(result.success).toBe(false);
  });

  it('accepts fractional weight values', () => {
    const result = CreateMedicationSchema.safeParse({ ...valid, weight: 12.5 });
    expect(result.success).toBe(true);
  });

  it('rejects missing fields', () => {
    const result = CreateMedicationSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

// ── UpdateDroneStateSchema ────────────────────────────────────────────────

describe('UpdateDroneStateSchema', () => {
  it('accepts all valid drone states', () => {
    for (const state of Object.values(DroneState)) {
      const result = UpdateDroneStateSchema.safeParse({ state });
      expect(result.success).toBe(true);
    }
  });

  it('rejects an invalid state value', () => {
    const result = UpdateDroneStateSchema.safeParse({ state: 'FLYING' });
    expect(result.success).toBe(false);
  });

  it('rejects missing state field', () => {
    const result = UpdateDroneStateSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects lowercase state values', () => {
    const result = UpdateDroneStateSchema.safeParse({ state: 'idle' });
    expect(result.success).toBe(false);
  });
});
