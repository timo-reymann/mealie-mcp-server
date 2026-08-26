mealie-mcp-server
===
[![LICENSE](https://img.shields.io/github/license/timo-reymann/mealie-mcp-server)](https://github.com/timo-reymann/mealie-mcp-server/blob/main/LICENSE)
[![GitHub Actions](https://github.com/timo-reymann/mealie-mcp-server/actions/workflows/ci.yml/badge.svg)](https://github.com/timo-reymann/mealie-mcp-server/actions/workflows/ci.yml)
[![GitHub Release](https://img.shields.io/github/v/tag/timo-reymann/mealie-mcp-server?label=version)](https://github.com/timo-reymann/mealie-mcp-server/releases)
[![Renovate](https://img.shields.io/badge/renovate-enabled-green?logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNjkgMzY5Ij48Y2lyY2xlIGN4PSIxODkuOSIgY3k9IjE5MC4yIiByPSIxODQuNSIgZmlsbD0iI2ZmZTQyZSIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoLTUgLTYpIi8+PHBhdGggZmlsbD0iIzhiYjViNSIgZD0iTTI1MSAyNTZsLTM4LTM4YTE3IDE3IDAgMDEwLTI0bDU2LTU2YzItMiAyLTYgMC03bC0yMC0yMWE1IDUgMCAwMC03IDBsLTEzIDEyLTktOCAxMy0xM2ExNyAxNyAwIDAxMjQgMGwyMSAyMWM3IDcgNyAxNyAwIDI0bC01NiA1N2E1IDUgMCAwMDAgN2wzOCAzOHoiLz48cGF0aCBmaWxsPSIjZDk1NjEyIiBkPSJNMzAwIDI4OGwtOCA4Yy00IDQtMTEgNC0xNiAwbC00Ni00NmMtNS01LTUtMTIgMC0xNmw4LThjNC00IDExLTQgMTUgMGw0NyA0N2M0IDQgNCAxMSAwIDE1eiIvPjxwYXRoIGZpbGw9IiMyNGJmYmUiIGQ9Ik04MSAxODVsMTgtMTggMTggMTgtMTggMTh6Ii8+PHBhdGggZmlsbD0iIzI1YzRjMyIgZD0iTTIyMCAxMDBsMjMgMjNjNCA0IDQgMTEgMCAxNkwxNDIgMjQwYy00IDQtMTEgNC0xNSAwbC0yNC0yNGMtNC00LTQtMTEgMC0xNWwxMDEtMTAxYzUtNSAxMi01IDE2IDB6Ii8+PHBhdGggZmlsbD0iIzFkZGVkZCIgZD0iTTk5IDE2N2wxOC0xOCAxOCAxOC0xOCAxOHoiLz48cGF0aCBmaWxsPSIjMDBhZmIzIiBkPSJNMjMwIDExMGwxMyAxM2M0IDQgNCAxMSAwIDE2TDE0MiAyNDBjLTQgNC0xMSA0LTE1IDBsLTEzLTEzYzQgNCAxMSA0IDE1IDBsMTAxLTEwMWM1LTUgNS0xMSAwLTE2eiIvPjxwYXRoIGZpbGw9IiMyNGJmYmUiIGQ9Ik0xMTYgMTQ5bDE4LTE4IDE4IDE4LTE4IDE4eiIvPjxwYXRoIGZpbGw9IiMxZGRlZGQiIGQ9Ik0xMzQgMTMxbDE4LTE4IDE4IDE4LTE4IDE4eiIvPjxwYXRoIGZpbGw9IiMxYmNmY2UiIGQ9Ik0xNTIgMTEzbDE4LTE4IDE4IDE4LTE4IDE4eiIvPjxwYXRoIGZpbGw9IiMyNGJmYmUiIGQ9Ik0xNzAgOTVsMTgtMTggMTggMTgtMTggMTh6Ii8+PHBhdGggZmlsbD0iIzFiY2ZjZSIgZD0iTTYzIDE2N2wxOC0xOCAxOCAxOC0xOCAxOHpNOTggMTMxbDE4LTE4IDE4IDE4LTE4IDE4eiIvPjxwYXRoIGZpbGw9IiMzNGVkZWIiIGQ9Ik0xMzQgOTVsMTgtMTggMTggMTgtMTggMTh6Ii8+PHBhdGggZmlsbD0iIzFiY2ZjZSIgZD0iTTE1MyA3OGwxOC0xOCAxOCAxOC0xOCAxOHoiLz48cGF0aCBmaWxsPSIjMzRlZGViIiBkPSJNODAgMTEzbDE4LTE3IDE4IDE3LTE4IDE4ek0xMzUgNjBsMTgtMTggMTggMTgtMTggMTh6Ii8+PHBhdGggZmlsbD0iIzk4ZWRlYiIgZD0iTTI3IDEzMWwxOC0xOCAxOCAxOC0xOCAxOHoiLz48cGF0aCBmaWxsPSIjYjUzZTAyIiBkPSJNMjg1IDI1OGw3IDdjNCA0IDQgMTEgMCAxNWwtOCA4Yy00IDQtMTEgNC0xNiAwbC02LTdjNCA1IDExIDUgMTUgMGw4LTdjNC01IDQtMTIgMC0xNnoiLz48cGF0aCBmaWxsPSIjOThlZGViIiBkPSJNODEgNzhsMTgtMTggMTggMTgtMTggMTh6Ii8+PHBhdGggZmlsbD0iIzAwYTNhMiIgZD0iTTIzNSAxMTVsOCA4YzQgNCA0IDExIDAgMTZMMTQyIDI0MGMtNCA0LTExIDQtMTUgMGwtOS05YzUgNSAxMiA1IDE2IDBsMTAxLTEwMWM0LTQgNC0xMSAwLTE1eiIvPjxwYXRoIGZpbGw9IiMzOWQ5ZDgiIGQ9Ik0yMjggMTA4bC04LThjLTQtNS0xMS01LTE2IDBMMTAzIDIwMWMtNCA0LTQgMTEgMCAxNWw4IDhjLTQtNC00LTExIDAtMTVsMTAxLTEwMWM1LTQgMTItNCAxNiAweiIvPjxwYXRoIGZpbGw9IiNhMzM5MDQiIGQ9Ik0yOTEgMjY0bDggOGM0IDQgNCAxMSAwIDE2bC04IDdjLTQgNS0xMSA1LTE1IDBsLTktOGM1IDUgMTIgNSAxNiAwbDgtOGM0LTQgNC0xMSAwLTE1eiIvPjxwYXRoIGZpbGw9IiNlYjZlMmQiIGQ9Ik0yNjAgMjMzbC00LTRjLTYtNi0xNy02LTIzIDAtNyA3LTcgMTcgMCAyNGw0IDRjLTQtNS00LTExIDAtMTZsOC04YzQtNCAxMS00IDE1IDB6Ii8+PHBhdGggZmlsbD0iIzEzYWNiZCIgZD0iTTEzNCAyNDhjLTQgMC04LTItMTEtNWwtMjMtMjNhMTYgMTYgMCAwMTAtMjNMMjAxIDk2YTE2IDE2IDAgMDEyMiAwbDI0IDI0YzYgNiA2IDE2IDAgMjJMMTQ2IDI0M2MtMyAzLTcgNS0xMiA1em03OC0xNDdsLTQgMi0xMDEgMTAxYTYgNiAwIDAwMCA5bDIzIDIzYTYgNiAwIDAwOSAwbDEwMS0xMDFhNiA2IDAgMDAwLTlsLTI0LTIzLTQtMnoiLz48cGF0aCBmaWxsPSIjYmY0NDA0IiBkPSJNMjg0IDMwNGMtNCAwLTgtMS0xMS00bC00Ny00N2MtNi02LTYtMTYgMC0yMmw4LThjNi02IDE2LTYgMjIgMGw0NyA0NmM2IDcgNiAxNyAwIDIzbC04IDhjLTMgMy03IDQtMTEgNHptLTM5LTc2Yy0xIDAtMyAwLTQgMmwtOCA3Yy0yIDMtMiA3IDAgOWw0NyA0N2E2IDYgMCAwMDkgMGw3LThjMy0yIDMtNiAwLTlsLTQ2LTQ2Yy0yLTItMy0yLTUtMnoiLz48L3N2Zz4=)](https://renovatebot.com)

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server for [Mealie](https://github.com/mealie-recipes/mealie) recipe management. Exposes 61 tools and 1 prompt for AI assistants to search, create, and manage recipes, meal plans, shopping lists, categories, tags, foods, and units.

<p align="center">
    <img src="https://raw.githubusercontent.com/timo-reymann/mealie-mcp-server/main/.github/images/logo.png" alt="Logo" />
    <br />
    Interact with your Mealie recipe database through AI assistants via the MCP protocol.
</p>

## Features

- **Recipe Management** — Search, create, patch, duplicate, and delete recipes. Batch-fetch multiple recipes with bounded concurrency.
- **Ingredient-Based Recipe Discovery** — `find_recipes_for_ingredients` resolves human-readable ingredient names (never Mealie food UUIDs) against Mealie's food taxonomy and finds matching recipes via Mealie's Recipe Finder, falling back to normal recipe search when there's no exact food match — useful for "what can I make with X" style discovery, including ingredients Mealie doesn't know by that exact name (the calling LLM broadens the search with substitute terms; the MCP itself never guesses substitutions). See [Finding Recipes by Ingredient](./WORKFLOWS.md#finding-recipes-by-ingredient) in Workflows.
- **Recipe Categories & Tags Assignment** — Assign Categories and Tags to existing recipes with merge/replace semantics, name/slug/ID resolution, and optional auto-creation of missing values, without disturbing ingredients, instructions, nutrition, or any other recipe field. Available via `patch_recipe`, `update_recipe_taxonomy`, and `update_recipe_taxonomy_batch`. See [Assigning Categories & Tags](./WORKFLOWS.md#assigning-categories--tags) in Workflows.
- **Meal Planning** — View, create, and bulk-create meal plans. Composite tool fetches meal plans with embedded recipe details (including nutrition) using concurrent batch requests, eliminating N+1 queries.
- **Shopping Lists** — Full CRUD for lists and items, bulk operations, and recipe-to-list integration.
- **Categories & Tags** — Full CRUD for organizing recipes, including empty-category/tag detection.
- **Foods** — Full CRUD for the food taxonomy (reusable structured ingredient entities), including alias management and food-label assignment. See [Resolving or Creating a Food](./WORKFLOWS.md#resolving-or-creating-a-food) in Workflows.
- **Units** — Full CRUD for the ingredient unit vocabulary (e.g. "tablespoon", "cup", "gram"), including alias/abbreviation management and standard-quantity conversion metadata. See [Resolving or Creating a Unit](./WORKFLOWS.md#resolving-or-creating-a-unit) in Workflows.
- **Batch Food/Unit Candidate Matching** — `get_food_matches`/`get_unit_matches` resolve many already-interpreted food/unit concepts to candidate Mealie entities (including alias matches that plain `get_foods`/`get_units` search misses) in a small, bounded number of requests instead of one search per concept — read-only, and never picks a winner for the caller. See [Resolving Several Foods or Units at Once](./WORKFLOWS.md#resolving-several-foods-or-units-at-once) in Workflows.
- **Structured Ingredient Writes** — `update_recipe_ingredients` replaces a recipe's complete structured ingredient collection using already-resolved food/unit references, without disturbing any other recipe field. See [Updating Structured Recipe Ingredients](./WORKFLOWS.md#updating-structured-recipe-ingredients) in Workflows.
- **Batch & Composite Tools** — `get_recipes_batch` and `get_recipes_detailed_batch` for bounded-concurrency recipe lookup, `get_mealplan_with_recipes` for meal plans with embedded recipe data and client-side date filtering, `update_recipe_taxonomy_batch` for bounded-concurrency category/tag updates across many recipes.
- **Recipe Classification Feed** — `get_recipes_for_classification` is a compact, paginated, read-only feed purpose-built for AI-driven Category/Tag assignment. It avoids the timeouts that batch/detail tools can hit on large recipe sets by filtering with the cheap list endpoint, fetching full detail only for matches with the same bounded-concurrency fetch used above, and paginating with a stable cursor that survives concurrent taxonomy edits. See [Recipe Classification Workflow](./WORKFLOWS.md#recipe-classification-workflow) in Workflows.
- **Ingredient Parsing Work Queue** — `get_recipes_for_ingredient_parsing` is a compact, paginated, read-only feed of recipes whose ingredients may still need structured parsing. It never parses ingredient text itself — it reports each ingredient's existing structured state (a deterministic `parsingState`: `section`/`unparsed`/`partial`/`structured`) so the calling LLM can interpret free-form text, resolve foods/units separately, and write the result back with `update_recipe_ingredients`. See [Ingredient Parsing Workflow](./WORKFLOWS.md#ingredient-parsing-workflow) in Workflows.
- **Zero Runtime Dependencies Beyond the SDK** — Uses native `fetch`, no axios or httpx.

## Requirements

- [Node.js](https://nodejs.org/) >= 22
- A running [Mealie](https://github.com/mealie-recipes/mealie) instance with an API key

## Installation

### Quick start (npx)

```bash
MEALIE_BASE_URL=https://your-mealie-instance.com \
MEALIE_API_KEY=your-api-key \
npx mealie-mcp-server
```

### opencode config

Add to your `opencode.json`:

```json
{
  "mcp": {
    "mealie-mcp-server": {
      "type": "local",
      "command": ["npx", "mealie-mcp-server"],
      "enabled": true,
      "environment": {
        "MEALIE_BASE_URL": "https://your-mealie-instance.com",
        "MEALIE_API_KEY": "your-api-key"
      }
    }
  }
}
```

### Docker

Run the MCP server in a container:

```bash
docker run -d \
  --name mealie-mcp-server \
  -e MEALIE_BASE_URL=https://your-mealie-instance.com \
  -e MEALIE_API_KEY=your-api-key \
  ghcr.io/timo-reymann/mealie-mcp-server:main
```

Or with Docker Compose:

```yaml
version: '3.8'
services:
  mealie-mcp-server:
    image: ghcr.io/timo-reymann/mealie-mcp-server:main
    environment:
      MEALIE_BASE_URL: https://your-mealie-instance.com
      MEALIE_API_KEY: your-api-key
    restart: unless-stopped
```

### Local development

```bash
git clone https://github.com/timo-reymann/mealie-mcp-server.git
cd mealie-mcp-server
corepack enable
yarn install
cp .env.template .env
# Edit .env with your MEALIE_BASE_URL and MEALIE_API_KEY
yarn dev
```

Make sure `MEALIE_BASE_URL` and `MEALIE_API_KEY` are set in your environment or opencode config.

## Documentation

- [API Coverage](./API_COVERAGE.md) — every tool mapped to its underlying Mealie API endpoint(s).
- [Workflows](./WORKFLOWS.md) — usage guides and example payloads for the more involved tools: ingredient discovery, taxonomy assignment, foods, units, structured ingredient writes, and the recipe classification feed.
- [Architecture](./ARCHITECTURE.md) — internal design notes for contributors: bounded-concurrency rationale, pagination/cursor design, and known Mealie API quirks.

## Contributors

I love your input! Please read the [Contribution Guidelines](./CONTRIBUTING.md) to get started.

[![Contributors](https://contrib.rocks/image?repo=timo-reymann/mealie-mcp-server)](https://github.com/timo-reymann/mealie-mcp-server/graphs/contributors)

> Want to appear in the list of contributors?
>
> Get started by reading the [Contribution Guidelines](./CONTRIBUTING.md)

## Development

### Requirements

- [Node.js](https://nodejs.org/) >= 22
- [Yarn](https://yarnpkg.com/) (via Corepack: `corepack enable`)
- A [Mealie](https://github.com/mealie-recipes/mealie) instance for integration testing (or mock the fetch layer)

### Test

```bash
yarn test
```

### Typecheck

```bash
yarn typecheck
```

### Build

```bash
yarn build
```

### Lint

```bash
yarn lint
```

<!-- BEGIN GENERATED TOOLS -->
## Available Tools (61 total)

### Recipes (17)
`create_recipe`, `delete_recipe`, `duplicate_recipe`, `find_recipes_for_ingredients`, `get_recipe_concise`, `get_recipe_detailed`, `get_recipes`, `get_recipes_batch`, `get_recipes_detailed_batch`, `get_recipes_for_classification`, `get_recipes_for_ingredient_parsing`, `mark_recipe_last_made`, `patch_recipe`, `set_recipe_image_from_url`, `update_recipe_ingredients`, `update_recipe_taxonomy`, `update_recipe_taxonomy_batch`

### Meal Plans (5)
`create_mealplan`, `create_mealplan_bulk`, `get_all_mealplans`, `get_mealplan_with_recipes`, `get_todays_mealplan`

### Categories (7)
`create_category`, `delete_category`, `get_categories`, `get_category`, `get_category_by_slug`, `get_empty_categories`, `update_category`

### Tags (7)
`create_tag`, `delete_tag`, `get_empty_tags`, `get_tag`, `get_tag_by_slug`, `get_tags`, `update_tag`

### Shopping Lists (13)
`add_recipe_to_shopping_list`, `create_shopping_list`, `create_shopping_list_item`, `create_shopping_list_items_bulk`, `delete_shopping_list`, `delete_shopping_list_item`, `delete_shopping_list_items_bulk`, `get_shopping_list`, `get_shopping_list_items`, `get_shopping_lists`, `remove_recipe_from_shopping_list`, `update_shopping_list`, `update_shopping_list_item`

### Foods (6)
`create_food`, `delete_food`, `get_food`, `get_food_matches`, `get_foods`, `update_food`

### Units (6)
`create_unit`, `delete_unit`, `get_unit`, `get_unit_matches`, `get_units`, `update_unit`

## Prompts (1)

- `weekly-meal-plan` — Generate a balanced weekly meal plan with breakfast, lunch, and dinner for 7 days
<!-- END GENERATED TOOLS -->

## License

[MIT](./LICENSE)

