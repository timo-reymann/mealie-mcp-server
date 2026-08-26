# CLAUDE.md

Project conventions for AI coding assistants working on mealie-mcp-server.

## Tool Registration

Every tool registered via `server.tool()` in `src/tools/*.ts` **must** have:

1. A `// @endpoints` comment on the line(s) directly above the `server.tool(` call listing every Mealie API endpoint the tool hits, using `METHOD /path` format:
   ```ts
   // @endpoints GET /api/recipes/{slug}, PATCH /api/recipes/{slug}
   server.tool(
     'update_recipe_ingredients',
     'Description of the tool.',
     { ... },
     async (...) => { ... },
   );
   ```

2. A description string as the second argument to `server.tool()`.

These are enforced by:
- **Pre-commit hook**: regenerates README and API_COVERAGE.md, commits them automatically.
- **CI**: `yarn gen:docs:check` fails if any tool lacks `@endpoints` or description.
- **Test**: `src/__tests__/docs-generation.test.ts` asserts all 61 tools have both.

## Adding a New Tool

1. Add the tool to `src/tools/<category>.ts` with a `// @endpoints` comment and description.
2. Run `yarn gen:docs` to regenerate docs.
3. The pre-commit hook handles restaging — just commit normally.

## Endpoint Mapping Rules

- Simple tools: list the endpoint(s) the handler calls directly.
- Composite tools (e.g. `find_recipes_for_ingredients`): list every endpoint reachable from the handler, including calls through `src/lib/*.ts` helpers.
- `GET` with queryFilter (e.g. `get_food_matches`): note it as `GET /api/foods (with queryFilter)`.
- Multiple endpoints: comma-separated, e.g. `GET /api/recipes/{slug}, PATCH /api/recipes/{slug}`.

## Scripts

- `yarn gen:docs` — regenerate README tool list + API_COVERAGE.md from source.
- `yarn gen:docs:check` — fail if stale (used in CI).

## Testing

- `yarn test` — runs vitest. Tests in `src/__tests__/`.
- `yarn lint` — ESLint.
- `yarn typecheck` — TypeScript strict check.
