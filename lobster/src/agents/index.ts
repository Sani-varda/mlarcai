import type { AgentConfig, AgentRouter, ChatMessage, Config } from '../types.js';
import { buildSystemPrompt } from '../core/personality.js';
import { logger } from '../utils/logger.js';

const agents = new Map<string, AgentConfig>();

export function initAgents(config: Config): void {
  agents.clear();

  for (const agentCfg of config.agents.list) {
    agents.set(agentCfg.id, agentCfg);
    logger.info(`Agent registered: ${agentCfg.id} (${agentCfg.name})`);
  }

  logger.info(`Multi-agent system initialized with ${agents.size} agents`);
}

export function getAgent(agentId: string): AgentConfig | undefined {
  return agents.get(agentId);
}

export function getAllAgents(): AgentConfig[] {
  return Array.from(agents.values());
}

export function getDefaultAgent(config: Config): AgentConfig {
  return agents.get(config.agents.defaultAgentId) ?? agents.values().next().value as AgentConfig;
}

export function buildAgentSystemPrompt(agent: AgentConfig, config: Config): string {
  const basePrompt = buildSystemPrompt(config);

  const agentPrompt = `
You are acting as "${agent.name}": ${agent.description}

${agent.allowedTools && agent.allowedTools.length > 0
    ? `You have access to these tools: ${agent.allowedTools.join(', ')}. Only use the tools listed here.`
    : 'You have access to all available tools.'}

Focus on your role and expertise. Stay in character as ${agent.name}.`;

  return `${basePrompt}\n\n${agentPrompt}`;
}

export const agentRouter: AgentRouter = {
  route(platform: string, userId: string, text: string): string {
    const lower = text.toLowerCase();

    for (const [id, agent] of agents) {
      const agentLower = agent.name.toLowerCase();
      if (lower.startsWith(`@${agentLower}`) || lower.startsWith(`/${agentLower}`)) {
        return id;
      }
    }

    return 'main';
  },
};

export function routeMessage(
  text: string,
  _platform: string,
  _userId: string,
  config: Config
): string {
  const routed = agentRouter.route(_platform, _userId, text);
  if (agents.has(routed)) return routed;
  return config.agents.defaultAgentId;
}
