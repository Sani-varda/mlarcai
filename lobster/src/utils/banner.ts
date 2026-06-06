import figlet from 'figlet';
import chalk from 'chalk';

export function showBanner(): void {
  const text = figlet.textSync('Lobster', {
    font: 'ANSI Shadow',
    horizontalLayout: 'default',
  });

  const lines = text.split('\n');
  const colors = ['#FF6B35', '#FF8C42', '#FFA94D', '#FFB347', '#FFC75F'];
  const colored = lines
    .map((line, i) => {
      const color = colors[i % colors.length];
      return chalk.hex(color)(line);
    })
    .join('\n');

  console.log('\n' + colored);
  console.log(
    chalk.dim('═'.repeat(60)) +
      '\n' +
      chalk.cyan('  Your friendly, private, local AI assistant') +
      '\n' +
      chalk.dim('═'.repeat(60)) +
      '\n'
  );
}

export function showSmallBanner(): void {
  console.log(
    chalk.hex('#FF6B35')('  🦞 Lobster v1.0.0 - Your local AI assistant')
  );
}
