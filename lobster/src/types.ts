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
    conversation?: {
      wakeWordEnabled: boolean;
      wakeWord: string;
      silenceTimeoutMs: number;
      minSpeechMs: number;
      maxSpeechMs: number;
      followUpWindowMs: number;
      vadThreshold: number;
    };
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
    longTermEnabled?: boolean;
    summarizationEnabled?: boolean;
  };
  browser: {
    mode: 'real' | 'headless';
  };
  skills: {
    enabled: boolean;
    paths: string[];
  };
  workflows: {
    enabled: boolean;
    directory: string;
  };
  scheduler: {
    enabled: boolean;
    heartbeatIntervalMinutes: number;
  };
  agents: {
    defaultAgentId: string;
    list: AgentConfig[];
  };
}

export interface AgentConfig {
  id: string;
  name: string;
  description: string;
  personalityTheme?: string;
  allowedTools?: string[];
  workspace?: string;
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
  agentId?: string;
  messages: ChatMessage[];
  summary?: string;
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

export interface WorkflowStep {
  name: string;
  tool?: string;
  input?: Record<string, string>;
  condition?: string;
  approval?: boolean;
  timeout?: number;
  agentId?: string;
}

export interface WorkflowDefinition {
  name: string;
  description: string;
  version: string;
  steps: WorkflowStep[];
  onComplete?: string;
  onError?: string;
}

export enum WorkflowStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  AWAITING_APPROVAL = 'awaiting_approval',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export interface WorkflowExecution {
  id: string;
  workflowName: string;
  status: WorkflowStatus;
  currentStep: number;
  steps: WorkflowStep[];
  results: Record<string, string>;
  errors: Record<string, string>;
  resumeToken?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ScheduledTask {
  id: string;
  name: string;
  description: string;
  cronExpression: string;
  workflowName: string;
  workflowInput?: Record<string, string>;
  enabled: boolean;
  lastRun?: Date;
  nextRun?: Date;
}

export interface SkillDefinition {
  name: string;
  description: string;
  version: string;
  author?: string;
  tools?: ToolDefinition[];
  toolMap?: Record<string, (...args: string[]) => Promise<string>>;
  onLoad?: () => Promise<void>;
  onUnload?: () => Promise<void>;
  dependencies?: string[];
}

export interface AgentRouter {
  route(platform: string, userId: string, text: string): string;
}
