export interface Config {
  llm: {
    provider: 'ollama' | 'openai';
    model: string;
    ollamaBaseUrl: string;
    openaiApiKey?: string;
    openaiModel: string;
    temperature: number;
    maxTokens: number;
  };
  integrations: {
    telegram: { enabled: boolean; botToken: string };
    whatsapp: { enabled: boolean };
  };
  voice: {
    enabled: boolean;
    sttModel: string;
    ttsVoice: string;
  };
  server: {
    port: number;
    host: string;
  };
  personality: {
    name: string;
    theme: string;
    quirks: boolean;
    emojis: boolean;
    sassLevel: 'low' | 'medium' | 'high';
  };
  memory: {
    enabled: boolean;
    maxHistory: number;
    contextWindow: number;
  };
  browser: {
    mode: 'real' | 'headless';
  };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface Conversation {
  id: string;
  platform: string;
  userId: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IntegrationAdapter {
  name: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  sendMessage(channel: string, message: string): Promise<void>;
}

export type VoicePlatform = 'ios' | 'android' | 'web';

export interface VoiceRequest {
  audioBuffer: Buffer;
  platform: VoicePlatform;
  conversationId: string;
}

export interface VoiceResponse {
  text: string;
  audioBuffer?: Buffer;
}

export interface ToolParameter {
  type: string;
  description?: string;
}

export interface ToolFunction {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, ToolParameter>;
    required?: string[];
  };
}

export interface ToolDefinition {
  type: 'function';
  function: ToolFunction;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}
