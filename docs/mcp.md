# Control StockFinder from your AI app

StockFinder can expose its search and download workflow through the Model Context Protocol (MCP). Your connected AI app plans the visual beats and chooses footage. StockFinder searches Pexels, downloads the files, and keeps the project visible in its desktop library.

This mode needs a **Pexels API key** and an MCP client running on the same computer. StockFinder does **not** need an OpenAI, Gemini, or OpenRouter API key. Your AI app supplies the model and handles its own account or subscription.

## Connect

1. Open StockFinder and enter your Pexels key and download folder.
2. In onboarding, choose **My AI app (MCP)**. For an existing setup, open **Settings → MCP connection**, then choose **Connected AI app (MCP)** under **Run new packs with**.
3. Check that **Enable local MCP connection** is on and the status says **MCP is listening on this computer**.
4. Choose **Configuration format** for your client, then click **Copy client configuration**. The client must support local **Streamable HTTP** connections with an `Authorization` header.
5. Keep StockFinder open while your AI app works. Ask the AI app to list your StockFinder packs or create one from a script or idea.

The connection address is `http://127.0.0.1:38477/mcp`. The copied configuration includes a private bearer token:

```json
{
  "mcpServers": {
    "stockfinder": {
      "type": "http",
      "url": "http://127.0.0.1:38477/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_PRIVATE_TOKEN"
      }
    }
  }
}
```

Replace `YOUR_PRIVATE_TOKEN` with the value from **Show configuration and private token**. Prefer copying the complete configuration from StockFinder. Keep this token private: a client with the token can read projects and control MCP packs on your computer. The app stores it using the same encrypted local storage as API keys.

The local connection is available to clients on this computer. A cloud-hosted connector cannot reach `127.0.0.1` on your computer. Use a client with local MCP support.

### Codex

Choose **Codex configuration (TOML)** and add the copied block to `~/.codex/config.toml`:

```toml
[mcp_servers.stockfinder]
url = "http://127.0.0.1:38477/mcp"
http_headers = { Authorization = "Bearer YOUR_PRIVATE_TOKEN" }
```

Reconnect the client after saving. The format follows the [official Codex MCP configuration reference](https://developers.openai.com/codex/mcp). Keep the configuration file private; it contains your local access token.

### Claude Code

Use the token shown in StockFinder:

```text
claude mcp add --transport http stockfinder http://127.0.0.1:38477/mcp --header "Authorization: Bearer YOUR_PRIVATE_TOKEN"
```

Then open Claude Code's `/mcp` screen to check the connection. This follows the [Claude Code MCP setup instructions](https://code.claude.com/docs/en/mcp). The command stores the token in Claude Code's local configuration; keep that configuration private.

## Make a pack

You can start from either app:

- In StockFinder, paste a script or enter an idea and choose **Create pack for MCP**. Ask the connected AI app to find and continue that pack.
- In your AI app, ask it to create a StockFinder pack from your script or idea, then plan the beats, search for suitable footage, choose assets, and finish the pack.

For example:

> Use StockFinder to create a pack called “City mornings” from this script: “The city wakes before sunrise. Coffee shops fill the streets.” Find one landscape video for each visual beat, keep the total under four downloads, and finish the pack when the files are ready.

For an idea-only pack, the connected AI reads your idea, tone, target duration, and visual style, writes a draft, and saves it with `stockfinder_submit_script`. StockFinder shows the draft and retains your original idea. The AI then plans the footage. The built-in API scriptwriter stays off in MCP mode.

Downloads still follow your StockFinder settings: asset mix, per-beat and total download limits, content filters, and the approval requirement. When approval is enabled, review the selected assets in StockFinder. The MCP client cannot approve them by calling resume.

Existing packs keep their original execution mode. Changing **Run new packs with** does not convert an existing API pack into an MCP pack, or an MCP pack into an API pack.

## Tools for the connected AI

Every job-specific tool takes a `jobId` returned by create or list. MCP tools can inspect existing packs; mutation tools accept MCP packs only.

| Tool                                     | Purpose                                                                               |
| ---------------------------------------- | ------------------------------------------------------------------------------------- |
| `stockfinder_status`                     | Check whether a Pexels key is configured and read relevant app constraints.           |
| `stockfinder_list_jobs`                  | Find saved and active packs.                                                          |
| `stockfinder_get_job`                    | Read progress, selections, numbered script sentences, and pack input.                 |
| `stockfinder_create_job`                 | Create an MCP pack from a script or idea.                                             |
| `stockfinder_submit_script`              | Save a finished draft before planning, keeping the original idea.                     |
| `stockfinder_submit_beat_plan`           | Map the numbered script sentences into visual beats and search queries.               |
| `stockfinder_search_pexels_photos`       | Search photos for a planned beat.                                                     |
| `stockfinder_search_pexels_videos`       | Search videos for a planned beat.                                                     |
| `stockfinder_select_assets_for_download` | Choose returned candidates; selection starts downloads or waits for desktop approval. |
| `stockfinder_download_selected_assets`   | Check or retry downloads for selected assets.                                         |
| `stockfinder_pause_job`                  | Pause an MCP pack.                                                                    |
| `stockfinder_resume_job`                 | Continue a paused MCP pack after a manual pause or restart.                           |
| `stockfinder_cancel_job`                 | Cancel an MCP pack.                                                                   |
| `stockfinder_finish_job`                 | Wait for downloads and finish once the pack meets its asset requirements.             |

Create, get, and submit-script return numbered script sentences and `waitingOn`: `script`, `beat_plan`, `desktop_approval`, `downloads`, `resume`, or `client`. A terminal pack has no pending handoff. Submit beat ends with one-based `lastSentence` values in increasing order, ending at the final sentence. Each beat also supplies `visualPrompt`, `queries`, and `assetType` (`video`, `photo`, or `either`). The app assigns IDs such as `beat_1`. Submit a plan once; create a new pack to change it.

Search before selecting. Supply the candidate's `pexelsId` and `assetType`; leave `variantUrl` out to let StockFinder choose the file. A supplied URL must match a returned candidate exactly. Arbitrary download URLs are refused.

After a disconnect, reconnect and use list/get to inspect the pack before retrying a mutation. Packs persist independently of MCP connections. After StockFinder closes or restarts, resume the paused pack explicitly.

Poll `stockfinder_get_job` while downloads run, then finish the pack once they settle. Repeating a successful finish or cancel returns the saved terminal result. If a selection or download call partially fails, its MCP error result retains per-item outcomes: retry only failed items. Intentional candidate rejections are handled normally.

## Connection problems

- **Connection refused:** open StockFinder, enable the local connection, and refresh its status. Keep the app open while connected.
- **MCP could not start:** read the error in Settings. Another program may already use port `38477`. Close the conflicting program and click **Retry connection**.
- **Unauthorized:** copy the current configuration again and check the `Authorization: Bearer …` header. API keys are not the MCP connection token.
- **Forbidden:** use a local MCP client rather than a web page. The endpoint rejects browser origins and untrusted host names.
- **Pack waits for a beat plan:** ask your AI app to get the pack and submit a plan. Creating an MCP pack does not start StockFinder's built-in model.
- **Pack waits for a script:** ask your AI app to write and submit a draft from the saved idea, then plan its footage.
- **Pack waits for approval:** review it in StockFinder, then ask the AI app to continue. Resuming through MCP cannot bypass approval.
- **Pexels rejects a search:** test the Pexels key in Settings and check any quota message. MCP supplies the AI decisions; Pexels still supplies the media.
- **Changes not saved:** read the save error and click **Retry saving** after resolving it. The saved execution mode and live connection remain authoritative until the write succeeds.
- **Saved project files are damaged:** the app refuses to resume with missing safety settings or an unreadable asset ledger. Use **Rerun** to create a fresh MCP pack; the existing files are kept. Rerun preserves MCP mode and does not switch to an AI API provider.

Use **Replace connection token** if a client should lose access or the token was exposed. Confirm the replacement, then copy the new configuration into every client. The old token is rejected immediately; existing packs stay saved.

Turn off **Enable local MCP connection** to stop accepting MCP connections. To create new packs with a stored AI API key again, choose **AI API key** under **Run new packs with**.

## Development check

The integration tests connect the official MCP SDK client to a real local HTTP endpoint and replace only upstream AI/Pexels/media traffic with fixtures:

```text
node --experimental-strip-types --import ./test/support/register.mjs --test test/mcp-server.test.ts test/mcp-audit.test.ts test/mcp-settings.test.ts test/runner/mcp-engine.test.ts test/runner/mcp-restore.test.ts
```
