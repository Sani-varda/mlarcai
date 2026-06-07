import { LLMClient } from './llm.js';
import { MemoryManager } from '../memory/index.js';
import { buildSystemPrompt } from './personality.js';
import { buildAgentSystemPrompt, routeMessage, getAgent, getDefaultAgent, getAllAgents } from '../agents/index.js';
import { toolDefinitions as builtInToolDefs, executeToolCall, initTools } from '../tools/index.js';
import { getSkillTools, getSkillToolMap } from '../skills/index.js';
import { executeWorkflow, getExecution, getAllExecutions, approveWorkflow, rejectWorkflow, getWorkflow } from '../workflows/index.js';
import type { Config, ChatMessage, ToolCall, ToolDefinition } from '../types.js';
import { logger } from '../utils/logger.js';

const MAX_TOOL_ROUNDS = 8;

export class Assistant {
  private llm: LLMClient;
  private memory: MemoryManager;
  private config: Config;
  private systemPrompt: string;

  constructor(config: Config) {
    this.config = config;
    initTools(config);
    this.llm = new LLMClient(config);
    this.memory = new MemoryManager(config);
    this.systemPrompt = buildSystemPrompt(config) + `

CAPABILITIES:
You have access to browser control, web search, skills, and workflow automation.

Available built-in tools:
- browser_navigate(url): Go to a URL
- browser_search(query): Search Google
- browser_click(selector): Click an element by CSS selector
- browser_type(selector, text): Type into an input field
- browser_extract(): Get text from the current page
- browser_screenshot(): Take a screenshot (returns base64 PNG)
- browser_close(): Close the browser

WORKFLOW AUTOMATION:
You can create and execute multi-step workflows. When the user asks you to automate a series of steps, create a workflow definition and execute it.

SCHEDULING:
You can schedule tasks using cron expressions (minute hour day-of-month month day-of-week).

MULTI-AGENT MODE:
You can route messages to specialized agents by mentioning them (@agentName).
Available agents are configured in the system.

SKILLS:
You have access to registered skills that extend your capabilities.

When you need to browse or automate, call the appropriate tools. After getting results, summarize them for the user.`;
  }

  getMemory(): MemoryManager {
    return this.memory;
  }

  private getAllToolDefinitions(): ToolDefinition[] {
    const skillTools = getSkillTools();
    const allTools = [...builtInToolDefs, ...skillTools];

    const skillToolMap = getSkillToolMap();
    for (const [name] of Object.entries(skillToolMap)) {
      if (!allTools.some((t) => t.function.name === name)) {
        allTools.push({
          type: 'function',
          function: {
            name,
            description: `Skill tool: ${name}`,
            parameters: {
              type: 'object',
              properties: {},
            },
          },
        });
      }
    }

    return allTools;
  }

  async handleMessage(
    platform: string,
    userId: string,
    text: string,
    agentId?: string
  ): Promise<string> {
    const lower = text.toLowerCase().trim();

    if (lower === '/reset' || lower === '🦞 /reset') {
      this.memory.clearConversation(platform, userId, agentId);
      return '*Your lobster has forgotten everything. Ah, sweet ignorance.* 🦞';
    }

    if (lower === '/agents' || lower === '/list agents') {
      return this.listAgents();
    }

    if (lower === '/workflows' || lower === '/list workflows') {
      return this.listWorkflows();
    }

    if (lower === '/tasks' || lower === '/list tasks') {
      const { getAllTasks } = await import('../workflows/scheduler.js');
      const tasks = getAllTasks();
      if (tasks.length === 0) return 'No scheduled tasks.';
      return tasks.map((t) => `- ${t.name}: ${t.cronExpression} (workflow: ${t.workflowName})`).join('\n');
    }

    if (lower === '/memory' || lower === '/show memory') {
      return this.showMemory(platform, userId, agentId);
    }

    if (lower === '/skills' || lower === '/list skills') {
      const { getAllSkills } = await import('../skills/index.js');
      const skills = getAllSkills();
      if (skills.length === 0) return 'No skills loaded.';
      return skills.map((s) => `- ${s.name} v${s.version}: ${s.description}`).join('\n');
    }

    if (lower.startsWith('/workflow run ')) {
      const wfName = text.slice('/workflow run '.length).trim();
      return this.runWorkflowCommand(wfName);
    }

    if (lower.startsWith('/approve ')) {
      const id = text.slice('/approve '.length).trim();
      return this.approveWorkflowCommand(id);
    }

    if (lower.startsWith('/reject ')) {
      const id = text.slice('/reject '.length).trim();
      return this.rejectWorkflowCommand(id);
    }

    const resolvedAgentId = agentId ?? routeMessage(text, platform, userId, this.config);

    this.memory.addMessage(platform, userId, { role: 'user', content: text }, resolvedAgentId);

    const agent = getAgent(resolvedAgentId) ?? getDefaultAgent(this.config);
    const agentPrompt = buildAgentSystemPrompt(agent, this.config);

    const response = await this.processWithTools(platform, userId, agentPrompt, resolvedAgentId);

    this.memory.addMessage(platform, userId, {
      role: 'assistant' as const,
      content: response,
    }, resolvedAgentId);

    return response;
  }

  private parseToolCallsFromText(text: string, availableTools: ToolDefinition[]): ToolCall[] | null {
    const toolNames = availableTools.map((t) => t.function.name);

    const jsonBlocks = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/g);
    if (jsonBlocks) {
      for (const block of jsonBlocks) {
        try {
          const cleaned = block.replace(/```(?:json)?\s*/g, '').replace(/\s*```/g, '');
          const parsed = JSON.parse(cleaned);
          if (parsed.name && parsed.arguments && toolNames.includes(parsed.name)) {
            return [{
              id: `call_fallback_${Date.now()}`,
              type: 'function',
              function: {
                name: parsed.name,
                arguments: typeof parsed.arguments === 'string' ? parsed.arguments : JSON.stringify(parsed.arguments),
              },
            }];
          }
        } catch {}
      }
    }

    for (const toolName of toolNames) {
      const escaped = toolName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(
        `["']?${escaped}["']?\\s*(?:args|arguments)?\\s*[:=]?\\s*(\\{(?:[^{}]|(?:\\{[^{}]*\\}))*\\})`,
        'i'
      );
      const match = text.match(pattern);
      if (match) {
        try {
          const args = JSON.parse(match[1]);
          return [{
            id: `call_fallback_${Date.now()}`,
            type: 'function',
            function: {
              name: toolName,
              arguments: typeof args === 'string' ? args : JSON.stringify(args),
            },
          }];
        } catch {}
      }
    }

    const fnCallMatch = text.match(
      /(?:function|tool|call)\s*(?:call)?\s*[:=]\s*["']?(\w+)["']?/i
    );
    if (fnCallMatch) {
      const name = fnCallMatch[1];
      if (toolNames.includes(name)) {
        const argsMatch = text.match(
          /(?:arguments|args|params|parameters)\s*[:=]\s*(\{[^}]*\})/i
        );
        if (argsMatch) {
          try {
            const args = JSON.parse(argsMatch[1]);
            return [{
              id: `call_fallback_${Date.now()}`,
              type: 'function',
              function: {
                name,
                arguments: typeof args === 'string' ? args : JSON.stringify(args),
              },
            }];
          } catch {}
        }
      }
    }

    return null;
  }

  private async processWithTools(
    platform: string,
    userId: string,
    agentPrompt: string,
    agentId?: string
  ): Promise<string> {
    const context = this.memory.getContext(platform, userId, agentId);
    const allTools = this.getAllToolDefinitions();
    const skillToolMap = getSkillToolMap();

    const messages: ChatMessage[] = [
      { role: 'system', content: agentPrompt },
      ...context,
    ];

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const result = await this.llm.chatWithTools(messages, allTools);

      let toolCalls = result.toolCalls;

      if (!toolCalls || toolCalls.length === 0) {
        const fallbackCalls = this.parseToolCallsFromText(result.content || '', allTools);
        if (fallbackCalls) {
          logger.info(`Fallback parsed tool call: ${fallbackCalls[0].function.name}`);
          toolCalls = fallbackCalls;
        }
      }

      if (toolCalls && toolCalls.length > 0) {
        messages.push({
          role: 'assistant',
          content: result.content || '',
          tool_calls: toolCalls,
        });

        for (const toolCall of toolCalls) {
          const fnName = toolCall.function.name;
          logger.info(`Tool call: ${fnName}(${toolCall.function.arguments})`);

          const skillFn = skillToolMap[fnName];
          let toolResult: string;

          if (skillFn) {
            const args = JSON.parse(toolCall.function.arguments) as Record<string, string>;
            toolResult = await skillFn(...Object.values(args));
          } else {
            toolResult = await executeToolCall(toolCall);
          }

          messages.push({
            role: 'tool',
            content: toolResult,
            tool_call_id: toolCall.id,
          });
        }
        continue;
      }

      return result.content || '...';
    }

    return '*The lobster has been thinking too long and got distracted by a shiny object.* 🦞';
  }

  private listAgents(): string {
    const agents = getAllAgents();
    if (agents.length === 0) return 'No agents configured.';
    return agents.map((a) =>
      `- @${a.id} (${a.name}): ${a.description}`
    ).join('\n');
  }

  private listWorkflows(): string {
    const workflows = getAllExecutions();
    if (workflows.length === 0) return 'No workflow executions.';
    return workflows.map((w) =>
      `- ${w.workflowName} (#${w.id.slice(0, 8)}): ${w.status}`
    ).join('\n');
  }

  private showMemory(platform: string, userId: string, agentId?: string): string {
    const summary = this.memory.getSummary(platform, userId, agentId);
    const conv = this.memory.getConversation(platform, userId, agentId);
    return [
      `**Conversation stats:**`,
      `Messages: ${conv.messages.length}`,
      `Created: ${conv.createdAt.toISOString()}`,
      summary ? `Summary: ${summary}` : 'No summary yet.',
    ].join('\n');
  }

  private async runWorkflowCommand(wfName: string): Promise<string> {
    try {
      const wf = getWorkflow(wfName);
      if (!wf) return `Workflow "${wfName}" not found.`;
      const execution = await executeWorkflow(wfName);
      return `Started workflow "${wfName}" (ID: ${execution.id.slice(0, 8)}). Status: ${execution.status}`;
    } catch (err: unknown) {
      const e = err as Error;
      return `Failed to start workflow: ${e.message}`;
    }
  }

  private async approveWorkflowCommand(id: string): Promise<string> {
    const ok = approveWorkflow(id);
    return ok ? `Workflow ${id.slice(0, 8)} approved.` : `No workflow awaiting approval with ID ${id.slice(0, 8)}.`;
  }

  private rejectWorkflowCommand(id: string): string {
    const ok = rejectWorkflow(id);
    return ok ? `Workflow ${id.slice(0, 8)} rejected.` : `No workflow awaiting approval with ID ${id.slice(0, 8)}.`;
  }

  async sendTyping(
    _platform: string,
    _userId: string
  ): Promise<void> {
  }

  destroy(): void {
    this.memory.destroy();
  }
}
