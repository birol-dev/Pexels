import {
  SUBMIT_BEAT_PLAN_TOOL,
  beatsFromPlan,
  buildBeatSplitSystemPrompt,
  buildBeatSplitUserMessage,
  missingBeatToolCallError,
  parseBeatPlanFromToolCall,
  splitScriptSentences,
  type PlannedBeat
} from '../llm/beat-parse-tool.ts'
import type { StructuredRequest } from '../llm/structured-request.ts'
import type { PipelineContext } from './context.ts'

export interface BeatPlanInput {
  script: string
  maxTotalDownloads: number
  avoidPeople: boolean
  style: string
  visualConcept?: string
}

/** Steps 1 and 2: the script's numbered sentences, and the one request that groups them into beats. */
export async function planBeats(
  ctx: Pick<PipelineContext, 'callStructured' | 'log'>,
  input: BeatPlanInput
): Promise<PlannedBeat[]> {
  const sentences = splitScriptSentences(input.script)
  if (sentences.length === 0) {
    throw new Error('Script parsing failed: the script has no sentences.')
  }

  const request: StructuredRequest<ReturnType<typeof parseBeatPlanFromToolCall>> = {
    tool: SUBMIT_BEAT_PLAN_TOOL,
    systemPrompt: buildBeatSplitSystemPrompt({
      maxTotalDownloads: input.maxTotalDownloads,
      avoidPeople: input.avoidPeople,
      style: input.style,
      visualConcept: input.visualConcept
    }),
    userContent: buildBeatSplitUserMessage(sentences),
    parse: parseBeatPlanFromToolCall,
    missingCallError: missingBeatToolCallError
  }
  const plan = await ctx.callStructured(request)

  // The beats are cut from the script's own sentences, so their text always matches it.
  const { beats, repaired } = beatsFromPlan(sentences, plan)
  if (repaired) {
    ctx.log(
      'info',
      `Warning: the beat plan did not end each beat at a sentence of the script, so its ends were adjusted. The script has ${sentences.length} sentences.`
    )
  }
  if (beats.length > input.maxTotalDownloads) {
    ctx.log(
      'info',
      `Warning: the script has ${beats.length} beats but the download cap is ${input.maxTotalDownloads}, so some beats will get no footage. Raise the cap to cover every beat.`
    )
  }
  return beats
}
