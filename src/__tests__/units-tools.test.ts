import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

vi.mock('../api/units.js', () => ({
  getUnits: vi.fn(),
  getUnit: vi.fn(),
  createUnit: vi.fn(),
  updateUnit: vi.fn(),
  deleteUnit: vi.fn(),
}));

import * as unitsApi from '../api/units.js';
import { registerUnitTools } from '../tools/units.js';

type ToolHandler = (args: Record<string, unknown>) => Promise<{
  content: { type: 'text'; text: string }[];
  isError?: boolean;
}>;

function createMockServer(): { server: McpServer; calls: Map<string, unknown[]> } {
  const calls = new Map<string, unknown[]>();
  const server = {
    tool: (name: string, ...rest: unknown[]) => {
      calls.set(name, rest);
      return {};
    },
  };
  return { server: server as unknown as McpServer, calls };
}

function handlerFor(calls: Map<string, unknown[]>, name: string): ToolHandler {
  const rest = calls.get(name);
  if (!rest) throw new Error(`tool not registered: ${name}`);
  return rest[rest.length - 1] as ToolHandler;
}

function schemaFor(calls: Map<string, unknown[]>, name: string): Record<string, unknown> {
  const rest = calls.get(name);
  if (!rest) throw new Error(`tool not registered: ${name}`);
  return rest[rest.length - 2] as Record<string, unknown>;
}

const mockGetUnits = vi.mocked(unitsApi.getUnits);
const mockGetUnit = vi.mocked(unitsApi.getUnit);
const mockCreateUnit = vi.mocked(unitsApi.createUnit);
const mockUpdateUnit = vi.mocked(unitsApi.updateUnit);
const mockDeleteUnit = vi.mocked(unitsApi.deleteUnit);

let calls: Map<string, unknown[]>;

beforeEach(() => {
  vi.clearAllMocks();
  const mocked = createMockServer();
  registerUnitTools(mocked.server);
  calls = mocked.calls;
});

describe('registration', () => {
  it('registers all five unit tools', () => {
    expect(calls.has('get_units')).toBe(true);
    expect(calls.has('get_unit')).toBe(true);
    expect(calls.has('create_unit')).toBe(true);
    expect(calls.has('update_unit')).toBe(true);
    expect(calls.has('delete_unit')).toBe(true);
  });

  it('uses the intended public parameter names for each tool', () => {
    expect(Object.keys(schemaFor(calls, 'get_units')).sort()).toEqual(['page', 'perPage', 'search'].sort());
    expect(Object.keys(schemaFor(calls, 'get_unit'))).toEqual(['unitId']);
    expect(Object.keys(schemaFor(calls, 'create_unit')).sort()).toEqual(
      [
        'name',
        'pluralName',
        'description',
        'abbreviation',
        'pluralAbbreviation',
        'useAbbreviation',
        'fraction',
        'aliases',
        'standardQuantity',
        'standardUnit',
      ].sort(),
    );
    expect(Object.keys(schemaFor(calls, 'update_unit')).sort()).toEqual(
      [
        'unitId',
        'name',
        'pluralName',
        'description',
        'abbreviation',
        'pluralAbbreviation',
        'useAbbreviation',
        'fraction',
        'aliases',
        'standardQuantity',
        'standardUnit',
      ].sort(),
    );
    expect(Object.keys(schemaFor(calls, 'delete_unit'))).toEqual(['unitId']);
  });
});

describe('get_units tool', () => {
  it('passes params through and returns the result', async () => {
    const result = { items: [{ id: 'unit-1', name: 'Tablespoon' }], total: 1, page: 1, size: 1 };
    mockGetUnits.mockResolvedValue(result);

    const handler = handlerFor(calls, 'get_units');
    const response = await handler({ search: 'tablespoon', page: 1, perPage: 10 });

    expect(mockGetUnits).toHaveBeenCalledWith({ search: 'tablespoon', page: 1, perPage: 10 });
    expect(response.isError).toBeUndefined();
    expect(JSON.parse(response.content[0].text)).toEqual(result);
  });

  it('returns an empty result set without error', async () => {
    const result = { items: [], total: 0, page: 1, size: 0 };
    mockGetUnits.mockResolvedValue(result);
    const handler = handlerFor(calls, 'get_units');
    const response = await handler({ search: 'nonexistent-unit-xyz' });
    expect(response.isError).toBeUndefined();
    expect(JSON.parse(response.content[0].text)).toEqual(result);
  });

  it('surfaces API errors as an error response', async () => {
    mockGetUnits.mockRejectedValue(new Error('Unable to retrieve units: Mealie API error 500: boom'));
    const handler = handlerFor(calls, 'get_units');
    const response = await handler({});
    expect(response.isError).toBe(true);
    expect(response.content[0].text).toMatch(/Unable to retrieve units/);
  });
});

describe('get_unit tool', () => {
  it('returns the unit on success', async () => {
    const unit = { id: 'unit-1', name: 'Tablespoon' };
    mockGetUnit.mockResolvedValue(unit);

    const handler = handlerFor(calls, 'get_unit');
    const response = await handler({ unitId: 'unit-1' });

    expect(mockGetUnit).toHaveBeenCalledWith('unit-1');
    expect(response.isError).toBeUndefined();
    expect(JSON.parse(response.content[0].text)).toEqual(unit);
  });

  it('surfaces a not-found error', async () => {
    mockGetUnit.mockRejectedValue(new Error('Unit not found: missing-id: Mealie API error 404: Not Found'));
    const handler = handlerFor(calls, 'get_unit');
    const response = await handler({ unitId: 'missing-id' });
    expect(response.isError).toBe(true);
    expect(response.content[0].text).toMatch(/Unit not found/);
  });
});

describe('create_unit tool', () => {
  it('creates a unit with the given fields', async () => {
    const created = { id: 'unit-2', name: 'Pinch' };
    mockCreateUnit.mockResolvedValue(created);

    const handler = handlerFor(calls, 'create_unit');
    const response = await handler({ name: 'Pinch', aliases: ['dash'] });

    expect(mockCreateUnit).toHaveBeenCalledWith({ name: 'Pinch', aliases: ['dash'] });
    expect(response.isError).toBeUndefined();
    expect(JSON.parse(response.content[0].text)).toEqual(created);
  });

  it('creates a fully populated unit', async () => {
    const created = { id: 'unit-3', name: 'Tablespoon' };
    mockCreateUnit.mockResolvedValue(created);

    const handler = handlerFor(calls, 'create_unit');
    const args = {
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
    };
    const response = await handler(args);

    expect(mockCreateUnit).toHaveBeenCalledWith(args);
    expect(response.isError).toBeUndefined();
  });

  it('surfaces a blank-name validation error', async () => {
    mockCreateUnit.mockRejectedValue(new Error('Unit name cannot be empty.'));
    const handler = handlerFor(calls, 'create_unit');
    const response = await handler({ name: '   ' });
    expect(response.isError).toBe(true);
    expect(response.content[0].text).toMatch(/cannot be empty/);
  });

  it('surfaces API errors', async () => {
    mockCreateUnit.mockRejectedValue(new Error('Unable to create unit: Mealie API error 400: Bad Request'));
    const handler = handlerFor(calls, 'create_unit');
    const response = await handler({ name: 'Tablespoon' });
    expect(response.isError).toBe(true);
    expect(response.content[0].text).toMatch(/Unable to create unit/);
  });

  it('surfaces a duplicate-name conflict', async () => {
    mockCreateUnit.mockRejectedValue(new Error('Unable to create unit: Mealie API error 409: This item already exists.'));
    const handler = handlerFor(calls, 'create_unit');
    const response = await handler({ name: 'Tablespoon' });
    expect(response.isError).toBe(true);
    expect(response.content[0].text).toMatch(/409/);
  });
});

describe('update_unit tool', () => {
  it('forwards unitId separately from the update fields', async () => {
    const updated = { id: 'unit-1', name: 'Tbsp' };
    mockUpdateUnit.mockResolvedValue(updated);

    const handler = handlerFor(calls, 'update_unit');
    const response = await handler({ unitId: 'unit-1', name: 'Tbsp', standardQuantity: null, standardUnit: null });

    expect(mockUpdateUnit).toHaveBeenCalledWith('unit-1', { name: 'Tbsp', standardQuantity: null, standardUnit: null });
    expect(response.isError).toBeUndefined();
    expect(JSON.parse(response.content[0].text)).toEqual(updated);
  });

  it('surfaces a no-fields validation error', async () => {
    mockUpdateUnit.mockRejectedValue(new Error('At least one field must be supplied for an update.'));
    const handler = handlerFor(calls, 'update_unit');
    const response = await handler({ unitId: 'unit-1' });
    expect(response.isError).toBe(true);
    expect(response.content[0].text).toMatch(/At least one field must be supplied/);
  });

  it('surfaces API errors', async () => {
    mockUpdateUnit.mockRejectedValue(new Error('Unable to update unit unit-1: Mealie API error 400: Bad Request'));
    const handler = handlerFor(calls, 'update_unit');
    const response = await handler({ unitId: 'unit-1', name: 'Tablespoon' });
    expect(response.isError).toBe(true);
    expect(response.content[0].text).toMatch(/Unable to update unit/);
  });

  it('surfaces a not-found error', async () => {
    mockUpdateUnit.mockRejectedValue(new Error('Unit not found: missing-id: Mealie API error 404: Not Found'));
    const handler = handlerFor(calls, 'update_unit');
    const response = await handler({ unitId: 'missing-id', name: 'Tablespoon' });
    expect(response.isError).toBe(true);
    expect(response.content[0].text).toMatch(/Unit not found/);
  });
});

describe('delete_unit tool', () => {
  it('deletes a unit and returns a concise success result', async () => {
    mockDeleteUnit.mockResolvedValue({ id: 'unit-1' });

    const handler = handlerFor(calls, 'delete_unit');
    const response = await handler({ unitId: 'unit-1' });

    expect(mockDeleteUnit).toHaveBeenCalledWith('unit-1');
    expect(response.isError).toBeUndefined();
    expect(JSON.parse(response.content[0].text)).toEqual({ id: 'unit-1' });
  });

  it('surfaces a not-found error', async () => {
    mockDeleteUnit.mockRejectedValue(new Error('Unit not found: missing-id: Mealie API error 404: Not Found'));
    const handler = handlerFor(calls, 'delete_unit');
    const response = await handler({ unitId: 'missing-id' });
    expect(response.isError).toBe(true);
    expect(response.content[0].text).toMatch(/Unit not found/);
  });

  it('surfaces a referenced-unit conflict error', async () => {
    mockDeleteUnit.mockRejectedValue(new Error('Unable to delete unit unit-1. ... still referenced ...'));
    const handler = handlerFor(calls, 'delete_unit');
    const response = await handler({ unitId: 'unit-1' });
    expect(response.isError).toBe(true);
    expect(response.content[0].text).toMatch(/still referenced/);
  });

  it('surfaces general API errors', async () => {
    mockDeleteUnit.mockRejectedValue(new Error('Unable to delete unit unit-1: Mealie API error 500: boom'));
    const handler = handlerFor(calls, 'delete_unit');
    const response = await handler({ unitId: 'unit-1' });
    expect(response.isError).toBe(true);
    expect(response.content[0].text).toMatch(/Unable to delete unit/);
  });
});
