import { z } from 'zod';

import { canonicalJson, sha256Hex } from './hash.js';
import { sampleFromSchema } from './json-schema.js';

import type { Usage } from './calls.js';
import type { Fixture } from './fixtures.js';

/** `created` timestamp of every response (2026-01-01T00:00:00Z), so responses are reproducible. */
export const FIXED_CREATED = 1_767_225_600;

/** Content returned when `/__control` injects `malformedJson`: deliberately not valid JSON. */
export const MALFORMED_JSON = '{"mock": "malformed output", "truncated": [1, 2,';

const ContentPart = z.looseObject({ type: z.string(), text: z.string().optional() });

const Message = z.looseObject({
  role: z.enum(['system', 'developer', 'user', 'assistant', 'tool', 'function']),
  content: z.union([z.string(), z.array(ContentPart), z.null()]).optional(),
});
type Message = z.infer<typeof Message>;

const Tool = z.looseObject({
  type: z.literal('function'),
  function: z.looseObject({
    name: z.string().min(1),
    description: z.string().optional(),
    parameters: z.record(z.string(), z.unknown()).optional(),
  }),
});

const ResponseFormat = z.discriminatedUnion('type', [
  z.looseObject({ type: z.literal('text') }),
  z.looseObject({ type: z.literal('json_object') }),
  z.looseObject({
    type: z.literal('json_schema'),
    json_schema: z.looseObject({
      name: z.string().min(1),
      schema: z.record(z.string(), z.unknown()).optional(),
      strict: z.boolean().nullish(),
    }),
  }),
]);

const ToolChoice = z.union([
  z.enum(['none', 'auto', 'required']),
  z.looseObject({
    type: z.literal('function'),
    function: z.looseObject({ name: z.string().min(1) }),
  }),
]);

/** The subset of the Chat Completions request that the mock understands. Unknown keys pass. */
export const ChatCompletionRequest = z.looseObject({
  model: z.string().min(1),
  messages: z.array(Message).min(1),
  response_format: ResponseFormat.optional(),
  tools: z.array(Tool).optional(),
  tool_choice: ToolChoice.optional(),
  stream: z.boolean().nullish(),
});
export type ChatCompletionRequest = z.infer<typeof ChatCompletionRequest>;

export class ChatRequestError extends Error {
  override name = 'ChatRequestError';
  constructor(
    message: string,
    readonly param: string | null = null,
  ) {
    super(message);
  }
}

export function messageText(message: Message): string {
  const { content } = message;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((part) => part.text ?? '').join('');
  return '';
}

/** Text of the first `system` or `developer` message, where a prompt marker may live. */
export function systemText(messages: readonly Message[]): string | undefined {
  const system = messages.find((m) => m.role === 'system' || m.role === 'developer');
  return system === undefined ? undefined : messageText(system);
}

/** Rough token estimate (4 characters per token), never 0 for non-empty text. */
export function estimateTokens(text: string): number {
  return text.length === 0 ? 0 : Math.ceil(text.length / 4);
}

interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ChatCompletion {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  system_fingerprint: string;
  choices: {
    index: 0;
    message: {
      role: 'assistant';
      content: string | null;
      refusal: null;
      tool_calls?: ToolCall[];
    };
    logprobs: null;
    finish_reason: 'stop' | 'length' | 'content_filter' | 'tool_calls';
  }[];
  usage: Usage;
}

export interface CompletionOutcome {
  completion: ChatCompletion;
  /** Fixture file, or `fallback`. */
  source: string;
}

/**
 * Builds the deterministic completion for a validated request. The same request (and fixture
 * set) always yields byte-identical output.
 */
export function buildCompletion(
  request: ChatCompletionRequest,
  fixture: Fixture | undefined,
  promptId: string | null,
  options: { malformedJson: boolean },
): CompletionOutcome {
  if (request.stream === true) {
    throw new ChatRequestError('stream: true is not supported by the mock yet', 'stream');
  }
  const requestHash = sha256Hex(
    canonicalJson({
      model: request.model,
      messages: request.messages,
      response_format: request.response_format,
      tools: request.tools,
      tool_choice: request.tool_choice,
    }),
  );
  const toolCallId = (index: number): string =>
    `call_mock_${sha256Hex(`${requestHash}:${String(index)}`).slice(0, 24)}`;

  let content: string | null = null;
  let toolCalls: ToolCall[] | undefined;
  let finishReason: ChatCompletion['choices'][number]['finish_reason'] = 'stop';

  if (fixture !== undefined) {
    const { response } = fixture;
    if ('content' in response) {
      content = response.content;
      finishReason = response.finishReason ?? 'stop';
    } else if ('toolCalls' in response) {
      toolCalls = response.toolCalls.map((call, index) => ({
        id: toolCallId(index),
        type: 'function',
        function: { name: call.name, arguments: JSON.stringify(call.arguments) },
      }));
      finishReason = 'tool_calls';
    } else {
      content = JSON.stringify(response.json);
    }
  } else {
    const tool = chooseFallbackTool(request);
    if (tool !== undefined) {
      const parameters = tool.function.parameters ?? { type: 'object', properties: {} };
      toolCalls = [
        {
          id: toolCallId(0),
          type: 'function',
          function: {
            name: tool.function.name,
            arguments: JSON.stringify(sampleFromSchema(parameters) ?? {}),
          },
        },
      ];
      finishReason = 'tool_calls';
    } else if (request.response_format?.type === 'json_schema') {
      const schema = request.response_format.json_schema.schema ?? { type: 'object' };
      content = JSON.stringify(sampleFromSchema(schema));
    } else if (request.response_format?.type === 'json_object') {
      content = '{}';
    } else {
      content = `Mock completion for ${promptId ?? 'an untagged prompt'} (${requestHash.slice(0, 12)}).`;
    }
  }

  if (options.malformedJson) {
    if (toolCalls !== undefined) {
      toolCalls = toolCalls.map((call) => ({
        ...call,
        function: { ...call.function, arguments: MALFORMED_JSON },
      }));
    } else {
      content = MALFORMED_JSON;
    }
  }

  const completionText =
    content ?? (toolCalls ?? []).map((call) => call.function.arguments).join('');
  const promptTokens =
    fixture?.usage?.promptTokens ??
    estimateTokens(request.messages.map((message) => messageText(message)).join('\n'));
  const completionTokens =
    fixture?.usage?.completionTokens ?? Math.max(1, estimateTokens(completionText));

  return {
    source: fixture?.file ?? 'fallback',
    completion: {
      id: `chatcmpl-mock-${requestHash.slice(0, 24)}`,
      object: 'chat.completion',
      created: FIXED_CREATED,
      model: request.model,
      system_fingerprint: 'fp_investfund_mock',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content,
            refusal: null,
            ...(toolCalls === undefined ? {} : { tool_calls: toolCalls }),
          },
          logprobs: null,
          finish_reason: finishReason,
        },
      ],
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens,
      },
    },
  };
}

/** Tool to call when no fixture matches: only when the request forces a tool call. */
function chooseFallbackTool(
  request: ChatCompletionRequest,
): NonNullable<ChatCompletionRequest['tools']>[number] | undefined {
  const tools = request.tools ?? [];
  const choice = request.tool_choice;
  if (choice === undefined || choice === 'none' || choice === 'auto') return undefined;
  if (choice === 'required') {
    const first = tools[0];
    if (first === undefined) {
      throw new ChatRequestError('tool_choice "required" needs at least one tool', 'tool_choice');
    }
    return first;
  }
  const named = tools.find((tool) => tool.function.name === choice.function.name);
  if (named === undefined) {
    throw new ChatRequestError(
      `tool_choice names an unknown tool: ${choice.function.name}`,
      'tool_choice',
    );
  }
  return named;
}
