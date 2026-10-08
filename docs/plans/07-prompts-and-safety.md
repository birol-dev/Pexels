# Plan 07: Prompts and Safety

Status: proposed · Size: M · Depends on: plan 04 (downloads queued in code), plan 05 (slim results, code-picked variants), plan 03 phase 5 (the eval set, to compare before and after)

## Why

The prompts have improved (PR #4), but they still carry rules for work that code does or should do, a few contradictions, and settings that reach the model as a bare word with no instruction. The beat split makes the model retype the whole script and then checks the copy. Two Settings toggles promise filtering that only exists as a sentence in a prompt. Every one of these costs tokens on each call, or tells the user something that isn't true.

## Current state (audited)

### StockScout system prompt (`search-mode.ts`, `buildStockScoutSystemPrompt`, lines 56 to 140)

What to keep: the Pexels query rules (lines 27 to 33), the honest "What you can see" paragraph (line 98), the turn budget note (line 66), and the per-mode guidance blocks.

What's wrong:

| Line       | Text                                                                                                              | Problem                                                                                                                                                                                                                                      |
| ---------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 77         | "a careful stock-media research agent for YouTube creators"                                                       | Three of the four platforms aren't YouTube.                                                                                                                                                                                                  |
| 78         | "…select useful assets for each visual beat, and download them"                                                   | After plan 04, the model doesn't download anything.                                                                                                                                                                                          |
| 86         | Rule 6: "Use videos for motion-heavy beats and photos for object, portrait, texture, or establishing-shot beats." | It competes with the asset-mix line (119). In "videos only" mode, it tells the model to look for photos.                                                                                                                                     |
| 90         | Rule 9: "Never claim an asset was downloaded unless the tool result confirms it."                                 | A chatbot-era rule. Nothing the model says is shown to the user as fact.                                                                                                                                                                     |
| 91         | Rule 10: "Respect the user's max assets and preferred asset mix."                                                 | Code enforces both (`selectionBudgetViolation`, `canUseAssetType`).                                                                                                                                                                          |
| 92         | Rule 11: "When you are done, reply with a short plain-text summary…"                                              | The loop exits before asking the model once every beat is covered (agent-runner lines 1000 to 1009), so the summary only appears when the model stops early, and then the runner answers it with a nudge. Finalize already logs the outcome. |
| 70         | `'No strict content filtering.'` when "Skip explicit" is off                                                      | Reads like permission. Saying nothing is the neutral choice.                                                                                                                                                                                 |
| 72         | "AVOID queries containing people…"                                                                                | Capitals, and it duplicates line 33's better advice ("search for objects, places, or nature").                                                                                                                                               |
| 12         | Broad mode: "Still obey skipExplicit / avoidPeople settings exactly as configured."                               | Uses internal setting names the model never sees as such.                                                                                                                                                                                    |
| 107        | Variant paragraph                                                                                                 | Code picks the variant after plan 05 phase 2.                                                                                                                                                                                                |
| 102        | "compare width and height"                                                                                        | Searches default to the platform's shape after plan 05 phase 2.                                                                                                                                                                              |
| 118        | `Visual Style: ${input.style}`                                                                                    | A bare word ("cinematic") with no instruction attached.                                                                                                                                                                                      |
| 119        | Asset Mix with a parenthetical rule                                                                               | Code can enforce this by not offering the disallowed search tool at all.                                                                                                                                                                     |
| 109        | "When rejecting assets, give a short reason…"                                                                     | Both `selections[].reason` and `rejections[].reason` are required (`tool-schemas.ts` lines 32 and 42), so every selection costs output tokens for a reason that is only logged.                                                              |
| 130 to 135 | Workflow steps 1 to 4                                                                                             | Step 3 is the download call, which plan 04 removes.                                                                                                                                                                                          |

### Beat split (`beat-parse-tool.ts`, and `parseScriptIntoBeats` at agent-runner lines 857 to 960)

- The model returns `{ text, visualPrompt }` per beat. `text` must be the script copied verbatim (rule 1, line 90), so output tokens grow with script length.
- `findScriptMismatch` (lines 111 to 124) compares the copy word by word. On a mismatch, the runner retries once with the script plus a note naming the first difference (agent-runner lines 921 to 939), without showing the model its previous answer. If the retry is also off, it continues with the first attempt and a dropped sentence never gets footage.
- Rule 3 (line 92) caps the number of beats at `maxTotalDownloads`.
- The prompt receives only `maxTotalDownloads` and `avoidPeople` (agent-runner lines 872 to 875). Visual style and the idea's visual concept are not passed.
- The output is one `visualPrompt` per beat. The StockScout then turns that into queries itself, a second paraphrase. docs/02's original design had the beat step produce queries and a preferred asset type.

### Idea expander (`idea-expander.ts`)

- Line 153: "You are a world-class video producer, viral content scriptwriter, and stock b-roll creative director." A persona line that adds nothing a task statement wouldn't.
- `keyThemes` is requested (lines 54 to 58), parsed, and typed in the renderer store (lines 159 and 421), but never shown or used.
- `visualConcept` is shown in the UI (`GeneratedScriptPreview.tsx`, `concept-card.tsx`) and saved in the manifest, but never reaches the beat split or the StockScout.
- It doesn't know about "Avoid people". Line 162 asks for scenes with "places, people, objects…", and the beat split then has to write around the people.

### Nudge messages (agent-runner lines 1083 to 1142, `search-mode.ts` lines 211 to 227)

- "You replied with text, but selected assets are still pending download. Call download_selected_assets now…" Plan 04 removes this one.
- "You replied with text, but you did not execute any search tools. You must call search_pexels_photos or search_pexels_videos now… Call the search tools now."
- The Broad nudge: "…use a DIFFERENT broader query…".

Each nudge is another full-context model call. They exist because the model controls the flow. Plan 08 removes nearly all of them. Until then, they should at least be short and calm.

### Safety settings exist only in prompts

`skipExplicitQueries` and `avoidPeopleAndFaces` are read in exactly two places: the beat-split prompt (`avoidPeople` only) and the StockScout prompt. No code checks queries or results. Yet `SafetyPanel.tsx` describes "Skip explicit content" as "Filter sensitive results" (line 21). Pexels returns `alt` text for photos, and video URLs carry a descriptive slug, so a people filter in code is possible.

### Beat count and assets per beat

- The default form has `maxAssetsPerBeat: 3` and `maxTotalDownloads: 15` (`script-input/constants.ts` lines 100 and 101).
- The loop stops once every beat has one asset (`areBeatsSatisfiedForLoop`). The prompt says "give every beat at least one asset before any beat gets extras". So "max per beat" is an upper bound that nothing works toward: a beat gets extras only if the model happens to pick them in the same call as the first.
- The beat count is capped by the download cap (beat-split rule 3). A three-minute script (about 450 words) gets at most 15 beats of about 30 words, around 12 seconds each, unless the user raises the cap. Nothing tells them that before the run.

## Goals

- The StockScout prompt covers query writing and relevance. Code owns workflow, caps, mix, variants, and orientation.
- Visual style, visual concept, and the people setting reach every prompt that writes queries.
- Beat text matches the script by construction, with no retry.
- The beat step produces queries and an asset-type preference, so later steps don't paraphrase again.
- The safety toggles do something in code, and their labels say exactly what.
- The user sees how many shots a script needs before starting.

## Non-goals

- Replacing the loop. Plan 08 does that and reuses this plan's beat step as its planning step.
- Vision-based checks. Plan 08 phase 5.

## Key decisions

| Decision                             | Choice                                                                           | Why                                                                                         |
| ------------------------------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Beat boundaries                      | Code splits sentences. The model returns where each beat ends.                   | Coverage and order are guaranteed, and output tokens no longer grow with script length.     |
| Disallowed asset types               | Don't offer that search tool                                                     | A tool that isn't offered can't be called. That removes a rule and a runtime error path.    |
| Reasons on selections and rejections | Optional                                                                         | They're only logged and shown in the rejected-assets list. A short reason is still welcome. |
| People filter                        | A word list over alt text and URL slugs, labeled "best effort"                   | Cheap and testable. Pexels has no people metadata, and vision checks are plan 08's job.     |
| Style                                | One line of concrete guidance per preset. Custom text passes through as written. | The model can't act on a bare word.                                                         |

## Phases

### Phase 1: Remove dead rules and contradictions (S)

Do this after plans 04 and 05, which remove the download step and variant choice.

1. **Tools by asset mix.** In `runAgentLoop` (line 985), replace `const tools = AGENT_TOOLS` with:

   ```ts
   const tools = AGENT_TOOLS.filter(
     (t) =>
       (t.name !== 'search_pexels_videos' || this.canUseAssetType('video')) &&
       (t.name !== 'search_pexels_photos' || this.canUseAssetType('photo'))
   )
   ```

   Keep the runtime check in the search branches (lines 1333 to 1335) as a guard.

2. **Rewrite the rule list.** Proposed text for lines 77 to 92:

   ```text
   You are StockScout. You find Pexels stock footage for a narrated video, one visual beat at a time.

   Rules:
   1. Search for things a camera can film: subjects, actions, places, objects, light, and weather.
   2. No copyrighted characters, logos, brand names, or named people. Use a generic equivalent, such as "smartphone" for a phone brand.
   3. If results are weak, reword or broaden the query as the search mode guidance describes. Don't give up on a beat after one attempt.
   4. Never select the same asset for two beats.
   ```

   Then add rule 5 only when the mix allows both types: "Prefer videos for beats with motion and photos for objects, textures, or establishing shots."

3. **Safety line.** Lines 69 to 76 become:

   ```ts
   const safety = [
     input.skipExplicit ? 'Do not search for explicit or adult content.' : '',
     input.avoidPeople
       ? 'Keep people out of frame: search for objects, places, nature, or hands.'
       : ''
   ].filter(Boolean)
   ```

   Print the "Safety:" line only when the list isn't empty. In `BROAD_SEARCH_GUIDANCE` (line 12), replace the last bullet with "Follow the safety settings below."

4. **Configuration block** (lines 111 to 122): keep platform, style (phase 2 replaces it), search mode, and the caps as facts. Drop the asset-mix parenthetical: the tool list now says it.
5. **Workflow** (lines 130 to 135) becomes three steps:

   ```text
   1. Search for every beat that has no asset yet, one search call per beat, all in one reply.
   2. Select the best result for each beat in one select_assets_for_download call. Selecting starts the download.
   3. Repeat for beats whose results were weak. When every beat has an asset, stop calling tools. Nothing else is needed.
   ```

   Delete line 137's tool list ("Available tools: …"). The tool definitions already list them.

6. **Optional reasons.** In `SelectAssetsForDownloadArgsSchema`, make `reason` `.optional()` in both arrays, and drop it from both `required` lists. Change line 109 to "You may add a 2 to 4 word reason to a rejection, such as off topic or wrong shape. Reject only results you considered and ruled out." Handle a missing reason where rejections are stored (`beat.rejectedAssets[].reason`): store `'Not chosen'`.
7. **Nudges.** Shorter and calm, no capitals:
   - Search nudge (line 1132): `${pendingBeats.length} beats still need footage, for example ${pendingSample}. Search for them now.`
   - Broad nudge (`search-mode.ts` line 226): `${needy.length} beats have no usable results yet (${sample}). Search again with a broader query: drop adjectives or try a synonym, place, or mood.` Change the per-beat note at line 220 to `tried "${tried[0]}"`.
8. Update `test/prompt-quality.test.ts`:
   - Remove assertions for deleted text.
   - Add "offers only the search tools the mix allows".
   - Add "has no rule about claiming downloads or writing a summary".
   - Add "no word in capitals except tool names and acronyms": a regex for `\b[A-Z]{4,}\b` that ignores an allowlist.

### Phase 2: Style, visual concept, and the people setting reach the prompts (S)

1. **Style guidance.** Add `src/main/services/agent/style-guidance.ts`:

   ```ts
   const STYLE_GUIDANCE: Record<string, string> = {
     cinematic:
       'Favor wide establishing shots, slow motion, dramatic light (golden hour, night, silhouettes), and shallow depth of field.',
     documentary:
       'Favor real places and people at work, handheld shots, and natural light. Avoid staged studio shots.',
     business:
       'Favor offices, meetings, laptops, charts, and city buildings. Clean, bright, and modern.',
     tech: 'Favor screens, code, circuit boards, data centers, neon light, and modern interiors.',
     nature:
       'Favor landscapes, wildlife, plants, water, and weather. Avoid city scenes unless the beat needs one.',
     lifestyle: 'Favor candid everyday moments at home, in cafes, and outdoors, in natural light.',
     abstract: 'Favor textures, light leaks, particles, patterns, macro shots, and ink in water.'
   }

   /** The style picker sends this when the custom style box is left empty. */
   const EMPTY_CUSTOM_STYLE = 'custom style'

   /** One line telling the model what the chosen style changes. Custom styles pass through as written. */
   export function describeVisualStyle(style: string): string {
     if (style === EMPTY_CUSTOM_STYLE) return ''
     return STYLE_GUIDANCE[style] ?? `The user describes the style as: "${style.slice(0, 200)}".`
   }
   ```

   A custom style arrives as the user's own text, because `StylePicker.tsx` writes it into `style` (lines 25 and 50). When the box is empty, it sends the placeholder `'custom style'`, which gets no guidance line.

2. **StockScout:** replace line 118 with `- Visual style: ${input.style}. ${describeVisualStyle(input.style)}` and, when present, `- Visual direction for this video: ${input.visualConcept}`. Add `visualConcept?: string` to `BuildStockScoutSystemPromptInput`.
3. **Beat split:** add `style` and `visualConcept` to `BeatSplitPromptInput`, with a line in the prompt: "Visual style: … Write visual prompts and queries that fit it." Pass both from `parseScriptIntoBeats` (agent-runner lines 872 to 875).
4. **Idea expander:**
   - Replace the persona and mission lines (153 to 157) with: "Write a voiceover script for a short video from the creator's idea, a one-paragraph visual direction for finding stock footage, and a title."
   - Drop `keyThemes` from the tool schema, the parser, `ExpandedScriptResult`, and the renderer types (`store.ts` lines 159 and 421).
   - Add `avoidPeople?: boolean` to `ExpandIdeaParams`. When it's set, add: "The creator wants no people on screen. Write sentences whose images can be places, objects, nature, or hands." Pass it from `jobs:expandIdea` and `expandIdeaIfNeeded`.
5. Tests:
   - `describeVisualStyle` for each preset, for custom text (including truncation), and for the empty-custom placeholder.
   - The prompt-quality tests check that style guidance and visual direction appear when given.
   - The idea-expander test checks that the people line appears only when the setting is on.

### Phase 3: Beat split by sentence boundaries (M)

1. **Split sentences in code.** Add to `beat-parse-tool.ts`:

   ```ts
   /** Sentences of the script, in order. Very long sentences are cut into chunks so a beat stays short. */
   export function splitScriptSentences(script: string, maxWords = 40, chunkWords = 15): string[] {
     const segmenter = new Intl.Segmenter(undefined, { granularity: 'sentence' })
     const sentences = [...segmenter.segment(script)].map((s) => s.segment.trim()).filter(Boolean)
     return sentences.flatMap((sentence) => {
       const words = sentence.split(/\s+/)
       if (words.length <= maxWords) return [sentence]
       const chunks: string[] = []
       for (let i = 0; i < words.length; i += chunkWords)
         chunks.push(words.slice(i, i + chunkWords).join(' '))
       return chunks
     })
   }
   ```

   `Intl.Segmenter` ships with Node 22 and Electron's full ICU. It may split after abbreviations such as "Dr.". That's harmless here, because the model groups sentences back into beats.

2. **New tool.** Replace `SUBMIT_SCRIPT_BEATS_TOOL` with:

   ```ts
   export const SUBMIT_BEAT_PLAN_TOOL: NormalizedToolDefinition = {
     name: 'submit_beat_plan',
     description:
       'Group the numbered script sentences into visual beats and plan footage for each beat.',
     parameters: {
       type: 'object',
       properties: {
         beats: {
           type: 'array',
           description:
             'Beats in script order. Each beat starts right after the previous one ends.',
           items: {
             type: 'object',
             properties: {
               lastSentence: {
                 type: 'integer',
                 description: 'Number of the last sentence in this beat.'
               },
               visualPrompt: {
                 type: 'string',
                 description: 'What the footage shows, 3 to 8 words.'
               },
               queries: {
                 type: 'array',
                 items: { type: 'string' },
                 description: '2 or 3 Pexels queries of 1 to 4 words, most specific first.'
               },
               assetType: {
                 type: 'string',
                 enum: ['video', 'photo', 'either'],
                 description:
                   'video for motion, photo for objects, textures, or establishing shots.'
               }
             },
             required: ['lastSentence', 'visualPrompt', 'queries', 'assetType']
           }
         }
       },
       required: ['beats']
     }
   }
   ```

   Only the end of each beat is needed, because beats are contiguous. That leaves fewer ways for the output to be invalid.

3. **Build beats deterministically**, repairing instead of retrying:

   ```ts
   export interface PlannedBeat {
     text: string
     visualPrompt: string
     queries: string[]
     assetType: 'video' | 'photo' | 'either'
   }

   /**
    * Turns the model's beat ends into beats that cover every sentence once, in order.
    * Out-of-range or non-increasing ends are clamped. Sentences after the last beat join it.
    */
   export function beatsFromPlan(
     sentences: string[],
     plan: Array<Omit<PlannedBeat, 'text'> & { lastSentence: number }>
   ): { beats: PlannedBeat[]; repaired: boolean } {
     const beats: PlannedBeat[] = []
     let start = 0
     let repaired = false
     for (const item of plan) {
       if (start >= sentences.length) {
         repaired = true
         break
       }
       const end = Math.min(Math.max(Math.trunc(item.lastSentence), start + 1), sentences.length)
       if (end !== item.lastSentence) repaired = true
       beats.push({
         text: sentences.slice(start, end).join(' '),
         visualPrompt: item.visualPrompt.trim(),
         queries: item.queries
           .map((q) => q.trim())
           .filter(Boolean)
           .slice(0, 3),
         assetType: item.assetType
       })
       start = end
     }
     if (start < sentences.length && beats.length > 0) {
       beats[beats.length - 1].text += ' ' + sentences.slice(start).join(' ')
       repaired = true
     }
     return { beats, repaired }
   }
   ```

   Sentence numbers are 1-based in the prompt and `end` is exclusive in the slice, so `lastSentence` maps directly to `end`.

4. **Prompt.** The user message lists numbered sentences, one per line: `[1] The market crashed overnight.` The system prompt rules become:

   ```text
   1. Group consecutive sentences into beats. A beat changes when the picture should change: about 8 to 15 spoken words, or 3 to 6 seconds.
   2. Use at most {cap} beats.
   3. For each beat, write a visual prompt, 2 or 3 Pexels queries (1 to 4 words, English, filmable, no brands or named people), and whether it needs video, a photo, or either.
   ```

   Then the style, visual direction, and people lines from phase 2, then "Call submit_beat_plan once."

5. **Runner.** In `parseScriptIntoBeats`, call `splitScriptSentences`, send the numbered list, parse with `beatsFromPlan`, and log one line when `repaired` is true. Delete `findScriptMismatch`, `buildBeatCorrectionMessage`, and the retry (lines 921 to 939). Keep `missingBeatToolCallError`.
6. **Carry queries forward.**
   - Add `queries?: string[]` and `assetType?: 'video' | 'photo' | 'either'` to `VisualBeat`. They're optional, so old manifests load unchanged.
   - Include both in `buildBeatCatalogUserContent`.
   - Add to the StockScout prompt: "Each beat comes with suggested queries. Start with the first. Use the others if its results are weak."
   - Ignore `assetType` when the mix allows a single type.
7. **Tests:**
   - `splitScriptSentences`: punctuation, no punctuation (chunked), extra whitespace, a non-English script, abbreviations.
   - `beatsFromPlan`: exact plan; plan ending early; plan running past the end; non-increasing ends; zero or negative ends; more than 3 queries.
   - Property-style: for 200 random plans, `beats.map((b) => b.text).join(' ')` equals `sentences.join(' ')`.
   - Runner (fake LLM): a scripted `submit_beat_plan` produces beats with queries, and no retry request is sent.

### Phase 4: Safety settings that do something (S)

1. Add `src/main/services/agent/content-filters.ts`:

   ```ts
   const PEOPLE_WORDS = [
     'person',
     'people',
     'man',
     'men',
     'woman',
     'women',
     'boy',
     'boys',
     'girl',
     'girls',
     'child',
     'children',
     'kid',
     'kids',
     'baby',
     'face',
     'faces',
     'portrait',
     'crowd',
     'couple',
     'family',
     'friends',
     'businessman',
     'businesswoman',
     'student',
     'students',
     'worker',
     'workers',
     'teenager',
     'selfie'
   ]
   const PEOPLE_PATTERN = new RegExp(`\\b(${PEOPLE_WORDS.join('|')})\\b`, 'i')

   /** True when a result's description says people are in it. Silent descriptions pass. */
   export function mentionsPeople(description: string): boolean {
     return PEOPLE_PATTERN.test(description)
   }

   const EXPLICIT_WORDS = ['nude', 'naked', 'nsfw', 'porn', 'erotic', 'sexy', 'lingerie', 'topless']
   const EXPLICIT_PATTERN = new RegExp(`\\b(${EXPLICIT_WORDS.join('|')})\\b`, 'i')

   export function isExplicitText(text: string): boolean {
     return EXPLICIT_PATTERN.test(text)
   }
   ```

   "Hands" and "silhouette" are deliberately not in the people list, because the beat-split prompt suggests them as people-free alternatives.

2. **Apply in the search branches.**
   - With "Skip explicit" on, refuse a query for which `isExplicitText(query)` is true. Return a tool error: "That query is blocked by the Skip explicit setting."
   - Drop results whose description (alt text or URL slug) matches the active filters. Do this before they're cached in `pexelsCandidates`, so they can't be selected either. Add `filtered: n` to the tool result. When everything was filtered, add the note: "All results were hidden by the safety settings. Search for objects or places instead."
3. **Honest labels** in `SafetyPanel.tsx`:
   - "Skip explicit content": "Blocks explicit search terms and hides results described as explicit. Best effort."
   - "Avoid people & faces": "Hides results whose description mentions people. Best effort: videos are judged by their title only."
4. Check Pexels' content guidelines on what uploads are allowed, and add one sentence to the README's privacy and safety section.
5. **Tests:**
   - Unit: `mentionsPeople` covers plurals, possessives ("woman's"), word boundaries ("manhattan" passes, "human" passes), and case.
   - Unit: `isExplicitText`.
   - Runner: with "Avoid people" on, a fixture result whose alt text says "woman walking" is not offered and can't be selected.

### Phase 5: Shot count before the run, and what "per beat" means (S, part optional)

1. **Recommend a shot count.** Add `src/shared/shot-count.ts` (plan 01 creates `src/shared`):

   ```ts
   /** About one shot per 12 spoken words: 3 to 6 seconds at a normal voiceover pace. */
   export function recommendedShotCount(script: string): number {
     const words = script.trim().split(/\s+/).filter(Boolean).length
     return Math.max(1, Math.ceil(words / 12))
   }
   ```

   In the script input form, next to the download cap, show "About N shots for this script." When the cap is lower: "Your cap of M leaves some sentences without footage" and a button "Set cap to N", limited to the schema's maximum of 100.

2. **Decide what "Max assets per beat" means.** Today it's an upper bound nothing works toward. Pick one:
   - **Recommended: rename it to "Options per beat", default 1.** Make it a target: a beat is satisfied when it has `min(target, its share of the cap)` usable assets. That's a change to `getUnfulfilledBeats` and `areBeatsSatisfiedForLoop` (pure, tested), plus the workflow line "select N options for each beat". Editors who want alternatives set it to 2 or 3.
   - **Or remove it**, if no one uses alternatives. Every beat gets one asset, which is today's behavior in practice.

   Plan 08's slot allocation implements the target natively, so if plan 08 is close, do the rename there.

### Phase 6: Measure (S)

1. Run plan 03's eval set on `main` before phase 1, and again after phases 1 to 3.
2. Record per script: relevance score (human, 1 to 5 per beat), beats covered, beat count compared with `recommendedShotCount`, input and output tokens, and turns.
3. Ship if relevance holds or improves and tokens go down. If relevance drops on one style, adjust that style's guidance line and re-run only that script.

## Risks and mitigations

| Risk                                                                                                               | Mitigation                                                                     |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Removing rules changes behavior in ways the tests don't see                                                        | Phase 6's eval comparison, and plan 03's runner tests for the flows.           |
| Sentence splitting fails on scripts with no punctuation                                                            | Long sentences are chunked by words. Test that case explicitly.                |
| The people filter hides good results ("hands of a man typing") or misses people (videos without descriptive slugs) | Labeled best effort. Plan 08 phase 5's thumbnail ranking can tighten it later. |
| Style lines push results toward clichés                                                                            | Each line is one sentence. Evaluate per style in phase 6.                      |

## Open questions

- Should "Avoid people" be strict, refusing every result whose description is empty, at the cost of hiding many videos? Today's proposal lets silent descriptions pass.
- Is the 12-words-per-shot pace right for the target platforms? Short-form editors may cut faster (8 words). It could depend on the platform.
