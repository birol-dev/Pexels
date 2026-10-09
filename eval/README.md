# Live evaluation

Unit tests cannot tell whether the footage fits the script. This folder holds ten fixed scripts that are run as real jobs against the LLM provider and Pexels, so a prompt or pipeline change can be compared with the run before it.

The evaluation is never part of `npm test`. It needs real API keys and spends real quota.

## Run it

Set the keys as environment variables, then start the runner.

PowerShell:

```powershell
$env:EVAL_OPENAI_KEY = '<your OpenAI key>'
$env:EVAL_PEXELS_KEY = '<your Pexels key>'
npm run eval
```

bash:

```bash
EVAL_OPENAI_KEY='<your OpenAI key>' EVAL_PEXELS_KEY='<your Pexels key>' npm run eval
```

Try one script first (`npm run eval -- --only 1`) before you spend a full run.

| Option                | Meaning                                                                                                        |
| --------------------- | -------------------------------------------------------------------------------------------------------------- |
| `--provider <name>`   | `openai` (default), `openrouter` or `gemini`.                                                                  |
| `--model <id>`        | Model id. The default is the app's default model for the provider.                                             |
| `--pipeline <engine>` | `loop` (default) or `pipeline`. See "The engine flag" below.                                                   |
| `--only <script>`     | Run one script: its number (`3`), id (`03-five-facts`) or file name. Repeat it, or separate names with commas. |
| `--no-download`       | Do not fetch media files. See "What a run costs".                                                              |
| `--timeout <minutes>` | Cancel a script's job after this long. The default is 30.                                                      |
| `--help`              | Show the options.                                                                                              |

Options go after `--`, for example `npm run eval -- --provider gemini --only 1,7`.

### Keys

| Variable              | Needed for              |
| --------------------- | ----------------------- |
| `EVAL_PEXELS_KEY`     | every run               |
| `EVAL_OPENAI_KEY`     | `--provider openai`     |
| `EVAL_OPENROUTER_KEY` | `--provider openrouter` |
| `EVAL_GEMINI_KEY`     | `--provider gemini`     |

The runner reads keys from these variables only. It never reads the keys you saved in the app, and it stops with a message when a variable it needs is missing.

The runner loads the app's services with the `electron` stub from `test/support`, so settings, the job registry and the secret store live in a throwaway folder (`stockfinder-test-*` in the system temp folder), not in the app's real data folder. The keys are written to that folder's secret store for the length of the run and removed when the run ends or you press Ctrl+C. If the process is killed another way, delete the `stockfinder-test-*` folders by hand: the stub does not encrypt.

### The engine flag

`--pipeline` is written to the `agentEngine` setting, and the app reads that setting to pick the engine, so `--pipeline pipeline` runs the pipeline engine. If the settings store did not keep the value, the run prints a warning, every job runs the loop, and the summary says the request was ignored.

## What a run costs

**Pexels requests.** Every search the agent makes is one Pexels API request. A job makes at least one search per beat, and more when it searches both videos and photos or retries with another query. The ten scripts add up to roughly 120 beats, so expect a first full run to make somewhere between 100 and 250 requests. That is an estimate, not a measurement: the runner prints the real count per script, and `summary.md` has the total.

Pexels documents a default limit of 200 requests per hour and 20,000 per month (check the current API documentation). A first full run can reach the hourly limit. When it does, what happens depends on the app version: the Pexels client either backs off and waits for the quota to reset (the job is cancelled at `--timeout` if that takes too long), or pauses the job. A paused job is reported as `paused` and the run moves on to the next script. To stay under the limit, run the scripts in two halves an hour apart: `--only 1,2,3,4,5`, then `--only 6,7,8,9,10`.

**The cache.** Answers of the Pexels API (searches and lookups by id) are saved in `eval-cache/`, one JSON file per request, named after the URL path and its sorted query parameters. A later run that makes the same request gets the saved answer and spends no quota. Two things follow:

- Two prompt versions that search for the same thing are judged on the same results.
- A model does not write the same queries every time, so a re-run usually still makes some live requests. The summary shows how many were live and how many were replayed.

A replayed answer carries rate-limit headers, so the app's quota tracking keeps working: the newest live values of the current run, or the recorded ones while their window is still open. The cache never expires. Delete `eval-cache/` to start again with fresh results. Only successful answers are saved, and the API key is not part of a cache file.

**Media downloads.** Media files are not cached. Every run downloads its picks again into the run folder; these are downloads from the Pexels CDN, not API requests. A full run can download more than a hundred files, and videos are large. With `--no-download` the runner answers every media request with a small placeholder file instead. The metrics still work, because they are computed from the metadata in the job's manifest, and the contact sheet shows thumbnails from the Pexels CDN either way. What you lose is real download failures: with placeholders every download succeeds.

**LLM tokens.** The summary reports LLM calls and input, cached and output tokens per script. It does not convert them to money.

## What a run writes

Each run creates `eval-results/<timestamp>/`:

| Path                       | Content                                                                           |
| -------------------------- | --------------------------------------------------------------------------------- |
| `summary.md`               | What was run, one table row per script, a total row, warnings and errors.         |
| `contact-sheet.html`       | Every beat with its thumbnails, for scoring relevance by eye.                     |
| `<script id>/report.json`  | The script's options, the job's status and errors, its metrics, beats and assets. |
| `<script id>/<job folder>` | The job's project folder as the app writes it: `manifest.json` and the media.     |

`eval-results/` and `eval-cache/` are in `.gitignore`.

The columns of `summary.md`:

| Column                              | How it is computed                                                                         |
| ----------------------------------- | ------------------------------------------------------------------------------------------ |
| Fidelity                            | The beat texts, joined in order, equal the script once whitespace is ignored.              |
| Coverage                            | Beats with at least one completed asset, divided by beats.                                 |
| Duplicates                          | Assets picked for more than one beat.                                                      |
| Orientation                         | Completed assets shaped like the platform: landscape for YouTube, portrait for the others. |
| Resolution                          | Completed videos with a long edge of at least 1,920 pixels, photos at least 1,880.         |
| Clip length                         | Completed videos that run 3 to 30 seconds.                                                 |
| LLM calls                           | HTTP requests sent to the provider.                                                        |
| Input tokens, Cached, Output tokens | Token counts from the provider's answers. Input includes the cached part.                  |
| Time (s)                            | Wall-clock seconds from the start of the job to its end.                                   |

Things to know when you read the numbers:

- The cost is counted on the wire, not taken from the app. It therefore includes the idea expansion of script 10, which the app's own usage total leaves out, and it counts requests the provider rejected or the app retried. `report.json` has the app's total as `runnerUsage` for comparison.
- Orientation and Resolution use the width and height in the manifest. Those are the dimensions of the variant that was downloaded, so both columns describe the files.
- In idea mode, Fidelity compares the beats with the script the model wrote from the idea.
- The app's module-level state (search cache, circuit breakers, learned model quirks) is cleared before each script, so a script's numbers do not depend on what ran before it. The Pexels quota tracker is not cleared.
- Apart from provider, model, download folder, "Avoid people & faces" and the engine, every job runs with the app's default settings.
- A job that fails or times out still gets a report and a row. One bad script does not end the run.

## Score relevance with the contact sheet

Relevance needs a person. Open `eval-results/<timestamp>/contact-sheet.html` in a browser. It is a single static file with no external scripts; you need to be online only because the thumbnails load from the Pexels CDN.

1. For each beat, read the text and look at the thumbnails. Clicking a thumbnail opens the downloaded file, or the asset's Pexels page when there is no file.
2. Click **Good**, **Ok** or **Bad**. Click the same button again to clear it. A workable rule: good when the footage shows what the sentence says, ok when it is related and usable, bad when it is unrelated, misleading or missing.
3. The bar at the top counts what you have scored. Scores are kept in the browser, per run, so you can close the page and come back.
4. Click **Copy scores** and paste the result into `scores.json` in the run folder. If the browser blocks the clipboard, the same JSON is under "Scores as JSON".
5. Add a line to `history.md` in this folder.

`scores.json` looks like this (`null` marks a beat you did not score):

```json
{
  "run": "2026-01-02T03-04-05Z",
  "provider": "openai",
  "model": "gpt-4o",
  "engine": "loop",
  "commit": "abc1234",
  "scoredAt": "2026-01-02T04:00:00.000Z",
  "totals": { "good": 61, "ok": 30, "bad": 9, "unrated": 0 },
  "scores": {
    "01-shorts-hook": { "beat_1": "good", "beat_2": "ok" }
  }
}
```

Scoring ten scripts takes about fifteen minutes.

## The scripts

| Script                      | What it stresses                                                         |
| --------------------------- | ------------------------------------------------------------------------ |
| `01-shorts-hook`            | A 30-second vertical hook for Shorts.                                    |
| `02-abstract-explainer`     | Abstract ideas (compound interest, focus) with little to film.           |
| `03-five-facts`             | A numbered list, with counting lines that carry no image.                |
| `04-recurring-subject`      | One subject in every sentence, which tempts duplicate picks.             |
| `05-nature-documentary`     | A nature passage, two assets per beat.                                   |
| `06-tech-brands`            | Brand and product names that stock footage cannot show.                  |
| `07-lifestyle-avoid-people` | A script about people, run with "Avoid people & faces" on.               |
| `08-deep-dive`              | Three minutes and 38 sentences against a download cap of 20.             |
| `09-german`                 | German narration that must stay German while the queries are in English. |
| `10-idea-mode`              | An idea, not a script: the job expands it first.                         |

A script is a text file in `scripts/`. It starts with the job options between two `---` lines, one `key: value` per line, and the narration follows. The files are `.txt` so that Prettier leaves the narration alone.

| Key                 | Values                                                      | Default           |
| ------------------- | ----------------------------------------------------------- | ----------------- |
| `title`             | The job title. Required.                                    |                   |
| `platform`          | `YouTube`, `Shorts`, `TikTok`, `Instagram Reels`. Required. |                   |
| `about`             | What the script stresses. Shown on the contact sheet.       | empty             |
| `style`             | The visual style, as in the app.                            | `cinematic`       |
| `mix`               | `videos only`, `photos only`, `videos + photos`.            | `videos + photos` |
| `maxAssetsPerBeat`  | 1 to 10.                                                    | 1                 |
| `maxTotalDownloads` | 1 to 100.                                                   | 15                |
| `searchMode`        | `focused` or `broad`.                                       | `focused`         |
| `avoidPeople`       | `true` turns on "Avoid people & faces" for the job.         | `false`           |
| `inputMode`         | `idea` makes the text below an idea to expand.              | `script`          |
| `targetDuration`    | Idea mode: the target length, for example `30s`.            | the app's default |
| `tone`              | Idea mode: the narration tone.                              | the app's default |

To add a script, add a file with the next number. Keep the existing ones as they are: changing a script breaks the comparison with earlier runs.

## Where the code is

| File                            | Role                                                                    |
| ------------------------------- | ----------------------------------------------------------------------- |
| `scripts/eval-agent.mts`        | The command line. Reads the keys, checks the stub is loaded, prints.    |
| `scripts/eval/args.ts`          | Options and key variables.                                              |
| `scripts/eval/eval-scripts.ts`  | Reads the script files.                                                 |
| `scripts/eval/run-eval.ts`      | Runs a script as a job through the app's `AgentRunner`; writes the run. |
| `scripts/eval/eval-network.ts`  | Sits in front of `fetch`: routes to the cache and the meter.            |
| `scripts/eval/pexels-cache.ts`  | The record/replay cache.                                                |
| `scripts/eval/llm-meter.ts`     | Counts LLM requests and tokens.                                         |
| `scripts/eval/metrics.ts`       | The metric functions.                                                   |
| `scripts/eval/report.ts`        | The shape of `report.json`, and `summary.md`.                           |
| `scripts/eval/contact-sheet.ts` | `contact-sheet.html`.                                                   |

The tests in `test/eval/` run the same code on the fake network of `test/support`, so they need no keys and reach no server.

The runner and its tests are listed in `tsconfig.node.json`, so `npm run typecheck` checks them together with the app. `npm test` runs `test/eval/` with the rest of the suite; the live run itself is only `npm run eval`.
