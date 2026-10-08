import type { LlmToolTurnResult, NormalizedToolDefinition } from './llm-provider.ts'

/**
 * One request that makes the model call one tool and nothing else: the beat split, a ranking
 * batch, a broader search. The runner sends it with the job's provider and model, counts its
 * tokens, and hands the tool's arguments to `parse`.
 */
export interface StructuredRequest<T> {
  tool: NormalizedToolDefinition
  systemPrompt: string
  userContent: string
  /** Reads the tool call's JSON arguments. A throw fails the request. */
  parse(argumentsJson: string): T
  temperature?: number
  /** Names the request in the log line for its token use. Without one, no line is logged. */
  label?: string
  /** The error to throw when the model does not call the tool. */
  missingCallError?(response: LlmToolTurnResult): Error
}
