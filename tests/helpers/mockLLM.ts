import type { Message, MCPResponse, MessageRole } from '../../types';

export interface MockToolCall {
  name: string;
  args: Record<string, unknown>;
  result?: MCPResponse;
}

export interface MockAgentLoopOptions {
  toolSequences: MockToolCall[][];
  throwOnUnexpected?: boolean;
}

export function createMockAgentLoop(options: MockAgentLoopOptions) {
  const { toolSequences } = options;
  let sequenceIndex = 0;

  return async function mockAgentLoop(
    _history: Message[],
    _context: string,
    _frozenMessages?: { role: 'user' | 'system'; content: string }[],
    onToolResult?: (toolName: string, args: Record<string, unknown>, result: MCPResponse) => void,
  ): Promise<{
    toolMessages: Message[];
    iterationCount: number;
    promptTokens: number;
    completionTokens: number;
    cachedTokens: number;
    inlineNarration?: string;
  }> {
    if (sequenceIndex >= toolSequences.length) {
      return {
        toolMessages: [],
        iterationCount: 0,
        promptTokens: 0,
        completionTokens: 0,
        cachedTokens: 0,
      };
    }

    const currentBatch = toolSequences[sequenceIndex];
    sequenceIndex++;

    const toolMessages: Message[] = [];

    for (const toolCall of currentBatch) {
      const msg: Message = {
        id: `mock-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        role: 'tool' as MessageRole,
        text: '',
        timestamp: Date.now(),
        isToolCall: true,
        toolCallId: `call_${toolCall.name}`,
      };

      if (onToolResult && toolCall.result) {
        onToolResult(toolCall.name, toolCall.args, toolCall.result);
      }

      toolMessages.push(msg);
    }

    return {
      toolMessages,
      iterationCount: toolMessages.length > 0 ? 1 : 0,
      promptTokens: 100,
      completionTokens: 50,
      cachedTokens: 0,
    };
  };
}

export function makeToolCall(name: string, args: Record<string, unknown> = {}, result?: MCPResponse): MockToolCall {
  return { name, args, result };
}

export function makeSuccessResult(data: Record<string, unknown> = {}, message = 'OK'): MCPResponse {
  return { success: true, data, message };
}

export function makeFailResult(message = 'Failed'): MCPResponse {
  return { success: false, data: {}, message };
}
