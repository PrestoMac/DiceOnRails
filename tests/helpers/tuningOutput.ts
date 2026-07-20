import * as fs from 'fs';
import * as path from 'path';
import type { GameState } from '../../types';

interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

export interface TuningEntry {
  testName: string;
  timestamp: string;
  prompt: string;
  toolsAvailable: ToolDefinition[];
  rawLLMResponse: unknown;
  gameStateBefore: GameState | null;
  gameStateAfter: GameState | null;
  tokenUsage: {
    prompt: number;
    completion: number;
    total: number;
  };
  success: boolean;
}

export class TuningReporter {
  private testName: string;
  private entries: TuningEntry[] = [];
  private tuningDir: string;

  constructor(testName: string) {
    this.testName = testName;
    this.tuningDir = path.resolve(process.cwd(), 'tuning');
    if (!fs.existsSync(this.tuningDir)) {
      fs.mkdirSync(this.tuningDir, { recursive: true });
    }
  }

  capturePrompt(prompt: string): void {
    const entry = this.getOrCreateEntry();
    entry.prompt = prompt;
  }

  captureTools(tools: ToolDefinition[]): void {
    const entry = this.getOrCreateEntry();
    entry.toolsAvailable = tools;
  }

  captureResponse(response: unknown): void {
    const entry = this.getOrCreateEntry();
    entry.rawLLMResponse = response;
  }

  captureState(before: GameState | null, after: GameState | null): void {
    const entry = this.getOrCreateEntry();
    entry.gameStateBefore = before;
    entry.gameStateAfter = after;
  }

  captureTokens(prompt: number, completion: number): void {
    const entry = this.getOrCreateEntry();
    entry.tokenUsage = { prompt, completion, total: prompt + completion };
  }

  markSuccess(success: boolean): void {
    const entry = this.getOrCreateEntry();
    entry.success = success;
  }

  async flush(): Promise<void> {
    const resultsPath = path.join(this.tuningDir, 'results.jsonl');
    for (const entry of this.entries) {
      fs.appendFileSync(resultsPath, JSON.stringify(entry) + '\n');
    }

    const failedEntry = this.entries.find(e => !e.success);
    if (failedEntry) {
      const failPath = path.join(this.tuningDir, `${this.testName}_FAIL.json`);
      fs.writeFileSync(failPath, JSON.stringify(failedEntry, null, 2));
    }

    this.entries = [];
  }

  private getOrCreateEntry(): TuningEntry {
    if (this.entries.length === 0) {
      this.entries.push({
        testName: this.testName,
        timestamp: new Date().toISOString(),
        prompt: '',
        toolsAvailable: [],
        rawLLMResponse: null,
        gameStateBefore: null,
        gameStateAfter: null,
        tokenUsage: { prompt: 0, completion: 0, total: 0 },
        success: true,
      });
    }
    return this.entries[this.entries.length - 1];
  }
}
