# Control StockFinder from your AI app

StockFinder can expose its search and download workflow through the Model Context Protocol (MCP). Your connected AI app plans the visual beats and chooses footage. StockFinder searches Pexels, downloads the files, and keeps the project visible in its desktop library.

This mode needs a **Pexels API key** and an MCP client running on the same computer. StockFinder does **not** need an OpenAI, Gemini, or OpenRouter API key. Your AI app supplies the model and handles its own account or subscription.

## Connect in three steps

Open **Settings → MCP connection**. During first-time setup, choose **My AI app (MCP)**; StockFinder takes you to the connection screen after you finish entering your Pexels key and download folder.

### 1. Choose your AI app

Choose **Connected AI app (MCP)** under **Run new packs with**, enable the local connection, and choose **Your AI app**. Keep StockFinder open. A ready or listening status means the local server is available; it does not mean that your AI app has connected yet.

Pick the app you use for chat, rather than its underlying model. For example, choose Cursor even if you use a Claude model inside Cursor. The model and account stay in your AI app.

### 2. Add StockFinder

- **Cursor or VS Code:** click **Add to Cursor** or **Add to VS Code**. Review the installation in that app, enable StockFinder's tools, and start a local agent chat. The button opens the app's documented installation link; it does not silently install anything or grant tool approval.
- **An AI coding app that can edit its settings:** click **Copy setup prompt** and paste it into a private chat in that app on this computer. The prompt tells it where to add StockFinder, preserves existing settings, and asks it to test the connection. If it cannot edit its configuration, follow the manual steps shown instead.
- **Manual setup:** expand the configuration, click **Copy configuration**, and follow the selected app's steps. Merge the StockFinder entry into an existing file; do not replace your other servers or preferences. Reconnect or restart the AI app after saving.

The setup prompt and configuration contain your **private connection token**. Paste them only into an AI app you trust; the chat may be processed by its provider. The connection test and starter prompts contain no credentials. StockFinder stores its token in encrypted local storage. Replacing the token requires updating every configured client.

### 3. Try it in chat

Click **Copy connection test** and paste it into your AI app. It asks the app to call `stockfinder_status` and `stockfinder_list_jobs`, without creating a pack or downloading anything. Review the tool request if your AI app asks for permission. A model merely saying it is connected is not a successful test: it must receive results from the tools.

StockFinder can show the last authenticated client contact. This confirms a real MCP handshake, not a permanent connection or that every tool is enabled. The tool result tells you whether a Pexels key is available. If it is missing, add and test the key in StockFinder's Pexels settings.

Then use **Copy starter prompt**, add your script or idea, and send it in the same AI app. You can also create a pack in StockFinder and ask the AI app to continue it. Downloads and progress appear in StockFinder.

## App-specific setup

The in-app selector generates each app's own format. MCP configuration is not interchangeable: Gemini CLI uses `httpUrl`, Cline uses `streamableHttp`, and OpenCode has different schemas for v1 and v2. Use the matching profile.

These setup instructions were checked against the official documentation on **3 November 2026**. Configuration generation and install links are tested in StockFinder; this does not claim every client version has been installed and tested end to end.

| Your AI app                                                                                                                | Manual setup and verification                                                                                                                                                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [Codex](https://learn.chatgpt.com/docs/extend/mcp)                                                                         | Merge the TOML block into `~/.codex/config.toml`. The local desktop, CLI, and IDE clients share the configuration for a Codex host. Reconnect, then use `/mcp` in the CLI or the MCP settings in your client.                                                                                          |
| [Claude Code](https://code.claude.com/docs/en/mcp)                                                                         | Run the copied command in a local terminal. It uses HTTP transport and user scope so the private token stays out of project configuration. Open `/mcp` to inspect StockFinder.                                                                                                                         |
| [Cursor](https://cursor.com/docs/mcp)                                                                                      | Use **Add to Cursor**, or merge the generated `mcpServers.stockfinder` entry into `~/.cursor/mcp.json`. Enable StockFinder in Customize → MCPs and use a local agent chat.                                                                                                                             |
| [VS Code / GitHub Copilot](https://code.visualstudio.com/docs/agents/reference/mcp-configuration)                          | Use **Add to VS Code**, or run **MCP: Open User Configuration** and merge the generated `servers.stockfinder` entry. Start the server, enable its tools, and use a local agent. This is the VS Code `mcp.json` format, not the separate portable Copilot configuration.                                |
| [Gemini CLI](https://geminicli.com/docs/tools/mcp-server/)                                                                 | Merge the generated entry into `~/.gemini/settings.json`. Keep `httpUrl`; `url` selects a different transport. Restart Gemini CLI and inspect `/mcp`.                                                                                                                                                  |
| [Windsurf](https://docs.windsurf.com/plugins/cascade/mcp)                                                                  | Open the MCP configuration from Cascade, merge the generated entry using `serverUrl`, and refresh the servers. Configuration location and menus can differ across builds.                                                                                                                              |
| [Devin Local / CLI](https://docs.devin.ai/cli/extensibility/mcp/configuration)                                             | Open Customize → MCPs → This computer and open the user configuration. Merge the generated entry using `url` and `transport: "http"`; this format differs from the Windsurf plugin profile.                                                                                                            |
| [Cline](https://docs.cline.bot/mcp/mcp-overview)                                                                           | In the extension, open MCP Servers → Configure → Configure MCP Servers. For Cline CLI, use `~/.cline/data/settings/cline_mcp_settings.json` (or `CLINE_MCP_SETTINGS_PATH`) and inspect `cline config mcp`. Merge the generated entry with `type: "streamableHttp"`; automatic tool approvals stay off. |
| [OpenCode v1](https://opencode.ai/docs/mcp-servers/)                                                                       | Merge `mcp.stockfinder` into your OpenCode configuration. The profile uses `type: "remote"` and `oauth: false` with the private bearer header. Inspect `opencode mcp list`.                                                                                                                            |
| [OpenCode v2](https://dev.opencode.ai/v2/docs/mcp-servers/)                                                                | Use the v2 profile and merge `mcp.servers.stockfinder`. V2 does not put server names directly under `mcp`. Inspect `opencode mcp list` or `/mcps`.                                                                                                                                                     |
| [Claude Desktop](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop) | StockFinder does not currently ship a Claude Desktop extension or stdio bridge. The selector explains this limitation; use Claude Code or another supported local client. Do not paste the HTTP configuration into `claude_desktop_config.json` and expect it to start a local server.                 |
| Other local MCP client                                                                                                     | Use a client that explicitly supports Streamable HTTP and an `Authorization` header. Adapt the generic configuration to that client's documented schema, then run the connection test.                                                                                                                 |

For Codex, the manual block looks like this:

```toml
[mcp_servers.stockfinder]
url = "http://127.0.0.1:38477/mcp"
http_headers = { Authorization = "Bearer YOUR_PRIVATE_TOKEN" }
```

For Claude Code, the command looks like this:

```text
claude mcp add --transport http --scope user stockfinder http://127.0.0.1:38477/mcp --header "Authorization: Bearer YOUR_PRIVATE_TOKEN"
```

Copy the live values from StockFinder rather than using `YOUR_PRIVATE_TOKEN`. An AI provider's API key is not your MCP token. These are authenticated HTTP connections, so an OAuth login is not needed for StockFinder.

### Local and cloud clients

The address `http://127.0.0.1:38477/mcp` refers to the computer where the MCP client runs. Your client must run on the same computer as StockFinder. Cloud agents, remote SSH sessions, containers, and WSL may have a different local network; use a client running directly on StockFinder's host for this setup.

ChatGPT web uses remote plugins; local Codex clients can connect directly, as described in the [OpenAI MCP documentation](https://learn.chatgpt.com/docs/extend/mcp). Use Gemini CLI for this local setup rather than expecting a cloud-hosted Gemini chat to reach your computer.

Claude's **Add custom connector** connects from Anthropic's cloud, including when opened inside Claude Desktop or Cowork. It cannot reach StockFinder's loopback address. Claude Desktop's local extensions are a separate mechanism. See [Claude's network requirements](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp). StockFinder does not expose a public endpoint or set up a tunnel.

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
