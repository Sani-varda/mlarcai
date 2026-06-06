import type { ToolDefinition, ToolCall, Config } from '../types.js';
import * as browser from './browser.js';

export const toolDefinitions: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'browser_navigate',
      description: 'Navigate to a URL in the browser',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The URL to navigate to' },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browser_click',
      description: 'Click an element on the page using a CSS selector',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector for the element to click' },
        },
        required: ['selector'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browser_type',
      description: 'Type text into an input field',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector for the input element' },
          text: { type: 'string', description: 'Text to type into the field' },
        },
        required: ['selector', 'text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browser_extract',
      description: 'Extract the text content from the current page',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browser_screenshot',
      description: 'Take a screenshot of the current page (returns base64 encoded PNG)',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browser_search',
      description: 'Search the web using Google',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The search query' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browser_close',
      description: 'Close the browser',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
];

const toolMap: Record<string, (...args: string[]) => Promise<string>> = {
  browser_navigate: (url: string) => browser.browserNavigate(url),
  browser_click: (selector: string) => browser.browserClick(selector),
  browser_type: (selector: string, text: string) => browser.browserType(selector, text),
  browser_extract: () => browser.browserExtract(),
  browser_screenshot: () => browser.browserScreenshot(),
  browser_search: (query: string) => browser.browserSearch(query),
  browser_close: () => browser.browserClose(),
};

export function initTools(config: Config): void {
  if (config.browser) {
    browser.initBrowser(config.browser);
  }
}

export async function executeToolCall(toolCall: ToolCall): Promise<string> {
  const { name, arguments: argsStr } = toolCall.function;
  const fn = toolMap[name];
  if (!fn) {
    return `Error: Unknown tool "${name}"`;
  }

  try {
    const args = JSON.parse(argsStr) as Record<string, string>;
    const values = Object.values(args);
    return await fn(...values);
  } catch (err: unknown) {
    const e = err as Error;
    return `Error executing ${name}: ${e.message}`;
  }
}
