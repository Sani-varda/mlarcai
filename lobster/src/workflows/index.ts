import { randomUUID } from 'node:crypto';
import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import type { WorkflowDefinition, WorkflowExecution, WorkflowStep, Config } from '../types.js';
import { WorkflowStatus } from '../types.js';
import { executeToolCall } from '../tools/index.js';
import { getSkillToolMap } from '../skills/index.js';
import { logger } from '../utils/logger.js';

const EXECUTIONS: Map<string, WorkflowExecution> = new Map();
const WORKFLOWS: Map<string, WorkflowDefinition> = new Map();
const APPROVAL_CALLBACKS: Map<string, (approved: boolean) => void> = new Map();
let workflowsDir = '';

export function initWorkflows(config: Config): void {
  if (!config.workflows.enabled) return;

  workflowsDir = config.workflows.directory || '';
  if (workflowsDir && existsSync(workflowsDir)) {
    loadWorkflowDefinitions();
  }
  logger.info(`Workflow engine initialized`);
}

function loadWorkflowDefinitions(): void {
  const entries = readdirSync(workflowsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile() && (extname(entry.name) === '.json' || extname(entry.name) === '.workflow')) {
      const filePath = join(workflowsDir, entry.name);
      try {
        const raw = readFileSync(filePath, 'utf-8');
        const workflow = JSON.parse(raw) as WorkflowDefinition;
        if (workflow.name) {
          WORKFLOWS.set(workflow.name, workflow);
          logger.info(`Loaded workflow: ${workflow.name} (${entry.name})`);
        }
      } catch (err: unknown) {
        const e = err as Error;
        logger.error(`Failed to load workflow ${entry.name}: ${e.message}`);
      }
    }
  }
}

export function getWorkflow(name: string): WorkflowDefinition | undefined {
  return WORKFLOWS.get(name);
}

export function getAllWorkflows(): WorkflowDefinition[] {
  return Array.from(WORKFLOWS.values());
}

export function registerWorkflow(workflow: WorkflowDefinition): void {
  WORKFLOWS.set(workflow.name, workflow);
  logger.info(`Workflow registered: ${workflow.name}`);
}

export function getExecution(id: string): WorkflowExecution | undefined {
  return EXECUTIONS.get(id);
}

export function getAllExecutions(): WorkflowExecution[] {
  return Array.from(EXECUTIONS.values());
}

function interpolate(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] ?? `{{${key}}}`);
}

export async function executeWorkflow(
  workflowName: string,
  initialInput?: Record<string, string>
): Promise<WorkflowExecution> {
  const workflow = WORKFLOWS.get(workflowName);
  if (!workflow) {
    throw new Error(`Workflow "${workflowName}" not found`);
  }

  const executionId = randomUUID();
  const execution: WorkflowExecution = {
    id: executionId,
    workflowName: workflow.name,
    status: WorkflowStatus.PENDING,
    currentStep: 0,
    steps: workflow.steps,
    results: {},
    errors: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  if (initialInput) {
    execution.results = { ...initialInput };
  }

  EXECUTIONS.set(executionId, execution);

  setImmediate(() => runWorkflow(executionId));

  return execution;
}

async function runWorkflow(executionId: string): Promise<void> {
  const execution = EXECUTIONS.get(executionId);
  if (!execution) return;

  execution.status = WorkflowStatus.RUNNING;

  const skillToolMap = getSkillToolMap();

  for (let i = 0; i < execution.steps.length; i++) {
    const step = execution.steps[i];
    execution.currentStep = i;
    execution.updatedAt = new Date();

    if (step.condition) {
      const condResult = interpolate(step.condition, execution.results);
      if (condResult.toLowerCase() === 'false' || condResult === '0' || condResult === '') {
        logger.info(`Workflow ${execution.workflowName}: step "${step.name}" skipped (condition)`);
        execution.results[step.name] = '(skipped)';
        continue;
      }
    }

    if (step.approval) {
      execution.status = WorkflowStatus.AWAITING_APPROVAL;
      execution.resumeToken = executionId;
      logger.info(`Workflow ${execution.workflowName}: awaiting approval at step "${step.name}"`);
      const approved = await waitForApproval(executionId, step);
      execution.status = WorkflowStatus.RUNNING;
      if (!approved) {
        execution.status = WorkflowStatus.CANCELLED;
        execution.errors[step.name] = 'Rejected by user';
        logger.info(`Workflow ${execution.workflowName}: cancelled at step "${step.name}"`);
        return;
      }
    }

    if (step.tool) {
      try {
        const resolvedInput: Record<string, string> = {};
        if (step.input) {
          for (const [key, val] of Object.entries(step.input)) {
            resolvedInput[key] = interpolate(val, execution.results);
          }
        }

        const toolCall = {
          id: `wf_${executionId}_${i}`,
          type: 'function' as const,
          function: {
            name: step.tool,
            arguments: JSON.stringify(resolvedInput),
          },
        };

        const skillFn = skillToolMap[step.tool];
        const result = skillFn
          ? await skillFn(...Object.values(resolvedInput))
          : await executeToolCall(toolCall);

        execution.results[step.name] = result;
        logger.info(`Workflow ${execution.workflowName}: step "${step.name}" completed`);
      } catch (err: unknown) {
        const e = err as Error;
        execution.errors[step.name] = e.message;
        if (execution.workflowName) {
          execution.results['_error'] = e.message;
        } else {
          execution.status = WorkflowStatus.FAILED;
          return;
        }
      }
    }

    execution.updatedAt = new Date();
  }

  execution.status = WorkflowStatus.COMPLETED;
  execution.updatedAt = new Date();
  logger.success(`Workflow ${execution.workflowName} completed`);
}

function waitForApproval(executionId: string, _step: WorkflowStep): Promise<boolean> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      APPROVAL_CALLBACKS.delete(executionId);
      resolve(false);
    }, 300_000);

    APPROVAL_CALLBACKS.set(executionId, (approved: boolean) => {
      clearTimeout(timeout);
      resolve(approved);
    });
  });
}

export function approveWorkflow(executionId: string): boolean {
  const cb = APPROVAL_CALLBACKS.get(executionId);
  if (cb) {
    cb(true);
    APPROVAL_CALLBACKS.delete(executionId);
    return true;
  }
  return false;
}

export function rejectWorkflow(executionId: string): boolean {
  const cb = APPROVAL_CALLBACKS.get(executionId);
  if (cb) {
    cb(false);
    APPROVAL_CALLBACKS.delete(executionId);
    return true;
  }
  return false;
}
