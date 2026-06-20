#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { registerAllTools } from './tools/index.js';

const server = new McpServer({
  name: 'mealie-mcp-server',
  version: '1.0.0',
});

registerAllTools(server);

server.registerPrompt(
  'weekly-meal-plan',
  {
    description: 'Generate a balanced weekly meal plan with breakfast, lunch, and dinner for 7 days',
    argsSchema: {
      preferences: z.string().optional().describe('Dietary preferences or constraints'),
    },
  },
  ({ preferences }) => ({
    messages: [
      {
        role: 'assistant',
        content: {
          type: 'text',
          text: [
            '<context>',
            'You have access to a Mealie recipe database. You can search for recipes and create meal plans.',
            '',
            '## Tool Usage Guidelines',
            '',
            '### Recipe Tools',
            '- get_recipes: Search and list recipes (always set per_page=50)',
            '- get_recipe_concise: Get basic recipe details (use by default)',
            '- get_recipe_detailed: Get full recipe information (only if asked)',
            '- get_recipes_batch: Fetch multiple recipes at once by slug',
            '',
            '### Meal Plan Tools',
            '- get_all_mealplans: View existing meal plans',
            '- get_mealplan_with_recipes: View meal plans with embedded recipe details',
            '- create_mealplan_bulk: Add multiple recipes to a meal plan at once',
            '- get_todays_mealplan: View today\'s planned meals',
            '</context>',
            '',
            '<instructions>',
            '# Meal Planning Guidelines',
            '- Include breakfast, lunch, and dinner for all 7 days',
            '- Create variety using different proteins, grains, and vegetables',
            '- Consider seasonal ingredients and balance nutrition',
            '- Use recipes from the Mealie database when available',
            '- Plan for leftovers where appropriate',
            '',
            '# User Interaction',
            '- Present the meal plan in table format',
            '- Ask for feedback about meal swaps and dietary needs',
            '- Before saving to Mealie, display the complete meal plan for confirmation',
            '</instructions>',
          ].join('\n'),
        },
      },
      {
        role: 'user',
        content: {
          type: 'text',
          text: `I need help creating a balanced meal plan for the next week that includes breakfast, lunch, and dinner.${preferences ? ` My preferences are: ${preferences}` : ''}`,
        },
      },
    ],
  }),
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
