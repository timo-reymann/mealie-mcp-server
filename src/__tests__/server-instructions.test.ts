import { describe, it, expect } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { MEALIE_SERVER_INSTRUCTIONS } from '../server-instructions.js';
import { registerAllTools } from '../tools/index.js';

function buildServer(options?: { withInstructions?: boolean }): McpServer {
  const server = new McpServer(
    { name: 'mealie-mcp-server', version: '1.0.0' },
    options?.withInstructions === false ? undefined : { instructions: MEALIE_SERVER_INSTRUCTIONS },
  );
  registerAllTools(server);
  return server;
}

async function listToolNames(server: McpServer): Promise<string[]> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '1.0.0' });

  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  const { tools } = await client.listTools();
  await client.close();
  await server.close();

  return tools.map((tool) => tool.name).sort();
}

describe('MEALIE_SERVER_INSTRUCTIONS content', () => {
  it('scopes the ingredient policy to contextual triggers rather than every task', () => {
    expect(MEALIE_SERVER_INSTRUCTIONS).toContain(
      'When structuring, parsing, normalizing, or repairing recipe ingredients',
    );
  });

  it('directs the model to batch-resolve vocabulary instead of parsing via tool calls', () => {
    expect(MEALIE_SERVER_INSTRUCTIONS).toContain('get_food_matches');
    expect(MEALIE_SERVER_INSTRUCTIONS).toContain('get_unit_matches');
    expect(MEALIE_SERVER_INSTRUCTIONS).toContain('update_recipe_ingredients');
  });

  it('covers splitting multiple required foods out of one source line', () => {
    expect(MEALIE_SERVER_INSTRUCTIONS).toContain('Salt and pepper to taste');
  });

  it('covers referenceId and ingredientReferences policy for splits', () => {
    expect(MEALIE_SERVER_INSTRUCTIONS).toContain('referenceId');
    expect(MEALIE_SERVER_INSTRUCTIONS).toContain('ingredientReferences');
  });

  it('covers the partial queue-state audit caveat', () => {
    expect(MEALIE_SERVER_INSTRUCTIONS).toContain('partial');
  });

  it('does not read as an ingredient-only prompt', () => {
    expect(MEALIE_SERVER_INSTRUCTIONS).toContain('Mealie MCP Guidance');
    expect(MEALIE_SERVER_INSTRUCTIONS.indexOf('Ingredient Parsing and Structuring')).toBeGreaterThan(0);
  });

  it('does not claim every tool is incapable of any interpretation/resolution', () => {
    expect(MEALIE_SERVER_INSTRUCTIONS).not.toContain('they never interpret natural language themselves');
    expect(MEALIE_SERVER_INSTRUCTIONS).toContain('Most tools are deterministic data-management primitives rather than semantic decision-makers');
  });

  it('scopes alias-checking guidance to entity types that actually support aliases', () => {
    expect(MEALIE_SERVER_INSTRUCTIONS).toContain(
      'For entity types that support aliases — foods and units — check those aliases',
    );
  });

  it('contains no leftover Markdown anchor-link syntax', () => {
    expect(MEALIE_SERVER_INSTRUCTIONS).not.toMatch(/\]\(#/);
  });
});

describe('MEALIE_SERVER_INSTRUCTIONS General Tool-Use Principles', () => {
  it('states the model-interprets / MCP-resolves-persists-batches boundary', () => {
    expect(MEALIE_SERVER_INSTRUCTIONS).toContain(
      'the model interprets; the MCP resolves, persists, and batches',
    );
  });

  it('directs reuse of existing canonical entities over duplicates', () => {
    expect(MEALIE_SERVER_INSTRUCTIONS).toContain('Reuse canonical entities');
  });

  it('directs a preference for purpose-built batch tools', () => {
    expect(MEALIE_SERVER_INSTRUCTIONS).toContain('Prefer purpose-built batch tools');
  });

  it('warns that replacement-style writes need the complete payload', () => {
    expect(MEALIE_SERVER_INSTRUCTIONS).toContain('Replacement writes need the full payload');
  });

  it('gives the user\'s explicit request precedence over default workflow preferences', () => {
    expect(MEALIE_SERVER_INSTRUCTIONS).toContain('The user\'s explicit request wins');
  });
});

describe('MEALIE_SERVER_INSTRUCTIONS Recipe Creation and Import', () => {
  it('scopes to the contextual add/create/import/save trigger', () => {
    expect(MEALIE_SERVER_INSTRUCTIONS).toContain(
      'When the user asks to add, create, import, or save a recipe in Mealie',
    );
  });

  it('requires a complete recipe representation, not the minimum valid object', () => {
    expect(MEALIE_SERVER_INSTRUCTIONS).toContain('not merely the minimum object the API accepts');
  });

  it('forbids inventing values the source does not provide', () => {
    expect(MEALIE_SERVER_INSTRUCTIONS).toContain(
      'Never invent a value the source doesn\'t provide just to fill a field',
    );
  });

  it('delegates ingredient semantics to the Ingredient Parsing and Structuring policy instead of duplicating it', () => {
    expect(MEALIE_SERVER_INSTRUCTIONS).toContain(
      'Structure the ingredients per the Ingredient Parsing and Structuring section below',
    );
    expect(MEALIE_SERVER_INSTRUCTIONS).toContain('is the single source of truth for ingredient semantics and is not repeated here');
  });

  it('requires preserving instruction step ordering without claiming structured section/group metadata', () => {
    expect(MEALIE_SERVER_INSTRUCTIONS).toContain('Preserve step ordering, and preserve meaningful section/group boundaries within the instruction text itself where practical');
    expect(MEALIE_SERVER_INSTRUCTIONS).toContain('there\'s no structured title/group field, just ordered text');
  });

  it('prefers the source\'s explicit total time and forbids blindly summing prep + cook', () => {
    expect(MEALIE_SERVER_INSTRUCTIONS).toContain('Prefer the source\'s own explicit total time when it states one');
    expect(MEALIE_SERVER_INSTRUCTIONS).toContain('don\'t blindly sum prep + cook');
    expect(MEALIE_SERVER_INSTRUCTIONS).toContain('leave `totalTime` unset rather than guessing');
  });

  it('routes component times to prepTime/performTime and keeps nutrition source-faithful', () => {
    expect(MEALIE_SERVER_INSTRUCTIONS).toContain('a stated cook time in `performTime`');
    expect(MEALIE_SERVER_INSTRUCTIONS).toContain('Set `nutrition` only with values the source states');
  });

  it('preserves the source URL in orgURL rather than the description', () => {
    expect(MEALIE_SERVER_INSTRUCTIONS).toContain('**Preserve the source URL** in `orgURL`');
    expect(MEALIE_SERVER_INSTRUCTIONS).toContain('don\'t stuff the URL into `description`');
  });

  it('requires verification after creation/import via a get_recipe_detailed re-read', () => {
    expect(MEALIE_SERVER_INSTRUCTIONS).toContain('Verify after creating or importing');
    expect(MEALIE_SERVER_INSTRUCTIONS).toContain('re-read the recipe with `get_recipe_detailed` when practical');
  });
});

describe('MEALIE_SERVER_INSTRUCTIONS top-level section ordering', () => {
  it('orders General Tool-Use Principles, then Recipe Creation and Import, then Ingredient Parsing and Structuring', () => {
    const generalIndex = MEALIE_SERVER_INSTRUCTIONS.indexOf('## General Tool-Use Principles');
    const recipeIndex = MEALIE_SERVER_INSTRUCTIONS.indexOf('## Recipe Creation and Import');
    const ingredientIndex = MEALIE_SERVER_INSTRUCTIONS.indexOf('## Ingredient Parsing and Structuring');

    expect(generalIndex).toBeGreaterThan(0);
    expect(recipeIndex).toBeGreaterThan(generalIndex);
    expect(ingredientIndex).toBeGreaterThan(recipeIndex);
  });
});

describe('MCP initialize handshake', () => {
  it('publishes the server instructions to a connecting client', async () => {
    const server = buildServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test-client', version: '1.0.0' });

    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

    expect(client.getInstructions()).toBe(MEALIE_SERVER_INSTRUCTIONS);

    await client.close();
    await server.close();
  });

  it('does not add or remove tools as a side effect of publishing instructions', async () => {
    const namesWithInstructions = await listToolNames(buildServer({ withInstructions: true }));
    const namesWithoutInstructions = await listToolNames(buildServer({ withInstructions: false }));

    expect(namesWithInstructions).toEqual(namesWithoutInstructions);
    expect(namesWithInstructions).toContain('update_recipe_ingredients');
    expect(namesWithInstructions).toContain('get_recipes_for_ingredient_parsing');
  });
});
