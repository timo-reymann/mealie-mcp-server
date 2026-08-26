#!/usr/bin/env node
/**
 * Auto-generates README tool list and API_COVERAGE.md from source code.
 * Run with: yarn gen:docs
 * Check mode: yarn gen:docs:check (exits non-zero if files would change)
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ── helpers ──────────────────────────────────────────────────────────────────

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');

function read(rel) {
  const fullPath = path.isAbsolute(rel) ? rel : path.join(ROOT, rel);
  return fs.readFileSync(fullPath, 'utf8');
}

function writeRel(rel, content) {
  const fullPath = path.isAbsolute(rel) ? rel : path.join(ROOT, rel);
  fs.writeFileSync(fullPath, content + '\n', 'utf8');
}

function log(msg) {
  process.stderr.write(`${msg}\n`);
}

// ── endpoint extraction from @endpoints comments ─────────────────────────────

function extractEndpoints(filePath) {
  const source = read(filePath);
  const map = new Map();

  // Find all server.tool( calls and their preceding @endpoints comments
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

// ── param extraction from source ────────────────────────────────────────────

function extractParamInfo(filePath) {
  const source = read(filePath);
  const result = new Map();

  const toolSections = source.split(/server\.tool\(/g).slice(1);

  for (const section of toolSections) {
    const nameMatch = section.match(/^\s*'([a-zA-Z_]+)'/);
    if (!nameMatch) continue;
    const toolName = nameMatch[1];

    let rest = section.slice(nameMatch[0].length);

    const descSkip = rest.match(/^\s*,\s*'[^']*'/);
    if (descSkip) {
      rest = rest.slice(descSkip[0].length);
    }

    const shapeMatch = rest.match(/^\s*,\s*(\{[\s\S]*?\})\s*,/);
    if (!shapeMatch) continue;

    const shapeStr = shapeMatch[1];
    const paramNames = [];
    const propPattern = /(\w+)\s*:\s*z\./g;
    let propMatch;
    while ((propMatch = propPattern.exec(shapeStr)) !== null) {
      if (!paramNames.includes(propMatch[1])) {
        paramNames.push(propMatch[1]);
      }
    }

    const varRefPattern = /(\w+)\s*:\s*(\w+Schema|\w+ParamSchema)/g;
    let varMatch;
    while ((varMatch = varRefPattern.exec(shapeStr)) !== null) {
      if (!paramNames.includes(varMatch[1])) {
        paramNames.push(varMatch[1]);
      }
    }

    if (paramNames.length > 0) {
      result.set(toolName, paramNames);
    }
  }

  return result;
}

// ── category definitions ────────────────────────────────────────────────────

const CATEGORY_ORDER = [
  'Recipes',
  'Meal Plans',
  'Categories',
  'Tags',
  'Shopping Lists',
  'Foods',
  'Units',
];

const FILE_TO_CATEGORY = {
  'recipes.ts': 'Recipes',
  'mealplans.ts': 'Meal Plans',
  'categories.ts': 'Categories',
  'tags.ts': 'Tags',
  'shopping-lists.ts': 'Shopping Lists',
  'foods.ts': 'Foods',
  'units.ts': 'Units',
};

// ── collect tools from source ───────────────────────────────────────────────

function collectTools() {
  const toolsDir = path.join(ROOT, 'src/tools');
  const toolFiles = fs.readdirSync(toolsDir).filter((f) => f.endsWith('.ts') && f !== 'index.ts');
  const tools = [];

  for (const file of toolFiles) {
    const filePath = path.join(toolsDir, file);
    const category = FILE_TO_CATEGORY[file] ?? file.replace('.ts', '');
    const endpoints = extractEndpoints(filePath);
    const paramInfo = extractParamInfo(filePath);

    const source = read(filePath);
    const toolRegex =
      /server\.tool\(\s*\n?\s*'([a-zA-Z_]+)'(?:\s*,\s*\n?\s*'([^']*)')?/g;

    let match;
    while ((match = toolRegex.exec(source)) !== null) {
      const toolName = match[1];
      const description = match[2] ?? '';

      const toolEndpoints = endpoints.get(toolName) ?? [];
      if (toolEndpoints.length === 0) {
        log(`ERROR: ${toolName} has no @endpoints — add a // @endpoints comment above its server.tool() call`);
        process.exit(1);
      }

      const paramNames = paramInfo.get(toolName) ?? [];
      const params = paramNames.map((name) => ({ name, description: '' }));

      tools.push({
        name: toolName,
        description,
        endpoints: toolEndpoints,
        params,
        category,
      });
    }
  }

  tools.sort((a, b) => a.name.localeCompare(b.name));

  const indexSource = read('src/index.ts');
  const prompts = [];
  const promptMatch = indexSource.match(/registerPrompt\(\s*'([^']+)'/);
  if (promptMatch) {
    const descMatch = indexSource.match(/description:\s*'([^']+)'/);
    prompts.push({
      name: promptMatch[1],
      description: descMatch?.[1] ?? '',
    });
  }

  return { tools, prompts };
}

// ── group by category ──────────────────────────────────────────────────────

function groupByCategory(tools) {
  const grouped = new Map();
  for (const cat of CATEGORY_ORDER) {
    grouped.set(cat, []);
  }
  for (const tool of tools) {
    const list = grouped.get(tool.category) ?? [];
    list.push(tool);
    grouped.set(tool.category, list);
  }
  return grouped;
}

// ── generate README section ────────────────────────────────────────────────

function generateReadmeToolsSection(tools, prompts) {
  const lines = [];
  const grouped = groupByCategory(tools);

  lines.push(`## Available Tools (${tools.length} total)`);
  lines.push('');

  for (const cat of CATEGORY_ORDER) {
    const catTools = grouped.get(cat) ?? [];
    if (catTools.length === 0) continue;
    lines.push(`### ${cat} (${catTools.length})`);
    lines.push(catTools.map((t) => `\`${t.name}\``).join(', '));
    lines.push('');
  }

  if (prompts.length > 0) {
    lines.push(`## Prompts (${prompts.length})`);
    lines.push('');
    for (const p of prompts) {
      lines.push(`- \`${p.name}\` — ${p.description}`);
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

// ── generate API_COVERAGE.md ────────────────────────────────────────────────

function generateApiCoverage(tools) {
  const lines = [];
  const grouped = groupByCategory(tools);

  lines.push('# API Coverage');
  lines.push('');
  lines.push('| Category | Tools |');
  lines.push('|---|---|');
  let total = 0;
  for (const cat of CATEGORY_ORDER) {
    const count = (grouped.get(cat) ?? []).length;
    total += count;
    lines.push(`| ${cat} | ${count} |`);
  }
  lines.push(`| **Total** | **${total}** |`);
  lines.push('');

  for (const cat of CATEGORY_ORDER) {
    const catTools = grouped.get(cat) ?? [];
    if (catTools.length === 0) continue;
    lines.push(`## ${cat} Operations (${catTools.length})`);
    lines.push('');
    for (const tool of catTools) {
      const endpoints = tool.endpoints.join(', ');
      lines.push(`- \`${tool.name}\` — ${endpoints}`);
      if (tool.description) {
        lines.push(`  ${tool.description}`);
      }
      if (tool.params.length > 0) {
        lines.push(`  Params: ${tool.params.map((p) => `\`${p.name}\``).join(', ')}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n').trimEnd();
}

// ── file writing ───────────────────────────────────────────────────────────

function updateReadme(section) {
  const readme = read('README.md');
  const beginMarker = '<!-- BEGIN GENERATED TOOLS -->';
  const endMarker = '<!-- END GENERATED TOOLS -->';

  if (!readme.includes(beginMarker) || !readme.includes(endMarker)) {
    log('ERROR: README.md missing generated-tools markers.');
    process.exit(1);
  }

  const before = readme.substring(0, readme.indexOf(beginMarker) + beginMarker.length);
  const after = readme.substring(readme.indexOf(endMarker));
  const updated = `${before}\n${section}\n${after}`.replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
  writeRel('README.md', updated);
  log('Updated README.md');
}

function writeApiCoverage(content) {
  writeRel('API_COVERAGE.md', content);
  log('Updated API_COVERAGE.md');
}

// ── main ───────────────────────────────────────────────────────────────────

function main() {
  const checkMode = process.argv.includes('--check');

  const { tools, prompts } = collectTools();

  const readmeSection = generateReadmeToolsSection(tools, prompts);
  const apiCoverage = generateApiCoverage(tools);

  if (checkMode) {
    const currentReadme = read('README.md');
    const beginMarker = '<!-- BEGIN GENERATED TOOLS -->';
    const endMarker = '<!-- END GENERATED TOOLS -->';
    const currentSection = currentReadme.substring(
      currentReadme.indexOf(beginMarker) + beginMarker.length,
      currentReadme.indexOf(endMarker),
    ).trim();

    const currentApi = read('API_COVERAGE.md').trim();

    if (currentSection !== readmeSection.trim() || currentApi !== apiCoverage.trim()) {
      log('ERROR: Generated docs are stale. Run `yarn gen:docs` to update.');
      process.exit(1);
    }
    log('Docs are up to date.');
    return;
  }

  updateReadme(readmeSection);
  writeApiCoverage(apiCoverage);

  log(`Generated docs for ${tools.length} tools and ${prompts.length} prompts.`);
}

main();
