import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerRecipeTools } from './recipes.js';
import { registerMealplanTools } from './mealplans.js';
import { registerCategoryTools } from './categories.js';
import { registerTagTools } from './tags.js';
import { registerShoppingListTools } from './shopping-lists.js';

export function registerAllTools(server: McpServer): void {
  registerRecipeTools(server);
  registerMealplanTools(server);
  registerCategoryTools(server);
  registerTagTools(server);
  registerShoppingListTools(server);
}
