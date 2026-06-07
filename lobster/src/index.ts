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
import type { VoiceConversation } from './voice/conversation.js';

async function checkAudioTools(): Promise<boolean> {
  const { execSync } = await import('node:child_process');
  const isWindows = process.platform === 'win32';
  const isMac = process.platform === 'darwin';
  try {
    if (isWindows) {
      execSync('sox --version', { stdio: 'ignore' });
    } else if (isMac) {
      execSync('rec --version', { stdio: 'ignore' });
    } else {
      execSync('arecord --version', { stdio: 'ignore' });
    }
    return true;
  } catch {
    return false;
  }
}

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
      console.log(chalk.dim(`  Sass:     ${config.personality.sassLevel}`));
      console.log(chalk.dim(`  Skills:   ${config.skills.enabled ? 'enabled' : 'disabled'}`));
      console.log(chalk.dim(`  Workflows: ${config.workflows.enabled ? 'enabled' : 'disabled'}`));
      console.log(chalk.dim(`  Scheduler: ${config.scheduler.enabled ? 'enabled' : 'disabled'}`));
      console.log(chalk.dim(`  Agents:   ${config.agents.list.length} configured\n`));
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
      console.log(chalk.dim('  Type /reset to clear memory, /agents to list agents, /workflows to see workflows, /exit to quit\n'));

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

  program
    .command('skills')
    .description('List loaded skills')
    .action(async () => {
      const { getAllSkills } = await import('./skills/index.js');
      const config = loadConfig();
      const { initSkills } = await import('./skills/index.js');
      await initSkills(config);
      const skills = getAllSkills();
      if (skills.length === 0) {
        console.log(chalk.yellow('\n  No skills loaded.\n'));
        return;
      }
      console.log(chalk.cyan('\n  Loaded Skills:'));
      for (const skill of skills) {
        console.log(chalk.dim(`  - ${skill.name} v${skill.version}: ${skill.description}`));
      }
      console.log();
    });

  program
    .command('workflows')
    .description('List registered workflows')
    .action(async () => {
      const { getAllWorkflows, initWorkflows } = await import('./workflows/index.js');
      const config = loadConfig();
      initWorkflows(config);
      const workflows = getAllWorkflows();
      if (workflows.length === 0) {
        console.log(chalk.yellow('\n  No workflows registered.\n'));
        return;
      }
      console.log(chalk.cyan('\n  Registered Workflows:'));
      for (const wf of workflows) {
        console.log(chalk.dim(`  - ${wf.name} v${wf.version}: ${wf.description} (${wf.steps.length} steps)`));
      }
      console.log();
    });

  program
    .command('agents')
    .description('List configured agents')
    .action(async () => {
      const { getAllAgents, initAgents } = await import('./agents/index.js');
      const config = loadConfig();
      initAgents(config);
      const agents = getAllAgents();
      if (agents.length === 0) {
        console.log(chalk.yellow('\n  No agents configured.\n'));
        return;
      }
      console.log(chalk.cyan('\n  Configured Agents:'));
      for (const agent of agents) {
        console.log(chalk.dim(`  - @${agent.id} (${agent.name}): ${agent.description}`));
      }
      console.log();
    });

  program
    .command('tasks')
    .description('List scheduled tasks')
    .action(async () => {
      const { getAllTasks } = await import('./workflows/scheduler.js');
      const tasks = getAllTasks();
      if (tasks.length === 0) {
        console.log(chalk.yellow('\n  No scheduled tasks.\n'));
        return;
      }
      console.log(chalk.cyan('\n  Scheduled Tasks:'));
      for (const task of tasks) {
        console.log(chalk.dim(`  - ${task.name}: ${task.cronExpression} → ${task.workflowName}${task.enabled ? '' : ' (disabled)'}`));
      }
      console.log();
    });

  program
    .command('task')
    .description('Add or remove a scheduled task')
    .argument('<action>', 'add or remove')
    .argument('[name]', 'Task name (for add)')
    .argument('[cron]', 'Cron expression (for add)')
    .argument('[workflow]', 'Workflow name (for add)')
    .action(async (action, name, cron, workflow) => {
      const { addTask, removeTask } = await import('./workflows/scheduler.js');
      const { randomUUID } = await import('node:crypto');

      if (action === 'add') {
        if (!name || !cron || !workflow) {
          console.log(chalk.yellow('  Usage: lobster task add <name> <cron> <workflow>'));
          return;
        }
        addTask({
          id: randomUUID(),
          name,
          description: `Task: ${name}`,
          cronExpression: cron,
          workflowName: workflow,
          enabled: true,
        });
        console.log(chalk.green(`  Task "${name}" added (${cron} → ${workflow})`));
      } else if (action === 'remove') {
        if (!name) {
          console.log(chalk.yellow('  Usage: lobster task remove <id>'));
          return;
        }
        const ok = removeTask(name);
        console.log(ok ? chalk.green(`  Task removed`) : chalk.yellow(`  Task not found`));
      } else {
        console.log(chalk.yellow('  Action must be "add" or "remove"'));
      }
    });

  program
    .command('voice')
    .description('Start real-time voice conversation mode')
    .action(async () => {
      const hasTools = await checkAudioTools();
      if (!hasTools) {
        const isWindows = process.platform === 'win32';
        const tool = isWindows ? 'sox' : (process.platform === 'darwin' ? 'rec (from sox)' : 'arecord');
        console.log(chalk.yellow(`\n  ${tool} not found. Install it first:`));
        if (isWindows) {
          console.log(chalk.dim('    Download from: https://sourceforge.net/projects/sox/files/sox/'));
        } else if (process.platform === 'darwin') {
          console.log(chalk.dim('    brew install sox'));
        } else {
          console.log(chalk.dim('    sudo apt-get install alsa-utils   # Linux'));
        }
        console.log();
        return;
      }

      const config = loadConfig();
      const { VoiceConversation } = await import('./voice/index.js');
      const conversation = new VoiceConversation(config);
      await conversation.start();

      process.on('SIGINT', () => {
        conversation.stop();
        process.exit(0);
      });

      await new Promise(() => {});
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

  let voiceConversation: VoiceConversation | null = null;
  if (config.voice.enabled) {
    const { VoiceConversation } = await import('./voice/index.js');
    const hasAudioTools = await checkAudioTools();
    if (hasAudioTools) {
      voiceConversation = new VoiceConversation(config, assistant, true);
      await voiceConversation.start();
    } else {
      logger.warn('Voice enabled but audio tools not found (install sox/rec/arecord)');
    }
  }

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

  if (config.agents.list.length > 1) {
    console.log(chalk.cyan(`  Multi-agent mode: ${config.agents.list.length} agents ready`));
  }
  if (config.skills.enabled) {
    console.log(chalk.cyan(`  Skills system: enabled`));
  }
  if (config.workflows.enabled) {
    console.log(chalk.cyan(`  Workflow engine: enabled`));
  }
  if (config.scheduler.enabled) {
    console.log(chalk.cyan(`  Scheduler: enabled (heartbeat every ${config.scheduler.heartbeatIntervalMinutes}m)`));
  }
  if (voiceConversation) {
    console.log(chalk.cyan(`  Voice: listening for "${config.voice.conversation?.wakeWord ?? 'hey lobster'}"`));
  }

  const shutdown = async () => {
    logger.info('Lobster is going back to the ocean... 🦞');
    if (voiceConversation) voiceConversation.stop();
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
