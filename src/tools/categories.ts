import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as categoriesApi from '../api/categories.js';

export function registerCategoryTools(server: McpServer): void {
  server.tool(
    'get_categories',
    { page: z.number().optional(), perPage: z.number().optional() },
    async (params) => {
      try {
        const result = await categoriesApi.getCategories(params);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
      } catch (error) {
        return { content: [{ type: 'text' as const, text: (error as Error).message }], isError: true };
      }
    },
  );

  server.tool(
    'get_empty_categories',
    {},
    async () => {
      try {
        const result = await categoriesApi.getEmptyCategories();
        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
      } catch (error) {
        return { content: [{ type: 'text' as const, text: (error as Error).message }], isError: true };
      }
    },
  );

  server.tool(
    'create_category',
    { name: z.string() },
    async (params) => {
      try {
        const result = await categoriesApi.createCategory(params.name);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
      } catch (error) {
        return { content: [{ type: 'text' as const, text: (error as Error).message }], isError: true };
      }
    },
  );

  server.tool(
    'get_category',
    { categoryId: z.string() },
    async (params) => {
      try {
        const result = await categoriesApi.getCategory(params.categoryId);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
      } catch (error) {
        return { content: [{ type: 'text' as const, text: (error as Error).message }], isError: true };
      }
    },
  );

  server.tool(
    'get_category_by_slug',
    { categorySlug: z.string() },
    async (params) => {
      try {
        const result = await categoriesApi.getCategoryBySlug(params.categorySlug);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
      } catch (error) {
        return { content: [{ type: 'text' as const, text: (error as Error).message }], isError: true };
      }
    },
  );

  server.tool(
    'update_category',
    { categoryId: z.string(), name: z.string().optional() },
    async (params) => {
      try {
        const data: Record<string, unknown> = {};
        if (params.name !== undefined) data.name = params.name;
        const result = await categoriesApi.updateCategory(params.categoryId, data);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
      } catch (error) {
        return { content: [{ type: 'text' as const, text: (error as Error).message }], isError: true };
      }
    },
  );

  server.tool(
    'delete_category',
    { categoryId: z.string() },
    async (params) => {
      try {
        const result = await categoriesApi.deleteCategory(params.categoryId);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
      } catch (error) {
        return { content: [{ type: 'text' as const, text: (error as Error).message }], isError: true };
      }
    },
  );
}
