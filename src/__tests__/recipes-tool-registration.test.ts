import { describe, it, expect, vi } from 'vitest';
import { registerRecipeTools } from '../tools/recipes.js';

const EXISTING_RECIPE_TOOLS = [
  'get_recipes',
  'find_recipes_for_ingredients',
  'get_recipe_detailed',
  'get_recipe_concise',
  'get_recipes_batch',
  'get_recipes_detailed_batch',
  'create_recipe',
  'patch_recipe',
  'update_recipe_ingredients',
  'update_recipe_taxonomy',
  'update_recipe_taxonomy_batch',
  'duplicate_recipe',
  'mark_recipe_last_made',
  'set_recipe_image_from_url',
  'delete_recipe',
];

describe('registerRecipeTools backward compatibility', () => {
  it('still registers every pre-existing recipe tool alongside the new classification tool', () => {
    const registeredNames: string[] = [];
    const stubServer = {
      tool: vi.fn((name: string) => {
        registeredNames.push(name);
        return undefined;
      }),
    };

    registerRecipeTools(stubServer as never);

    for (const name of EXISTING_RECIPE_TOOLS) {
      expect(registeredNames).toContain(name);
    }
    expect(registeredNames).toContain('get_recipes_for_classification');
    expect(registeredNames).toContain('get_recipes_for_ingredient_parsing');
  });

  it('registers get_recipes_for_classification as read-only and non-destructive', () => {
    const tool = vi.fn<(name: string, ...rest: unknown[]) => undefined>();
    const stubServer = { tool };

    registerRecipeTools(stubServer as never);

    const call = tool.mock.calls.find(([name]) => name === 'get_recipes_for_classification');
    expect(call).toBeDefined();
    const annotations = call!.find((arg): arg is Record<string, unknown> => {
      return typeof arg === 'object' && arg !== null && 'readOnlyHint' in arg;
    });

    expect(annotations).toEqual({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    });
  });

  it('registers get_recipes_for_ingredient_parsing as read-only and non-destructive', () => {
    const tool = vi.fn<(name: string, ...rest: unknown[]) => undefined>();
    const stubServer = { tool };

    registerRecipeTools(stubServer as never);

    const call = tool.mock.calls.find(([name]) => name === 'get_recipes_for_ingredient_parsing');
    expect(call).toBeDefined();
    const annotations = call!.find((arg): arg is Record<string, unknown> => {
      return typeof arg === 'object' && arg !== null && 'readOnlyHint' in arg;
    });

    expect(annotations).toEqual({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    });
  });
});
