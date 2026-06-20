import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as tagsApi from '../api/tags.js';

export function registerTagTools(server: McpServer) {
  server.tool(
    'get_tags',
    { page: z.number().optional(), perPage: z.number().optional() },
    async (params) => {
      try {
        const result = await tagsApi.getTags(params);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
      } catch (error) {
        return { content: [{ type: 'text' as const, text: (error as Error).message }], isError: true };
      }
    },
  );

  server.tool(
    'get_empty_tags',
    {},
    async () => {
      try {
        const result = await tagsApi.getEmptyTags();
        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
      } catch (error) {
        return { content: [{ type: 'text' as const, text: (error as Error).message }], isError: true };
      }
    },
  );

  server.tool(
    'create_tag',
    { name: z.string() },
    async (params) => {
      try {
        const result = await tagsApi.createTag(params.name);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
      } catch (error) {
        return { content: [{ type: 'text' as const, text: (error as Error).message }], isError: true };
      }
    },
  );

  server.tool(
    'get_tag',
    { tagId: z.string() },
    async (params) => {
      try {
        const result = await tagsApi.getTag(params.tagId);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
      } catch (error) {
        return { content: [{ type: 'text' as const, text: (error as Error).message }], isError: true };
      }
    },
  );

  server.tool(
    'get_tag_by_slug',
    { tagSlug: z.string() },
    async (params) => {
      try {
        const result = await tagsApi.getTagBySlug(params.tagSlug);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
      } catch (error) {
        return { content: [{ type: 'text' as const, text: (error as Error).message }], isError: true };
      }
    },
  );

  server.tool(
    'update_tag',
    { tagId: z.string(), name: z.string().optional() },
    async (params) => {
      try {
        const data: Record<string, unknown> = {};
        if (params.name !== undefined) data.name = params.name;
        const result = await tagsApi.updateTag(params.tagId, data);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
      } catch (error) {
        return { content: [{ type: 'text' as const, text: (error as Error).message }], isError: true };
      }
    },
  );

  server.tool(
    'delete_tag',
    { tagId: z.string() },
    async (params) => {
      try {
        const result = await tagsApi.deleteTag(params.tagId);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
      } catch (error) {
        return { content: [{ type: 'text' as const, text: (error as Error).message }], isError: true };
      }
    },
  );
}
