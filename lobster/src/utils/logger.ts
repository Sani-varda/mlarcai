import chalk from 'chalk';

const PREFIX = '[🦞 Lobster]';

export const logger = {
  info: (...args: unknown[]) =>
    console.log(chalk.cyan(`${PREFIX} ${args.join(' ')}`)),
  success: (...args: unknown[]) =>
    console.log(chalk.green(`${PREFIX} ${args.join(' ')}`)),
  warn: (...args: unknown[]) =>
    console.log(chalk.yellow(`${PREFIX} ${args.join(' ')}`)),
  error: (...args: unknown[]) =>
    console.log(chalk.red(`${PREFIX} ${args.join(' ')}`)),
  server: (...args: unknown[]) =>
    console.log(chalk.magenta(`${PREFIX} ${args.join(' ')}`)),
  chat: (platform: string, ...args: unknown[]) =>
    console.log(chalk.blue(`[${platform}] ${args.join(' ')}`)),
};
