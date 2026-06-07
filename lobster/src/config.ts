import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Config } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, '..', 'config', 'default.json');

let cachedConfig: Config | null = null;

export function loadConfig(): Config {
  if (cachedConfig) return cachedConfig;

  const raw = readFileSync(CONFIG_PATH, 'utf-8');
  const config: Config = JSON.parse(raw);

  config.llm.ollamaBaseUrl = process.env.OLLAMA_BASE_URL ?? config.llm.ollamaBaseUrl;
  config.llm.openaiApiKey = process.env.OPENAI_API_KEY ?? config.llm.openaiApiKey;
  config.llm.model = process.env.LLM_MODEL ?? config.llm.model;

  config.integrations.telegram.botToken =
    process.env.TELEGRAM_BOT_TOKEN ?? config.integrations.telegram.botToken;
  if (process.env.ENABLE_WHATSAPP !== undefined) {
    config.integrations.whatsapp.enabled = process.env.ENABLE_WHATSAPP === 'true';
  }
  if (config.llm.openaiApiKey) {
    config.llm.provider = 'openai';
  }

  if (!config.skills) config.skills = { enabled: true, paths: [] };
  if (!config.workflows) config.workflows = { enabled: true, directory: '' };
  if (!config.scheduler) config.scheduler = { enabled: false, heartbeatIntervalMinutes: 30 };
  if (!config.agents) {
    config.agents = {
      defaultAgentId: 'main',
      list: [
        { id: 'main', name: 'Lobster', description: 'Main general-purpose lobster assistant', personalityTheme: 'lobster', allowedTools: [], workspace: '' },
      ],
    };
  }
  if (!config.memory.longTermEnabled) config.memory.longTermEnabled = false;
  if (!config.memory.summarizationEnabled) config.memory.summarizationEnabled = false;

  cachedConfig = config;
  return config;
}

export function updateConfig(updates: Partial<Config>): Config {
  const config = loadConfig();
  const merged = deepMerge(
    config as unknown as Record<string, unknown>,
    updates as unknown as Record<string, unknown>
  );
  cachedConfig = merged as unknown as Config;
  const configDir = dirname(CONFIG_PATH);
  if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2));
  return merged as unknown as Config;
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target };
  for (const [key, val] of Object.entries(source)) {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      result[key] = deepMerge(
        (result[key] as Record<string, unknown>) ?? {},
        val as Record<string, unknown>
      );
    } else if (val !== undefined) {
      result[key] = val;
    }
  }
  return result;
}
