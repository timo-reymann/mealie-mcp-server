import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = process.cwd();

function read(rel: string): string {
  const fullPath = path.isAbsolute(rel) ? rel : path.join(ROOT, rel);
  return fs.readFileSync(fullPath, 'utf8');
}

function extractEndpoints(filePath: string): Map<string, string[]> {
  const source = read(filePath);
  const map = new Map<string, string[]>();
  const toolPattern =
    /(?:\/\/\s*@endpoints\s+(.+?)\n)\s*server\.tool\(\s*\n?\s*'([a-zA-Z_]+)'/g;

  let match;
  while ((match = toolPattern.exec(source)) !== null) {
    const endpoints = match[1]
      .split(',')
      .map((e) => e.trim())
      .filter((e) => e.length > 0);
    map.set(match[2], endpoints);
  }

  return map;
}

function extractToolNames(filePath: string): string[] {
  const source = read(filePath);
  const names: string[] = [];
  const toolRegex = /server\.tool\(\s*\n?\s*'([a-zA-Z_]+)'/g;
  let match;
  while ((match = toolRegex.exec(source)) !== null) {
    names.push(match[1]);
  }
  return names;
}

function extractToolDescriptions(filePath: string): Map<string, string> {
  const source = read(filePath);
  const result = new Map<string, string>();
  const toolRegex =
    /server\.tool\(\s*\n?\s*'([a-zA-Z_]+)'\s*,\s*\n?\s*'([^']*)'/g;
  let match;
  while ((match = toolRegex.exec(source)) !== null) {
    result.set(match[1], match[2]);
  }
  return result;
}

describe('docs generation invariants', () => {
  const toolsDir = path.join(ROOT, 'src/tools');
  const toolFiles = fs
    .readdirSync(toolsDir)
    .filter((f) => f.endsWith('.ts') && f !== 'index.ts');

  const allToolNames: string[] = [];
  const allEndpoints = new Map<string, string[]>();
  const allDescriptions = new Map<string, string>();

  for (const file of toolFiles) {
    const filePath = path.join(toolsDir, file);
    const names = extractToolNames(filePath);
    const endpoints = extractEndpoints(filePath);
    const descriptions = extractToolDescriptions(filePath);

    for (const name of names) {
      allToolNames.push(name);
      allEndpoints.set(name, endpoints.get(name) ?? []);
      allDescriptions.set(name, descriptions.get(name) ?? '');
    }
  }

  it('registers exactly 62 tools', () => {
    expect(allToolNames).toHaveLength(62);
  });

  it('every tool has at least one @endpoints', () => {
    const missing = allToolNames.filter(
      (name) => !allEndpoints.get(name) || allEndpoints.get(name)!.length === 0,
    );
    expect(missing).toEqual([]);
  });

  it('every tool has a non-empty description', () => {
    const missing = allToolNames.filter((name) => {
      const desc = allDescriptions.get(name) ?? '';
      return desc.trim().length === 0;
    });
    expect(missing).toEqual([]);
  });

  it('every tool name in README is a real registered tool', () => {
    const readme = read('README.md');
    const toolMatches = readme.match(/`[a-z][a-z_]+`/g) ?? [];
    const toolNamesInReadme = toolMatches.map((m) => m.replace(/`/g, ''));
    // Only check names that look like MCP tool names (get_/create_/update_/delete_/etc.)
    const mcpToolPattern = /^(get_|create_|update_|delete_|patch_|duplicate_|mark_|set_|find_|add_|remove_)/;
    const readmeTools = toolNamesInReadme.filter((n) => mcpToolPattern.test(n));
    for (const name of readmeTools) {
      expect(allToolNames).toContain(name);
    }
  });

  it('every registered tool appears in README', () => {
    const readme = read('README.md');
    for (const name of allToolNames) {
      expect(readme).toContain(`\`${name}\``);
    }
  });

  it('every registered tool appears in API_COVERAGE.md', () => {
    const coverage = read('API_COVERAGE.md');
    for (const name of allToolNames) {
      expect(coverage).toContain(`\`${name}\``);
    }
  });

  it('API_COVERAGE.md total matches actual tool count', () => {
    const coverage = read('API_COVERAGE.md');
    const totalMatch = coverage.match(/\|\s*\*\*Total\*\*\s*\|\s*\*\*(\d+)\s*\*\*/);
    expect(totalMatch).not.toBeNull();
    expect(Number(totalMatch![1])).toBe(allToolNames.length);
  });

  it('README tools section total matches actual tool count', () => {
    const readme = read('README.md');
    const totalMatch = readme.match(/## Available Tools \((\d+) total\)/);
    expect(totalMatch).not.toBeNull();
    expect(Number(totalMatch![1])).toBe(allToolNames.length);
  });
});
