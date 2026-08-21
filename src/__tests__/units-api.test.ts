import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api/client.js', async () => {
  const actual = await vi.importActual<typeof import('../api/client.js')>('../api/client.js');
  return {
    ...actual,
    apiGet: vi.fn(),
    apiPost: vi.fn(),
    apiPut: vi.fn(),
    apiDelete: vi.fn(),
  };
});

import { apiGet, apiPost, apiPut, apiDelete, MealieApiError } from '../api/client.js';
import { getUnits, getUnit, createUnit, updateUnit, deleteUnit } from '../api/units.js';

const mockGet = vi.mocked(apiGet);
const mockPost = vi.mocked(apiPost);
const mockPut = vi.mocked(apiPut);
const mockDelete = vi.mocked(apiDelete);

function existingUnit(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'unit-1',
    name: 'Tablespoon',
    pluralName: 'Tablespoons',
    description: 'A unit of volume',
    extras: {},
    fraction: true,
    abbreviation: 'tbsp',
    pluralAbbreviation: 'tbsp',
    useAbbreviation: false,
    aliases: [{ name: 'tbs' }],
    standardQuantity: 0.5,
    standardUnit: 'fluid_ounce',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-02T00:00:00Z',
    ...overrides,
  };
}

function paginated<T>(items: T[]): { items: T[]; total: number; page: number; size: number } {
  return { items, total: items.length, page: 1, size: items.length };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getUnits', () => {
  it('calls the units endpoint with no params when none are given', async () => {
    mockGet.mockResolvedValue(paginated([]));
    await getUnits();
    expect(mockGet).toHaveBeenCalledWith('/api/units', undefined);
  });

  it('passes the search parameter through', async () => {
    mockGet.mockResolvedValue(paginated([]));
    await getUnits({ search: 'tablespoon' });
    expect(mockGet).toHaveBeenCalledWith('/api/units', { search: 'tablespoon' });
  });

  it('passes pagination parameters through', async () => {
    mockGet.mockResolvedValue(paginated([]));
    await getUnits({ page: 2, perPage: 25 });
    expect(mockGet).toHaveBeenCalledWith('/api/units', { page: '2', perPage: '25' });
  });

  it('returns the items and pagination metadata supplied by Mealie', async () => {
    const result = { items: [{ id: 'unit-1', name: 'Tablespoon' }], total: 1, page: 1, size: 1 };
    mockGet.mockResolvedValue(result);
    await expect(getUnits()).resolves.toEqual(result);
  });

  it('returns an empty result set unchanged', async () => {
    const result = paginated<Record<string, unknown>>([]);
    mockGet.mockResolvedValue(result);
    await expect(getUnits({ search: 'nonexistent-unit-xyz' })).resolves.toEqual(result);
  });

  it('preserves aliases, abbreviations, and conversion metadata on returned items', async () => {
    const unit = existingUnit();
    mockGet.mockResolvedValue(paginated([unit]));
    const result = await getUnits();
    expect(result.items[0]).toEqual(unit);
    expect(result.items[0].aliases).toEqual([{ name: 'tbs' }]);
    expect(result.items[0].abbreviation).toBe('tbsp');
    expect(result.items[0].standardQuantity).toBe(0.5);
    expect(result.items[0].standardUnit).toBe('fluid_ounce');
  });

  it('propagates API errors with added context', async () => {
    mockGet.mockRejectedValue(new MealieApiError(500, 'Internal Server Error'));
    await expect(getUnits()).rejects.toThrow(/Unable to retrieve units/);
    await expect(getUnits()).rejects.toThrow(/500/);
    await expect(getUnits()).rejects.toThrow(/Internal Server Error/);
  });
});

describe('getUnit', () => {
  it('retrieves a unit by id', async () => {
    const unit = existingUnit();
    mockGet.mockResolvedValue(unit);
    await expect(getUnit('unit-1')).resolves.toEqual(unit);
    expect(mockGet).toHaveBeenCalledWith('/api/units/unit-1');
  });

  it('rejects a missing id without calling the API', async () => {
    await expect(getUnit(undefined as unknown as string)).rejects.toThrow(/unitId is required/);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('rejects a blank id without calling the API', async () => {
    await expect(getUnit('   ')).rejects.toThrow(/unitId is required/);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('propagates a not-found error clearly', async () => {
    mockGet.mockRejectedValue(new MealieApiError(404, 'Not Found'));
    await expect(getUnit('missing-id')).rejects.toThrow(/Unit not found/);
    await expect(getUnit('missing-id')).rejects.toThrow(/404/);
  });

  it('propagates other API errors', async () => {
    mockGet.mockRejectedValue(new MealieApiError(500, 'Internal Server Error'));
    await expect(getUnit('unit-1')).rejects.toThrow(/Unable to retrieve unit/);
    await expect(getUnit('unit-1')).rejects.toThrow(/500/);
  });
});

describe('createUnit', () => {
  it('creates a unit from just a name', async () => {
    mockPost.mockResolvedValue(existingUnit({ name: 'Pinch' }));
    await createUnit({ name: 'Pinch' });
    expect(mockPost).toHaveBeenCalledWith('/api/units', { name: 'Pinch' });
  });

  it('creates a unit with all supported fields', async () => {
    mockPost.mockResolvedValue(existingUnit());
    await createUnit({
      name: 'Tablespoon',
      pluralName: 'Tablespoons',
      description: 'A unit of volume',
      abbreviation: 'tbsp',
      pluralAbbreviation: 'tbsp',
      useAbbreviation: true,
      fraction: true,
      aliases: ['tbs', 'T'],
      standardQuantity: 0.5,
      standardUnit: 'fluid_ounce',
    });
    expect(mockPost).toHaveBeenCalledWith('/api/units', {
      name: 'Tablespoon',
      pluralName: 'Tablespoons',
      description: 'A unit of volume',
      abbreviation: 'tbsp',
      pluralAbbreviation: 'tbsp',
      useAbbreviation: true,
      fraction: true,
      aliases: [{ name: 'tbs' }, { name: 'T' }],
      standardQuantity: 0.5,
      standardUnit: 'fluid_ounce',
    });
  });

  it('converts a string[] of aliases into Mealie\'s alias object shape', async () => {
    mockPost.mockResolvedValue(existingUnit());
    await createUnit({ name: 'Tablespoon', aliases: ['tbs'] });
    const [, body] = mockPost.mock.calls[0];
    expect(body).toMatchObject({ aliases: [{ name: 'tbs' }] });
  });

  it('sets abbreviation and pluralAbbreviation independently of aliases', async () => {
    mockPost.mockResolvedValue(existingUnit());
    await createUnit({ name: 'Tablespoon', abbreviation: 'tbsp', pluralAbbreviation: 'tbsp' });
    const [, body] = mockPost.mock.calls[0];
    expect(body).toMatchObject({ abbreviation: 'tbsp', pluralAbbreviation: 'tbsp' });
    expect(body).not.toHaveProperty('aliases');
  });

  it('sets fraction and useAbbreviation flags', async () => {
    mockPost.mockResolvedValue(existingUnit());
    await createUnit({ name: 'Tablespoon', fraction: false, useAbbreviation: true });
    const [, body] = mockPost.mock.calls[0];
    expect(body).toMatchObject({ fraction: false, useAbbreviation: true });
  });

  it('sets standardQuantity and standardUnit together', async () => {
    mockPost.mockResolvedValue(existingUnit());
    await createUnit({ name: 'Tablespoon', standardQuantity: 0.5, standardUnit: 'fluid_ounce' });
    const [, body] = mockPost.mock.calls[0];
    expect(body).toMatchObject({ standardQuantity: 0.5, standardUnit: 'fluid_ounce' });
  });

  it('rejects a blank name without calling the API', async () => {
    await expect(createUnit({ name: '   ' })).rejects.toThrow(/cannot be empty/);
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('rejects a missing name without calling the API', async () => {
    await expect(createUnit({ name: undefined as unknown as string })).rejects.toThrow(/cannot be empty/);
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('propagates API errors', async () => {
    mockPost.mockRejectedValue(new MealieApiError(400, 'Bad Request'));
    await expect(createUnit({ name: 'Tablespoon' })).rejects.toThrow(/Unable to create unit/);
    await expect(createUnit({ name: 'Tablespoon' })).rejects.toThrow(/400/);
  });

  it('propagates a duplicate-name conflict from Mealie', async () => {
    mockPost.mockRejectedValue(new MealieApiError(409, 'This item already exists.'));
    await expect(createUnit({ name: 'Tablespoon' })).rejects.toThrow(/Unable to create unit/);
    await expect(createUnit({ name: 'Tablespoon' })).rejects.toThrow(/409/);
  });
});

describe('updateUnit', () => {
  it('rejects an update with no fields, without calling the API', async () => {
    await expect(updateUnit('unit-1', {})).rejects.toThrow(/At least one field must be supplied/);
    expect(mockGet).not.toHaveBeenCalled();
    expect(mockPut).not.toHaveBeenCalled();
  });

  it('rejects a missing id without calling the API', async () => {
    await expect(updateUnit(undefined as unknown as string, { name: 'Tablespoon' })).rejects.toThrow(
      /unitId is required/,
    );
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('fetches the existing record and merges the requested rename, preserving everything else', async () => {
    mockGet.mockResolvedValue(existingUnit());
    mockPut.mockResolvedValue(existingUnit({ name: 'Tbsp' }));

    await updateUnit('unit-1', { name: 'Tbsp' });

    expect(mockGet).toHaveBeenCalledWith('/api/units/unit-1');
    expect(mockPut).toHaveBeenCalledWith('/api/units/unit-1', {
      id: 'unit-1',
      name: 'Tbsp',
      pluralName: 'Tablespoons',
      description: 'A unit of volume',
      extras: {},
      fraction: true,
      abbreviation: 'tbsp',
      pluralAbbreviation: 'tbsp',
      useAbbreviation: false,
      aliases: [{ name: 'tbs' }],
      standardQuantity: 0.5,
      standardUnit: 'fluid_ounce',
    });
  });

  it('updates pluralName while preserving other fields', async () => {
    mockGet.mockResolvedValue(existingUnit());
    mockPut.mockResolvedValue(existingUnit());
    await updateUnit('unit-1', { pluralName: 'Tbsps' });
    const [, body] = mockPut.mock.calls[0];
    expect(body).toMatchObject({ pluralName: 'Tbsps', name: 'Tablespoon' });
  });

  it('updates description while preserving other fields', async () => {
    mockGet.mockResolvedValue(existingUnit());
    mockPut.mockResolvedValue(existingUnit());
    await updateUnit('unit-1', { description: 'Updated description' });
    const [, body] = mockPut.mock.calls[0];
    expect(body).toMatchObject({ description: 'Updated description', name: 'Tablespoon' });
  });

  it('updates abbreviation while preserving pluralAbbreviation', async () => {
    mockGet.mockResolvedValue(existingUnit());
    mockPut.mockResolvedValue(existingUnit());
    await updateUnit('unit-1', { abbreviation: 'T' });
    const [, body] = mockPut.mock.calls[0];
    expect(body).toMatchObject({ abbreviation: 'T', pluralAbbreviation: 'tbsp' });
  });

  it('updates pluralAbbreviation while preserving abbreviation', async () => {
    mockGet.mockResolvedValue(existingUnit());
    mockPut.mockResolvedValue(existingUnit());
    await updateUnit('unit-1', { pluralAbbreviation: 'Ts' });
    const [, body] = mockPut.mock.calls[0];
    expect(body).toMatchObject({ pluralAbbreviation: 'Ts', abbreviation: 'tbsp' });
  });

  it('preserves existing aliases when aliases is omitted', async () => {
    mockGet.mockResolvedValue(existingUnit());
    mockPut.mockResolvedValue(existingUnit());
    await updateUnit('unit-1', { description: 'New description' });
    const [, body] = mockPut.mock.calls[0];
    expect(body).toMatchObject({ aliases: [{ name: 'tbs' }] });
  });

  it('replaces the alias collection when aliases is provided', async () => {
    mockGet.mockResolvedValue(existingUnit());
    mockPut.mockResolvedValue(existingUnit());
    await updateUnit('unit-1', { aliases: ['T', 'tbs.'] });
    const [, body] = mockPut.mock.calls[0];
    expect(body).toMatchObject({ aliases: [{ name: 'T' }, { name: 'tbs.' }] });
  });

  it('clears aliases when an empty array is provided', async () => {
    mockGet.mockResolvedValue(existingUnit());
    mockPut.mockResolvedValue(existingUnit());
    await updateUnit('unit-1', { aliases: [] });
    const [, body] = mockPut.mock.calls[0];
    expect(body).toMatchObject({ aliases: [] });
  });

  it('updates fraction while preserving useAbbreviation', async () => {
    mockGet.mockResolvedValue(existingUnit());
    mockPut.mockResolvedValue(existingUnit());
    await updateUnit('unit-1', { fraction: false });
    const [, body] = mockPut.mock.calls[0];
    expect(body).toMatchObject({ fraction: false, useAbbreviation: false });
  });

  it('updates useAbbreviation while preserving fraction', async () => {
    mockGet.mockResolvedValue(existingUnit());
    mockPut.mockResolvedValue(existingUnit());
    await updateUnit('unit-1', { useAbbreviation: true });
    const [, body] = mockPut.mock.calls[0];
    expect(body).toMatchObject({ useAbbreviation: true, fraction: true });
  });

  it('updates standardQuantity and standardUnit together', async () => {
    mockGet.mockResolvedValue(existingUnit());
    mockPut.mockResolvedValue(existingUnit());
    await updateUnit('unit-1', { standardQuantity: 1, standardUnit: 'cup' });
    const [, body] = mockPut.mock.calls[0];
    expect(body).toMatchObject({ standardQuantity: 1, standardUnit: 'cup' });
  });

  it('clears standardQuantity/standardUnit when both are explicitly null', async () => {
    mockGet.mockResolvedValue(existingUnit());
    mockPut.mockResolvedValue(existingUnit({ standardQuantity: null, standardUnit: null }));
    await updateUnit('unit-1', { standardQuantity: null, standardUnit: null });
    const [, body] = mockPut.mock.calls[0];
    expect(body).toMatchObject({ standardQuantity: null, standardUnit: null });
  });

  it('preserves the existing id while stripping response-only fields (createdAt, updatedAt)', async () => {
    mockGet.mockResolvedValue(existingUnit());
    mockPut.mockResolvedValue(existingUnit());
    await updateUnit('unit-1', { description: 'New description' });
    const [, body] = mockPut.mock.calls[0] as [string, Record<string, unknown>];
    expect(body.id).toBe('unit-1');
    expect(body).not.toHaveProperty('createdAt');
    expect(body).not.toHaveProperty('updatedAt');
  });

  it('updates several fields together in a single PUT', async () => {
    mockGet.mockResolvedValue(existingUnit());
    mockPut.mockResolvedValue(existingUnit());

    await updateUnit('unit-1', { name: 'Tbsp', description: 'New description', useAbbreviation: true });

    expect(mockPut).toHaveBeenCalledTimes(1);
    const [, body] = mockPut.mock.calls[0];
    expect(body).toMatchObject({
      name: 'Tbsp',
      description: 'New description',
      useAbbreviation: true,
      pluralName: 'Tablespoons',
      aliases: [{ name: 'tbs' }],
    });
  });

  it('propagates an error fetching the existing record', async () => {
    mockGet.mockRejectedValue(new MealieApiError(404, 'Not Found'));
    await expect(updateUnit('missing-id', { name: 'Tablespoon' })).rejects.toThrow(/Unit not found/);
    expect(mockPut).not.toHaveBeenCalled();
  });

  it('propagates an error from the PUT call', async () => {
    mockGet.mockResolvedValue(existingUnit());
    mockPut.mockRejectedValue(new MealieApiError(400, 'Bad Request'));
    await expect(updateUnit('unit-1', { name: 'Tablespoon' })).rejects.toThrow(/Unable to update unit/);
    await expect(updateUnit('unit-1', { name: 'Tablespoon' })).rejects.toThrow(/400/);
  });
});

describe('deleteUnit', () => {
  it('deletes a unit by id', async () => {
    mockDelete.mockResolvedValue({ id: 'unit-1' });
    await expect(deleteUnit('unit-1')).resolves.toEqual({ id: 'unit-1' });
    expect(mockDelete).toHaveBeenCalledWith('/api/units/unit-1');
  });

  it('rejects a missing id without calling the API', async () => {
    await expect(deleteUnit(undefined as unknown as string)).rejects.toThrow(/unitId is required/);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('rejects a blank id without calling the API', async () => {
    await expect(deleteUnit('  ')).rejects.toThrow(/unitId is required/);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('propagates a not-found error clearly', async () => {
    mockDelete.mockRejectedValue(new MealieApiError(404, 'Not Found'));
    await expect(deleteUnit('missing-id')).rejects.toThrow(/Unit not found/);
    await expect(deleteUnit('missing-id')).rejects.toThrow(/404/);
  });

  it('returns a clear error when Mealie refuses to delete a referenced unit', async () => {
    mockDelete.mockRejectedValue(
      new MealieApiError(400, 'update or delete on table "ingredient_units" violates foreign key constraint'),
    );
    await expect(deleteUnit('unit-1')).rejects.toThrow(/still referenced/);
    await expect(deleteUnit('unit-1')).rejects.toThrow(/foreign key constraint/);
  });

  it('propagates other API errors', async () => {
    mockDelete.mockRejectedValue(new MealieApiError(500, 'Internal Server Error'));
    await expect(deleteUnit('unit-1')).rejects.toThrow(/Unable to delete unit/);
    await expect(deleteUnit('unit-1')).rejects.toThrow(/500/);
  });
});

describe('unit CRUD lifecycle', () => {
  it('creates, lists, retrieves, updates, re-verifies, and deletes a unit end-to-end', async () => {
    const testUnitName = '__mcp_test_unit__pinch_of_saffron';

    // 1. create
    const created = existingUnit({
      id: 'lifecycle-unit-1',
      name: testUnitName,
      pluralName: undefined,
      aliases: [],
      standardQuantity: null,
      standardUnit: null,
    });
    mockPost.mockResolvedValueOnce(created);
    const createResult = await createUnit({ name: testUnitName, abbreviation: 'pos' });
    expect(createResult).toEqual(created);
    expect(mockPost).toHaveBeenCalledWith('/api/units', { name: testUnitName, abbreviation: 'pos' });

    // 2. list/search
    mockGet.mockResolvedValueOnce(paginated([created]));
    const listResult = await getUnits({ search: testUnitName });
    expect(listResult.items).toEqual([created]);

    // 3. get
    mockGet.mockResolvedValueOnce(created);
    const getResult = await getUnit('lifecycle-unit-1');
    expect(getResult).toEqual(created);

    // 4. update
    mockGet.mockResolvedValueOnce(created);
    const updated = { ...created, aliases: [{ name: 'saffron pinch' }] };
    mockPut.mockResolvedValueOnce(updated);
    const updateResult = await updateUnit('lifecycle-unit-1', { aliases: ['saffron pinch'] });
    expect(updateResult).toEqual(updated);
    expect(mockPut).toHaveBeenCalledWith(
      '/api/units/lifecycle-unit-1',
      expect.objectContaining({ id: 'lifecycle-unit-1', name: testUnitName, aliases: [{ name: 'saffron pinch' }] }),
    );

    // 5. get/verify
    mockGet.mockResolvedValueOnce(updated);
    const verifyResult = await getUnit('lifecycle-unit-1');
    expect(verifyResult).toEqual(updated);

    // 6. delete
    mockDelete.mockResolvedValueOnce({ id: 'lifecycle-unit-1' });
    const deleteResult = await deleteUnit('lifecycle-unit-1');
    expect(deleteResult).toEqual({ id: 'lifecycle-unit-1' });
    expect(mockDelete).toHaveBeenCalledWith('/api/units/lifecycle-unit-1');

    // 7. verify missing
    mockGet.mockRejectedValueOnce(new MealieApiError(404, 'Not Found'));
    await expect(getUnit('lifecycle-unit-1')).rejects.toThrow(/Unit not found/);
  });
});
