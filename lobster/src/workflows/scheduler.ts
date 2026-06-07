import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ScheduledTask, Config } from '../types.js';
import { executeWorkflow } from './index.js';
import { logger } from '../utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', '..', 'data');

const tasks: Map<string, ScheduledTask> = new Map();
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let cronTimers: Map<string, ReturnType<typeof setInterval>> = new Map();

function parseCronExpression(cron: string): number[] {
  const parts = cron.trim().split(/\s+/);
  if (parts.length < 5) return [];

  const minute = parts[0];
  const hour = parts[1];
  const dayOfMonth = parts[2];
  const month = parts[3];
  const dayOfWeek = parts[4];

  const matches: number[] = [];
  for (let m = 0; m < 60; m++) {
    if (cronFieldMatches(minute, m)) {
      matches.push(m);
    }
  }

  return matches;
}

function cronFieldMatches(field: string, value: number): boolean {
  if (field === '*') return true;
  if (field.includes(',')) {
    return field.split(',').some((part) => {
      if (part === '*') return true;
      if (part.includes('-')) {
        const [start, end] = part.split('-').map(Number);
        return value >= start && value <= end;
      }
      if (part.includes('/')) {
        const [range, step] = part.split('/');
        const stepNum = parseInt(step);
        if (range === '*') return value % stepNum === 0;
        const [rStart, rEnd] = range.split('-').map(Number);
        return value >= rStart && value <= rEnd && (value - rStart) % stepNum === 0;
      }
      return parseInt(part) === value;
    });
  }
  if (field.includes('-')) {
    const [start, end] = field.split('-').map(Number);
    return value >= start && value <= end;
  }
  if (field.includes('/')) {
    const [range, step] = field.split('/');
    return range === '*' ? value % parseInt(step) === 0 : false;
  }
  return parseInt(field) === value;
}

function shouldRunAt(cron: string, date: Date): boolean {
  const parts = cron.trim().split(/\s+/);
  if (parts.length < 5) return false;

  const minute = parseInt(parts[0]);
  const hour = parseInt(parts[1]);
  const dayOfMonth = parseInt(parts[2]);
  const month = parseInt(parts[3]);
  const dayOfWeek = parseInt(parts[4]);

  const cronMinute = parts[0];
  const cronHour = parts[1];
  const cronDayOfMonth = parts[2];
  const cronMonth = parts[3];
  const cronDayOfWeek = parts[4];

  if (!cronFieldMatches(cronMinute, date.getMinutes())) return false;
  if (!cronFieldMatches(cronHour, date.getHours())) return false;
  if (!cronFieldMatches(cronDayOfMonth, date.getDate())) return false;
  if (!cronFieldMatches(cronMonth, date.getMonth() + 1)) return false;
  if (!cronFieldMatches(cronDayOfWeek, date.getDay())) return false;

  return true;
}

function getTasksPath(): string {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  return join(DATA_DIR, 'scheduled-tasks.json');
}

function saveTasks(): void {
  const path = getTasksPath();
  const data: Record<string, ScheduledTask> = {};
  for (const [key, task] of tasks) {
    data[key] = task;
  }
  writeFileSync(path, JSON.stringify(data, null, 2));
}

function loadTasks(): void {
  const path = getTasksPath();
  if (!existsSync(path)) return;
  try {
    const raw = readFileSync(path, 'utf-8');
    const data = JSON.parse(raw) as Record<string, ScheduledTask>;
    for (const [key, task] of Object.entries(data)) {
      tasks.set(key, task);
    }
    logger.info(`Loaded ${tasks.size} scheduled tasks`);
  } catch {
    logger.warn('Failed to load scheduled tasks, starting fresh');
  }
}

export function addTask(task: ScheduledTask): void {
  tasks.set(task.id, task);
  saveTasks();
  scheduleTask(task);
  logger.info(`Scheduled task added: ${task.name} (${task.cronExpression})`);
}

export function removeTask(id: string): boolean {
  const removed = tasks.delete(id);
  if (removed) {
    const timer = cronTimers.get(id);
    if (timer) {
      clearInterval(timer);
      cronTimers.delete(id);
    }
    saveTasks();
    logger.info(`Scheduled task removed: ${id}`);
  }
  return removed;
}

export function getTask(id: string): ScheduledTask | undefined {
  return tasks.get(id);
}

export function getAllTasks(): ScheduledTask[] {
  return Array.from(tasks.values());
}

function scheduleTask(task: ScheduledTask): void {
  if (!task.enabled) return;

  const timer = setInterval(async () => {
    const now = new Date();
    if (shouldRunAt(task.cronExpression, now)) {
      logger.info(`Scheduler: running task "${task.name}"`);
      try {
        await executeWorkflow(task.workflowName, task.workflowInput);
        task.lastRun = now;
        saveTasks();
      } catch (err: unknown) {
        const e = err as Error;
        logger.error(`Scheduler: task "${task.name}" failed: ${e.message}`);
      }
    }
  }, 60_000);

  cronTimers.set(task.id, timer);
}

function scheduleAllTasks(): void {
  for (const task of tasks.values()) {
    if (task.enabled) {
      scheduleTask(task);
    }
  }
}

export function startScheduler(config: Config): void {
  if (!config.scheduler.enabled) {
    logger.info('Scheduler is disabled');
    return;
  }

  loadTasks();
  scheduleAllTasks();

  if (config.scheduler.heartbeatIntervalMinutes > 0) {
    const intervalMs = config.scheduler.heartbeatIntervalMinutes * 60 * 1000;
    heartbeatTimer = setInterval(async () => {
      logger.info('Heartbeat tick');
    }, intervalMs);
    logger.info(`Heartbeat every ${config.scheduler.heartbeatIntervalMinutes} minutes`);
  }

  logger.success('Scheduler started');
}

export function stopScheduler(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  for (const [, timer] of cronTimers) {
    clearInterval(timer);
  }
  cronTimers.clear();

  logger.info('Scheduler stopped');
}
