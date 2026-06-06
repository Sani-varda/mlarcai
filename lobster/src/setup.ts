import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';
import { loadConfig, updateConfig } from './config.js';
import { showBanner } from './utils/banner.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function log(tag: string, msg: string, color = chalk.cyan) {
  console.log(color(`  ${tag} ${msg}`));
}

async function prompt(question: string, defaultVal = ''): Promise<string> {
  const { default: inquirer } = await import('inquirer');
  const result = await inquirer.prompt([
    {
      type: 'input',
      name: 'value',
      message: question,
      default: defaultVal,
    },
  ]);
  return result.value;
}

async function confirm(question: string, defaultVal = true): Promise<boolean> {
  const { default: inquirer } = await import('inquirer');
  const result = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'value',
      message: question,
      default: defaultVal,
    },
  ]);
  return result.value;
}

async function select(
  question: string,
  choices: string[],
  defaultVal?: string
): Promise<string> {
  const { default: inquirer } = await import('inquirer');
  const result = await inquirer.prompt([
    {
      type: 'list',
      name: 'value',
      message: question,
      choices,
      default: defaultVal,
    },
  ]);
  return result.value;
}

async function multiSelect(
  question: string,
  choices: string[]
): Promise<string[]> {
  const { default: inquirer } = await import('inquirer');
  const result = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'values',
      message: question,
      choices,
    },
  ]);
  return result.values;
}

type SetupStep = {
  title: string;
  run: () => Promise<void>;
};

export async function runSetup(): Promise<void> {
  console.clear();
  showBanner();

  console.log(chalk.cyan('\n  Welcome to the Lobster setup!'));
  console.log(chalk.dim('  Let me help you get your personal AI assistant configured.\n'));
  console.log(chalk.dim('  Press Ctrl+C anytime to cancel.\n'));

  const config = loadConfig();

  const steps: SetupStep[] = [
    {
      title: 'LLM Setup',
      run: async () => {
        log('🦞', 'Let\'s connect your lobster brain...\n');

        const provider = await select(
          'Which LLM provider do you want to use?',
          ['ollama (local - recommended)', 'openai (cloud)'],
          'ollama (local - recommended)'
        );

        if (provider.startsWith('ollama')) {
          const model = await prompt(
            'Which Ollama model? (e.g., gemma4, llama3.2, mistral)',
            config.llm.model
          );
          const baseUrl = await prompt(
            'Ollama base URL:',
            config.llm.ollamaBaseUrl
          );
          updateConfig({
            llm: {
              provider: 'ollama',
              model,
              ollamaBaseUrl: baseUrl,
              temperature: 0.8,
              maxTokens: 2048,
              openaiModel: '',
            },
          } as typeof config);

          log('✓', `Ollama configured with ${model}!`, chalk.green);

          const checkOllama = await confirm(
            'Check if Ollama is reachable right now?'
          );
          if (checkOllama) {
            try {
              const res = await fetch(`${baseUrl}/api/tags`);
              if (res.ok) {
                const data = await res.json();
                const models = (data.models || []).map(
                  (m: { name: string }) => m.name
                );
                log('✓', `Ollama is running! Available models: ${models.join(', ')}`, chalk.green);
                if (!models.some((m: string) => m.includes(model))) {
                  log('⚠', `"${model}" not found. Pull it with: ollama pull ${model}`, chalk.yellow);
                }
              } else {
                log('⚠', 'Ollama responded but something seems off.', chalk.yellow);
              }
            } catch {
              log('⚠', 'Could not reach Ollama. Make sure `ollama serve` is running.', chalk.yellow);
            }
          }
        } else {
          const apiKey = await prompt('OpenAI API Key:');
          const openaiModel = await prompt(
            'Model (e.g., gpt-4o-mini):',
            'gpt-4o-mini'
          );

          updateConfig({
            llm: {
              provider: 'openai',
              model: openaiModel,
              openaiApiKey: apiKey,
              openaiModel,
              temperature: 0.8,
              maxTokens: 2048,
              ollamaBaseUrl: '',
            },
          } as typeof config);

          log('✓', `OpenAI configured with ${openaiModel}!`, chalk.green);
        }
      },
    },
    {
      title: 'Chat Integrations',
      run: async () => {
        log('🦞', 'Now let\'s connect you to your chat apps...\n');

        const choices = await multiSelect(
          'Which chat apps do you want to connect? (Space to select)',
          [
            'Telegram',
            'WhatsApp',
          ]
        );

        for (const app of choices) {
          if (app === 'Telegram') {
            log('📱', 'Telegram setup', chalk.hex('#FF6B35'));
            log('', '1. Open Telegram and message @BotFather', chalk.dim);
            log('', '2. Send /newbot and follow the prompts', chalk.dim);
            log('', '3. Copy the token (looks like: 123456:ABC-DEF...)', chalk.dim);
            const token = await prompt('Paste your Telegram bot token:');
            updateConfig({
              integrations: {
                ...config.integrations,
                telegram: { enabled: true, botToken: token },
              },
            } as typeof config);
            log('✓', 'Telegram configured!', chalk.green);
          }

          if (app === 'WhatsApp') {
            log('📞', 'WhatsApp setup', chalk.hex('#25D366'));
            log('', 'WhatsApp uses QR code login — no tokens needed.', chalk.dim);
            log('', 'When you start Lobster, a QR code will appear.', chalk.dim);
            log('', 'Scan it with WhatsApp on your phone.', chalk.dim);

            const warn = await confirm(
              'Do you have Chrome/Chromium installed? (whatsapp-web.js needs it)'
            );
            if (!warn) {
              log('⚠', 'Install Chrome or Chromium first, then enable WhatsApp.', chalk.yellow);
            }

            const enable = await confirm('Enable WhatsApp integration?');
            updateConfig({
              integrations: {
                ...config.integrations,
                whatsapp: { enabled: enable },
              },
            } as typeof config);
            if (enable) log('✓', 'WhatsApp will use QR code auth on startup!', chalk.green);
          }
        }

        if (choices.length === 0) {
          log('💡', 'No integrations configured. You can always run `lobster setup` again.', chalk.yellow);
        }
      },
    },
    {
      title: 'Personality',
      run: async () => {
        log('🦞', 'Time to customize your lobster...\n');

        const theme = await select(
          'Choose a personality theme:',
          [
            'lobster (sassy seafood chef — recommended)',
            'pirate (arr, matey!)',
            'default (friendly assistant)',
          ],
          'lobster (sassy seafood chef — recommended)'
        );

        const themeMap: Record<string, string> = {
          'lobster (sassy seafood chef — recommended)': 'lobster',
          'pirate (arr, matey!)': 'pirate',
          'default (friendly assistant)': 'default',
        };

        const sassLevel = await select(
          'How much sass should your lobster have?',
          ['high (maximum crustacean attitude)', 'medium (balanced)', 'low (polite)'],
          'high (maximum crustacean attitude)'
        );

        const sassMap: Record<string, string> = {
          'high (maximum crustacean attitude)': 'high',
          'medium (balanced)': 'medium',
          'low (polite)': 'low',
        };

        const useEmojis = await confirm('Allow lobster emojis? (🦞🦀🌊)', true);

        updateConfig({
          personality: {
            name: 'Lobster',
            theme: themeMap[theme] || 'lobster',
            sassLevel: (sassMap[sassLevel] || 'high') as 'high' | 'medium' | 'low',
            quirks: true,
            emojis: useEmojis,
          },
        } as typeof config);

        log('✓', 'Personality configured! Your lobster is ready to pinch.', chalk.green);
      },
    },
    {
      title: 'Voice & Web Access',
      run: async () => {
        log('🦞', 'Voice and mobile access setup...\n');

        const enableVoice = await confirm(
          'Enable voice capabilities? (requires OpenAI API key for TTS)'
        );

        if (enableVoice) {
          const voice = await select(
            'TTS voice:',
            ['alloy (neutral)', 'echo (deep)', 'fable (British)', 'onyx (baritone)', 'nova (warm)', 'shimmer (bright)'],
            'alloy (neutral)'
          );
          const voiceMap: Record<string, string> = {
            'alloy (neutral)': 'alloy',
            'echo (deep)': 'echo',
            'fable (British)': 'fable',
            'onyx (baritone)': 'onyx',
            'nova (warm)': 'nova',
            'shimmer (bright)': 'shimmer',
          };

          updateConfig({
            voice: {
              enabled: true,
              sttModel: 'whisper-1',
              ttsVoice: voiceMap[voice] || 'alloy',
            },
          } as typeof config);

          log('✓', 'Voice enabled!', chalk.green);
          log('💡', 'Voice works best with an OpenAI API key for Whisper STT + TTS.', chalk.yellow);
        }

        const enableWeb = await confirm(
          'Enable the web dashboard? (lets you access Lobster from your phone browser)',
          true
        );

        if (enableWeb) {
          const port = await prompt('Port for web dashboard:', String(config.server.port || 3000));
          const host = await prompt('Host (0.0.0.0 = all interfaces for mobile access):', config.server.host || '0.0.0.0');

          updateConfig({
            server: {
              port: parseInt(port),
              host,
            },
          } as typeof config);

          log('✓', `Web dashboard will be available at http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`, chalk.green);
          if (host === '0.0.0.0') {
            log('💡', 'Access from your phone: find your computer\'s local IP and use that address.', chalk.yellow);
          }
        }
      },
    },
    {
      title: 'Finish & Save',
      run: async () => {
        log('🦞', 'Saving your configuration...\n');

        const envPath = join(__dirname, '..', '.env');
        if (!existsSync(envPath)) {
          const examplePath = join(__dirname, '..', '.env.example');
          if (existsSync(examplePath)) {
            writeFileSync(envPath, readFileSync(examplePath, 'utf-8'));
            log('📄', 'Created .env file from .env.example (edit for secrets)', chalk.dim);
          }
        }

        log('✓', 'Configuration saved!', chalk.green);
        log('', '', chalk.reset);

        console.log(chalk.hex('#FF6B35')('\n  ┌──────────────────────────────────────────┐'));
        console.log(chalk.hex('#FF6B35')('  │         🦞  ALL DONE!  🦞                │'));
        console.log(chalk.hex('#FF6B35')('  └──────────────────────────────────────────┘'));
        console.log('');
        console.log(chalk.cyan('  Here\'s how to start your lobster:'));
        console.log('');
        console.log(chalk.white('    npm start           ') + chalk.dim('# Start Lobster'));
        console.log(chalk.white('    npx lobster setup   ') + chalk.dim('# Run setup again'));
        console.log('');
        console.log(chalk.dim('  Make sure Ollama is running in another terminal:'));
        console.log(chalk.white('    ollama serve'));
        console.log('');
      },
    },
  ];

  for (const step of steps) {
    console.log(chalk.hex('#FF8C42')(`\n  ◆ ${step.title}`));
    console.log(chalk.dim(`  ${'─'.repeat(50)}`));
    await step.run();
  }
}

const isMain = process.argv[1]?.includes('setup');
if (isMain) {
  runSetup().catch((err) => {
    console.error(chalk.red('\n  Setup failed:'), err.message);
    process.exit(1);
  });
}
