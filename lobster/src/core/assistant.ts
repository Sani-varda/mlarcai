import { LLMClient } from './llm.js';
import { MemoryManager } from '../memory/index.js';
import { buildSystemPrompt } from './personality.js';
import { toolDefinitions, executeToolCall, initTools } from '../tools/index.js';
import type { Config, ChatMessage, ToolCall } from '../types.js';
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
    this.memory = new MemoryManager(
      config.memory.maxHistory,
      config.memory.contextWindow
    );
    this.systemPrompt = buildSystemPrompt(config) + `

BROWSER CAPABILITIES:
You have full browser control. When the user asks you to browse the web, search for something, visit a website, or interact with a page, use your browser tools.

Available tools:
- browser_navigate(url): Go to a URL
- browser_search(query): Search Google
- browser_click(selector): Click an element by CSS selector
- browser_type(selector, text): Type into an input field
- browser_extract(): Get text from the current page
- browser_screenshot(): Take a screenshot (returns base64 PNG)
- browser_close(): Close the browser

When you need to browse, call the appropriate tools. After getting results, summarize them for the user in your lobster personality.`;
  }

  getMemory(): MemoryManager {
    return this.memory;
  }

  async handleMessage(
    platform: string,
    userId: string,
    text: string
  ): Promise<string> {
    const lower = text.toLowerCase().trim();

    if (lower === '/reset' || lower === '🦞 /reset') {
      this.memory.clearConversation(platform, userId);
      return '*Your lobster has forgotten everything. Ah, sweet ignorance.* 🦞';
    }

    if (lower === '/whoami' || lower === 'who are you') {
      return this.aboutMe();
    }

    this.memory.addMessage(platform, userId, { role: 'user', content: text });

    const response = await this.processWithTools(platform, userId);

    this.memory.addMessage(platform, userId, {
      role: 'assistant' as const,
      content: response,
    });

    return response;
  }

  private parseToolCallsFromText(text: string): ToolCall[] | null {
    const toolNames = toolDefinitions.map((t) => t.function.name);

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
    userId: string
  ): Promise<string> {
    const context = this.memory.getContext(platform, userId);
    const messages: ChatMessage[] = [
      { role: 'system', content: this.systemPrompt },
      ...context,
    ];

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const result = await this.llm.chatWithTools(messages, toolDefinitions);

      let toolCalls = result.toolCalls;

      if (!toolCalls || toolCalls.length === 0) {
        const fallbackCalls = this.parseToolCallsFromText(result.content || '');
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

          const toolResult = await executeToolCall(toolCall);

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

  private aboutMe(): string {
    const provider = this.config.llm.provider;
    const model = this.config.llm.model;
    const integrations = Object.entries(this.config.integrations)
      .filter(([, v]) => v.enabled)
      .map(([k]) => k)
      .join(', ');

    return [
      `🦞 **I'm Lobster!** A crustacean-powered AI assistant.`,
      '',
      `**Brain:** ${model} (via ${provider})`,
      integrations ? `**Connected to:** ${integrations}` : '**Not connected to any chat apps yet — run \`npx lobster setup\`!',
      `**Browser:** Yes — I can browse the web and do things for you`,
      `**Mood:** Pinch-happy and ready to help`,
      '',
      `I'm running 100% locally on your machine. Your data is YOURS. 🦀`,
      '',
      `Try \`/reset\` to wipe my memory of this conversation.`,
    ].join('\n');
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
