#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig } from './config.js';
import { Assistant } from './core/assistant.js';
import { IntegrationManager } from './integrations/index.js';
import { WebServer } from './server/index.js';
import { showBanner, showSmallBanner } from './utils/banner.js';
import { logger } from './utils/logger.js';
import type { Config } from './types.js';

async function main(): Promise<void> {
  const program = new Command();

  program
    .name('lobster')
    .description('🦞 Your friendly, private, local AI assistant')
    .version('1.0.0');

  program
    .command('start')
    .description('Start the Lobster assistant')
    .option('-p, --port <port>', 'Web server port')
    .option('--no-web', 'Disable web dashboard')
    .action(async (options) => {
      await startLobster(options);
    });

  program
    .command('setup')
    .description('Run the guided setup wizard')
    .action(async () => {
      const { runSetup } = await import('./setup.js');
      await runSetup();
    });

  program
    .command('status')
    .description('Show Lobster status and configuration')
    .action(() => {
      showSmallBanner();
      const config = loadConfig();
      console.log(chalk.cyan('\n  Configuration:'));
      console.log(chalk.dim(`  LLM:      ${config.llm.provider} / ${config.llm.model}`));
      const enabled = Object.entries(config.integrations)
        .filter(([, v]) => v.enabled)
        .map(([k]) => k);
      console.log(
        chalk.dim(
          `  Chat:     ${enabled.length > 0 ? enabled.join(', ') : 'none (run "lobster setup")'}`
        )
      );
      console.log(chalk.dim(`  Voice:    ${config.voice.enabled ? 'enabled' : 'disabled'}`));
      console.log(chalk.dim(`  Server:   http://${config.server.host}:${config.server.port}`));
      console.log(chalk.dim(`  Sass:     ${config.personality.sassLevel}\n`));
    });

  program
    .command('chat')
    .description('Start an interactive CLI chat with Lobster')
    .action(async () => {
      const { createInterface } = await import('node:readline/promises');
      const config = loadConfig();
      const assistant = new Assistant(config);
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const userId = 'cli-user';

      console.log(chalk.hex('#FF6B35')('\n  🦞 Interactive Lobster Chat'));
      console.log(chalk.dim('  Type /reset to clear memory, /exit to quit\n'));

      const systemMsg = await assistant.handleMessage(
        'cli',
        userId,
        'Introduce yourself briefly (1-2 sentences) as a lobster assistant.'
      );
      console.log(chalk.cyan(`  ${systemMsg}\n`));

      while (true) {
        const input = await rl.question(chalk.hex('#FF8C42')('  You: '));
        if (input === '/exit') break;
        if (input === '/reset') {
          assistant.getMemory().clearConversation('cli', userId);
          console.log(chalk.dim('  Memory cleared.\n'));
          continue;
        }

        const response = await assistant.handleMessage('cli', userId, input);
        console.log(chalk.cyan(`  🦞 ${response}\n`));
      }

      rl.close();
      assistant.destroy();
    });

  program.parse(process.argv);
}

async function startLobster(options: { port?: string; web?: boolean }): Promise<void> {
  console.clear();
  showBanner();

  const config = loadConfig();
  const assistant = new Assistant(config);
  const integrator = new IntegrationManager(assistant, config);

  logger.info('Lobster is waking up... 🦞');

  if (options.port) {
    config.server.port = parseInt(options.port);
  }

  let webServer: WebServer | null = null;
  if (options.web !== false) {
    webServer = new WebServer(assistant, config);
    await webServer.start();
  }

  await integrator.startAll();

  logger.success('Lobster is ready! 🦞');
  console.log(
    chalk.hex('#FF6B35')(`
  ┌────────────────────────────────────────────┐
  │   🦞  LOBSTER IS ALIVE AND PINCHING!       │
  │                                            │
  │   Message me from any connected chat app   │
  │   or open http://localhost:${String(config.server.port).padEnd(4)} in your browser   │
  └────────────────────────────────────────────┘`)
  );

  const shutdown = async () => {
    logger.info('Lobster is going back to the ocean... 🦞');
    await integrator.stopAll();
    if (webServer) await webServer.stop();
    assistant.destroy();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Keep alive
  await new Promise(() => {});
}

main().catch((err: Error) => {
  console.error(chalk.red('  Lobster crashed:'), err.message);
  process.exit(1);
});
