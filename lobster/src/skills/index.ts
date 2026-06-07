import { readFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import type { SkillDefinition, ToolDefinition, Config } from '../types.js';
import { logger } from '../utils/logger.js';

const SKILL_INDEX = new Map<string, SkillDefinition>();
const SKILL_TOOLS: ToolDefinition[] = [];
const SKILL_TOOL_MAP: Record<string, (...args: string[]) => Promise<string>> = {};

export function getSkillTools(): ToolDefinition[] {
  return [...SKILL_TOOLS];
}

export function getSkillToolMap(): Record<string, (...args: string[]) => Promise<string>> {
  return { ...SKILL_TOOL_MAP };
}

export function getAllSkills(): SkillDefinition[] {
  return Array.from(SKILL_INDEX.values());
}

export function getSkill(name: string): SkillDefinition | undefined {
  return SKILL_INDEX.get(name);
}

export async function registerSkill(skill: SkillDefinition): Promise<void> {
  if (SKILL_INDEX.has(skill.name)) {
    logger.warn(`Skill "${skill.name}" already registered, skipping`);
    return;
  }

  SKILL_INDEX.set(skill.name, skill);

  if (skill.tools) {
    for (const tool of skill.tools) {
      SKILL_TOOLS.push(tool);
    }
  }

  if (skill.toolMap) {
    for (const [name, fn] of Object.entries(skill.toolMap)) {
      SKILL_TOOL_MAP[name] = fn;
    }
  }

  if (skill.onLoad) {
    await skill.onLoad();
  }

  logger.success(`Skill loaded: ${skill.name} v${skill.version}`);
}

export async function unregisterSkill(name: string): Promise<void> {
  const skill = SKILL_INDEX.get(name);
  if (!skill) {
    logger.warn(`Skill "${name}" not found, cannot unload`);
    return;
  }

  if (skill.onUnload) {
    await skill.onUnload();
  }

  if (skill.tools) {
    for (const tool of skill.tools) {
      const idx = SKILL_TOOLS.findIndex(
        (t) => t.function.name === tool.function.name
      );
      if (idx !== -1) SKILL_TOOLS.splice(idx, 1);
    }
  }

  if (skill.toolMap) {
    for (const toolName of Object.keys(skill.toolMap)) {
      delete SKILL_TOOL_MAP[toolName];
    }
  }

  SKILL_INDEX.delete(name);
  logger.info(`Skill unloaded: ${name}`);
}

export async function loadSkillsFromPaths(paths: string[]): Promise<void> {
  for (const dirPath of paths) {
    if (!existsSync(dirPath)) {
      logger.warn(`Skills path not found: ${dirPath}`);
      continue;
    }

    const entries = readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillPath = join(dirPath, entry.name);
        await loadSkillFromDirectory(skillPath);
      } else if (entry.isFile() && extname(entry.name) === '.json') {
        const filePath = join(dirPath, entry.name);
        await loadSkillFromFile(filePath);
      }
    }
  }
}

async function loadSkillFromDirectory(dirPath: string): Promise<void> {
  const manifestPath = join(dirPath, 'skill.json');
  if (!existsSync(manifestPath)) return;

  try {
    const raw = readFileSync(manifestPath, 'utf-8');
    const partial = JSON.parse(raw) as Partial<SkillDefinition>;

    if (!partial.name) {
      logger.warn(`Skill manifest missing name: ${manifestPath}`);
      return;
    }

    const dynamicPath = join(dirPath, 'index.js');
    let toolMap: Record<string, (...args: string[]) => Promise<string>> | undefined;

    if (existsSync(dynamicPath)) {
      const mod = await import(dynamicPath);
      if (mod.toolMap) toolMap = mod.toolMap;
    }

    const skill: SkillDefinition = {
      name: partial.name,
      description: partial.description ?? '',
      version: partial.version ?? '0.1.0',
      author: partial.author,
      tools: partial.tools,
      toolMap,
      dependencies: partial.dependencies,
    };

    await registerSkill(skill);
  } catch (err: unknown) {
    const e = err as Error;
    logger.error(`Failed to load skill from ${dirPath}: ${e.message}`);
  }
}

async function loadSkillFromFile(filePath: string): Promise<void> {
  try {
    const raw = readFileSync(filePath, 'utf-8');
    const skill = JSON.parse(raw) as SkillDefinition;

    if (!skill.name) {
      logger.warn(`Skill file missing name: ${filePath}`);
      return;
    }

    await registerSkill(skill);
  } catch (err: unknown) {
    const e = err as Error;
    logger.error(`Failed to load skill file ${filePath}: ${e.message}`);
  }
}

export async function initSkills(config: Config): Promise<void> {
  if (!config.skills.enabled) return;

  await loadSkillsFromPaths(config.skills.paths);

  logger.info(`Skills system initialized with ${SKILL_INDEX.size} skills`);
}
