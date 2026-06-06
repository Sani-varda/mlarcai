import OpenAI from 'openai';
import type { Config, ChatMessage, ToolDefinition, ToolCall } from '../types.js';
import { logger } from '../utils/logger.js';

export class LLMClient {
  private openai: OpenAI;
  private config: Config;
  private useOpenAI: boolean;

  constructor(config: Config) {
    this.config = config;
    this.useOpenAI = config.llm.provider === 'openai' && !!config.llm.openaiApiKey;

    if (this.useOpenAI) {
      this.openai = new OpenAI({
        apiKey: config.llm.openaiApiKey,
      });
    } else {
      this.openai = new OpenAI({
        baseURL: config.llm.ollamaBaseUrl + '/v1',
        apiKey: 'ollama',
      });
    }
  }

  private toApiMessages(messages: ChatMessage[]): OpenAI.ChatCompletionMessageParam[] {
    return messages.map((m) => {
      return {
        role: m.role,
        content: m.content,
        ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}),
        ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
      } as unknown as OpenAI.ChatCompletionMessageParam;
    });
  }

  async chat(messages: ChatMessage[]): Promise<string> {
    const start = performance.now();
    const model = this.useOpenAI ? this.config.llm.openaiModel : this.config.llm.model;

    try {
      const response = await this.openai.chat.completions.create({
        model,
        messages: this.toApiMessages(messages),
        temperature: this.config.llm.temperature,
        max_tokens: this.config.llm.maxTokens,
      });

      const elapsed = (performance.now() - start).toFixed(0);
      logger.info(`${this.useOpenAI ? 'OpenAI' : 'Ollama'} response in ${elapsed}ms`);

      const content = response.choices[0]?.message?.content;
      return content?.trim() || '*The lobster stares at you silently.*';
    } catch (err: unknown) {
      const error = err as { message?: string };
      const message = error?.message ?? String(err);
      if (!this.useOpenAI && typeof message === 'string' && message.includes('connect')) {
        logger.error('Cannot reach Ollama. Is it running?');
        return '*🦞 The lobster is sleeping! (Ollama is not running — try `ollama serve`)*';
      }
      logger.error(`LLM error: ${message}`);
      return `*🦞 Sorry, my lobster brain overheated: ${message}*`;
    }
  }

  async chatWithTools(
    messages: ChatMessage[],
    tools: ToolDefinition[]
  ): Promise<{ content?: string; toolCalls?: ToolCall[] }> {
    const start = performance.now();
    const model = this.useOpenAI ? this.config.llm.openaiModel : this.config.llm.model;

    try {
      const response = await this.openai.chat.completions.create({
        model,
        messages: this.toApiMessages(messages),
        tools: tools as unknown as OpenAI.ChatCompletionTool[],
        tool_choice: 'auto',
        temperature: this.config.llm.temperature,
        max_tokens: this.config.llm.maxTokens,
      });

      const elapsed = (performance.now() - start).toFixed(0);
      logger.info(`${this.useOpenAI ? 'OpenAI' : 'Ollama'} tool response in ${elapsed}ms`);

      const msg = response.choices[0]?.message;
      if (!msg) return { content: '*The lobster stares at you silently.*' };

      const content = msg.content?.trim();
      const toolCalls = msg.tool_calls?.map((tc) => ({
        id: tc.id,
        type: tc.type as 'function',
        function: { name: tc.function.name, arguments: tc.function.arguments },
      }));

      return { content, toolCalls };
    } catch (err: unknown) {
      const error = err as { message?: string };
      const message = error?.message ?? String(err);
      if (!this.useOpenAI && typeof message === 'string' && message.includes('connect')) {
        logger.error('Cannot reach Ollama. Is it running?');
        return { content: '*🦞 The lobster is sleeping! (Ollama is not running)*' };
      }
      logger.error(`LLM tool error: ${message}`);
      return { content: `*🦞 Lobster brain overheated: ${message}*` };
    }
  }

  async streamChat(
    messages: ChatMessage[],
    onToken: (token: string) => void
  ): Promise<string> {
    const model = this.useOpenAI ? this.config.llm.openaiModel : this.config.llm.model;

    try {
      const stream = await this.openai.chat.completions.create({
        model,
        messages: this.toApiMessages(messages),
        temperature: this.config.llm.temperature,
        max_tokens: this.config.llm.maxTokens,
        stream: true,
      });

      let full = '';
      for await (const chunk of stream) {
        const token = chunk.choices[0]?.delta?.content ?? '';
        full += token;
        onToken(token);
      }
      return full.trim();
    } catch (err: unknown) {
      const error = err as { message?: string };
      const message = error?.message ?? String(err);
      logger.error(`Stream error: ${message}`);
      return `*Lobster stream error: ${message}*`;
    }
  }
}
