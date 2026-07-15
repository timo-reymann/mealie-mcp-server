mealie-mcp-server
===
[![LICENSE](https://img.shields.io/github/license/timo-reymann/mealie-mcp-server)](https://github.com/timo-reymann/mealie-mcp-server/blob/main/LICENSE)
[![GitHub Actions](https://github.com/timo-reymann/mealie-mcp-server/actions/workflows/ci.yml/badge.svg)](https://github.com/timo-reymann/mealie-mcp-server/actions/workflows/ci.yml)
[![GitHub Release](https://img.shields.io/github/v/tag/timo-reymann/mealie-mcp-server?label=version)](https://github.com/timo-reymann/mealie-mcp-server/releases)
[![Renovate](https://img.shields.io/badge/renovate-enabled-green?logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNjkgMzY5Ij48Y2lyY2xlIGN4PSIxODkuOSIgY3k9IjE5MC4yIiByPSIxODQuNSIgZmlsbD0iI2ZmZTQyZSIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoLTUgLTYpIi8+PHBhdGggZmlsbD0iIzhiYjViNSIgZD0iTTI1MSAyNTZsLTM4LTM4YTE3IDE3IDAgMDEwLTI0bDU2LTU2YzItMiAyLTYgMC03bC0yMC0yMWE1IDUgMCAwMC03IDBsLTEzIDEyLTktOCAxMy0xM2ExNyAxNyAwIDAxMjQgMGwyMSAyMWM3IDcgNyAxNyAwIDI0bC01NiA1N2E1IDUgMCAwMDAgN2wzOCAzOHoiLz48cGF0aCBmaWxsPSIjZDk1NjEyIiBkPSJNMzAwIDI4OGwtOCA4Yy00IDQtMTEgNC0xNiAwbC00Ni00NmMtNS01LTUtMTIgMC0xNmw4LThjNC00IDExLTQgMTUgMGw0NyA0N2M0IDQgNCAxMSAwIDE1eiIvPjxwYXRoIGZpbGw9IiMyNGJmYmUiIGQ9Ik04MSAxODVsMTgtMTggMTggMTgtMTggMTh6Ii8+PHBhdGggZmlsbD0iIzI1YzRjMyIgZD0iTTIyMCAxMDBsMjMgMjNjNCA0IDQgMTEgMCAxNkwxNDIgMjQwYy00IDQtMTEgNC0xNSAwbC0yNC0yNGMtNC00LTQtMTEgMC0xNWwxMDEtMTAxYzUtNSAxMi01IDE2IDB6Ii8+PHBhdGggZmlsbD0iIzFkZGVkZCIgZD0iTTk5IDE2N2wxOC0xOCAxOCAxOC0xOCAxOHoiLz48cGF0aCBmaWxsPSIjMDBhZmIzIiBkPSJNMjMwIDExMGwxMyAxM2M0IDQgNCAxMSAwIDE2TDE0MiAyNDBjLTQgNC0xMSA0LTE1IDBsLTEzLTEzYzQgNCAxMSA0IDE1IDBsMTAxLTEwMWM1LTUgNS0xMSAwLTE2eiIvPjxwYXRoIGZpbGw9IiMyNGJmYmUiIGQ9Ik0xMTYgMTQ5bDE4LTE4IDE4IDE4LTE4IDE4eiIvPjxwYXRoIGZpbGw9IiMxZGRlZGQiIGQ9Ik0xMzQgMTMxbDE4LTE4IDE4IDE4LTE4IDE4eiIvPjxwYXRoIGZpbGw9IiMxYmNmY2UiIGQ9Ik0xNTIgMTEzbDE4LTE4IDE4IDE4LTE4IDE4eiIvPjxwYXRoIGZpbGw9IiMyNGJmYmUiIGQ9Ik0xNzAgOTVsMTgtMTggMTggMTgtMTggMTh6Ii8+PHBhdGggZmlsbD0iIzFiY2ZjZSIgZD0iTTYzIDE2N2wxOC0xOCAxOCAxOC0xOCAxOHpNOTggMTMxbDE4LTE4IDE4IDE4LTE4IDE4eiIvPjxwYXRoIGZpbGw9IiMzNGVkZWIiIGQ9Ik0xMzQgOTVsMTgtMTggMTggMTgtMTggMTh6Ii8+PHBhdGggZmlsbD0iIzFiY2ZjZSIgZD0iTTE1MyA3OGwxOC0xOCAxOCAxOC0xOCAxOHoiLz48cGF0aCBmaWxsPSIjMzRlZGViIiBkPSJNODAgMTEzbDE4LTE3IDE4IDE3LTE4IDE4ek0xMzUgNjBsMTgtMTggMTggMTgtMTggMTh6Ii8+PHBhdGggZmlsbD0iIzk4ZWRlYiIgZD0iTTI3IDEzMWwxOC0xOCAxOCAxOC0xOCAxOHoiLz48cGF0aCBmaWxsPSIjYjUzZTAyIiBkPSJNMjg1IDI1OGw3IDdjNCA0IDQgMTEgMCAxNWwtOCA4Yy00IDQtMTEgNC0xNiAwbC02LTdjNCA1IDExIDUgMTUgMGw4LTdjNC01IDQtMTIgMC0xNnoiLz48cGF0aCBmaWxsPSIjOThlZGViIiBkPSJNODEgNzhsMTgtMTggMTggMTgtMTggMTh6Ii8+PHBhdGggZmlsbD0iIzAwYTNhMiIgZD0iTTIzNSAxMTVsOCA4YzQgNCA0IDExIDAgMTZMMTQyIDI0MGMtNCA0LTExIDQtMTUgMGwtOS05YzUgNSAxMiA1IDE2IDBsMTAxLTEwMWM0LTQgNC0xMSAwLTE1eiIvPjxwYXRoIGZpbGw9IiMzOWQ5ZDgiIGQ9Ik0yMjggMTA4bC04LThjLTQtNS0xMS01LTE2IDBMMTAzIDIwMWMtNCA0LTQgMTEgMCAxNWw4IDhjLTQtNC00LTExIDAtMTVsMTAxLTEwMWM1LTQgMTItNCAxNiAweiIvPjxwYXRoIGZpbGw9IiNhMzM5MDQiIGQ9Ik0yOTEgMjY0bDggOGM0IDQgNCAxMSAwIDE2bC04IDdjLTQgNS0xMSA1LTE1IDBsLTktOGM1IDUgMTIgNSAxNiAwbDgtOGM0LTQgNC0xMSAwLTE1eiIvPjxwYXRoIGZpbGw9IiNlYjZlMmQiIGQ9Ik0yNjAgMjMzbC00LTRjLTYtNi0xNy02LTIzIDAtNyA3LTcgMTcgMCAyNGw0IDRjLTQtNS00LTExIDAtMTZsOC04YzQtNCAxMS00IDE1IDB6Ii8+PHBhdGggZmlsbD0iIzEzYWNiZCIgZD0iTTEzNCAyNDhjLTQgMC04LTItMTEtNWwtMjMtMjNhMTYgMTYgMCAwMTAtMjNMMjAxIDk2YTE2IDE2IDAgMDEyMiAwbDI0IDI0YzYgNiA2IDE2IDAgMjJMMTQ2IDI0M2MtMyAzLTcgNS0xMiA1em03OC0xNDdsLTQgMi0xMDEgMTAxYTYgNiAwIDAwMCA5bDIzIDIzYTYgNiAwIDAwOSAwbDEwMS0xMDFhNiA2IDAgMDAwLTlsLTI0LTIzLTQtMnoiLz48cGF0aCBmaWxsPSIjYmY0NDA0IiBkPSJNMjg0IDMwNGMtNCAwLTgtMS0xMS00bC00Ny00N2MtNi02LTYtMTYgMC0yMmw4LThjNi02IDE2LTYgMjIgMGw0NyA0NmM2IDcgNiAxNyAwIDIzbC04IDhjLTMgMy03IDQtMTEgNHptLTM5LTc2Yy0xIDAtMyAwLTQgMmwtOCA3Yy0yIDMtMiA3IDAgOWw0NyA0N2E2IDYgMCAwMDkgMGw3LThjMy0yIDMtNiAwLTlsLTQ2LTQ2Yy0yLTItMy0yLTUtMnoiLz48L3N2Zz4=)](https://renovatebot.com)

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server for [Mealie](https://github.com/mealie-recipes/mealie) recipe management. Exposes 43 tools and 1 prompt for AI assistants to search, create, and manage recipes, meal plans, shopping lists, categories, and tags.

<p align="center">
    <img src="https://raw.githubusercontent.com/timo-reymann/mealie-mcp-server/main/.github/images/logo.png" alt="Logo" />
    <br />
    Interact with your Mealie recipe database through AI assistants via the MCP protocol.
</p>

## Features

- **Recipe Management** — Search, create, patch, duplicate, and delete recipes. Batch-fetch multiple recipes concurrently.
- **Meal Planning** — View, create, and bulk-create meal plans. Composite tool fetches meal plans with embedded recipe details (including nutrition) using concurrent batch requests, eliminating N+1 queries.
- **Shopping Lists** — Full CRUD for lists and items, bulk operations, and recipe-to-list integration.
- **Categories & Tags** — Full CRUD for organizing recipes, including empty-category/tag detection.
- **Batch & Composite Tools** — `get_recipes_batch` and `get_recipes_detailed_batch` for concurrent recipe lookup, `get_mealplan_with_recipes` for meal plans with embedded recipe data and client-side date filtering.
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
  ghcr.io/timo-reymann/mealie-mcp-server:latest
```

Or with Docker Compose:

```yaml
version: '3.8'
services:
  mealie-mcp-server:
    image: ghcr.io/timo-reymann/mealie-mcp-server:latest
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

See [API Coverage](./API_COVERAGE.md) for a detailed breakdown of all 42 tools and their corresponding Mealie API endpoints.

## Contributing

I love your input! Please read the [Contribution Guidelines](./CONTRIBUTING.md) to get started.

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

## Available Tools (43 total)

### Recipes (11)
`get_recipes`, `get_recipe_detailed`, `get_recipe_concise`, `get_recipes_batch`, `get_recipes_detailed_batch`, `create_recipe`, `patch_recipe`, `duplicate_recipe`, `mark_recipe_last_made`, `set_recipe_image_from_url`, `delete_recipe`

### Meal Plans (5)
`get_all_mealplans`, `get_mealplan_with_recipes`, `create_mealplan`, `create_mealplan_bulk`, `get_todays_mealplan`

### Categories (7)
`get_categories`, `get_empty_categories`, `create_category`, `get_category`, `get_category_by_slug`, `update_category`, `delete_category`

### Tags (7)
`get_tags`, `get_empty_tags`, `create_tag`, `get_tag`, `get_tag_by_slug`, `update_tag`, `delete_tag`

### Shopping Lists (13)
`get_shopping_lists`, `create_shopping_list`, `get_shopping_list`, `update_shopping_list`, `delete_shopping_list`, `add_recipe_to_shopping_list`, `remove_recipe_from_shopping_list`, `get_shopping_list_items`, `create_shopping_list_item`, `create_shopping_list_items_bulk`, `update_shopping_list_item`, `delete_shopping_list_item`, `delete_shopping_list_items_bulk`

## License

[MIT](./LICENSE)
