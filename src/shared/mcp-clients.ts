import type { McpConnectionInfo } from './mcp.ts'

export type McpClientId =
  | 'codex'
  | 'claude-code'
  | 'cursor'
  | 'vscode'
  | 'copilot'
  | 'gemini-cli'
  | 'windsurf'
  | 'devin'
  | 'cline'
  | 'opencode'
  | 'opencode-v2'
  | 'claude-desktop'
  | 'other'

export interface McpClientProfile {
  id: McpClientId
  name: string
  configLabel: string
  configPath?: string
  steps: string[]
  docsUrl: string
  installTarget?: 'cursor' | 'vscode'
  supported?: boolean
  limitation?: string
}

export const MCP_CLIENTS: readonly McpClientProfile[] = [
  {
    id: 'codex',
    name: 'Codex',
    configLabel: 'Copy Codex configuration',
    configPath: '~/.codex/config.toml',
    steps: [
      'Open Codex settings and open config.toml, or ask your local Codex agent to apply the setup prompt.',
      'Add the StockFinder block to your personal config. Update an existing StockFinder block instead of adding it twice.',
      'Reconnect the MCP server or restart the client, then paste the connection test into a new local chat.'
    ],
    docsUrl: 'https://learn.chatgpt.com/docs/extend/mcp'
  },
  {
    id: 'claude-code',
    name: 'Claude Code',
    configLabel: 'Copy terminal command',
    configPath: 'User scope (personal ~/.claude.json)',
    steps: [
      'Run the copied command in a terminal on this computer, or give the setup prompt to your local Claude Code agent.',
      'The command adds StockFinder for your user account across projects. If it already exists, update that entry rather than creating a second one.',
      'Open /mcp in Claude Code, reconnect StockFinder, and paste the connection test.'
    ],
    docsUrl: 'https://code.claude.com/docs/en/mcp'
  },
  {
    id: 'cursor',
    name: 'Cursor',
    configLabel: 'Copy Cursor configuration',
    configPath: '~/.cursor/mcp.json',
    steps: [
      'Choose Add to Cursor and review the installation in Cursor, or merge the copied configuration into your personal mcp.json.',
      'Open Customize → MCPs and check that StockFinder is enabled.',
      'Start a local agent chat and paste the connection test. Approve its read-only tool calls when asked.'
    ],
    docsUrl: 'https://cursor.com/docs/context/mcp',
    installTarget: 'cursor'
  },
  {
    id: 'vscode',
    name: 'VS Code (editor configuration)',
    configLabel: 'Copy VS Code configuration',
    configPath: 'MCP: Open User Configuration → profile mcp.json',
    steps: [
      'Choose Add to VS Code and review the installation, or open MCP: Open User Configuration from the Command Palette.',
      'Merge the configuration into the profile mcp.json using its servers object. For Copilot Global or Copilot CLI, choose GitHub Copilot instead.',
      'Open MCP: List Servers, start StockFinder, then paste the connection test into a local agent chat.'
    ],
    docsUrl: 'https://code.visualstudio.com/docs/agents/reference/mcp-configuration',
    installTarget: 'vscode'
  },
  {
    id: 'copilot',
    name: 'GitHub Copilot (VS Code or CLI)',
    configLabel: 'Copilot configuration',
    configPath: '~/.copilot/mcp-config.json (or $COPILOT_HOME/mcp-config.json)',
    steps: [
      'In VS Code, open Chat: Open Customizations and choose MCP Servers in a local Copilot session. Select Copilot Global for your personal configuration.',
      'Merge the StockFinder entry into mcpServers in your personal Copilot mcp-config.json. The same file works with Copilot CLI.',
      'Open MCP: List Servers in VS Code or /mcp in Copilot CLI, then send the connection check from a session on this computer.'
    ],
    docsUrl:
      'https://code.visualstudio.com/docs/agents/reference/mcp-configuration#portable-configuration'
  },
  {
    id: 'gemini-cli',
    name: 'Gemini CLI',
    configLabel: 'Copy Gemini configuration',
    configPath: '~/.gemini/settings.json',
    steps: [
      'Open your personal Gemini CLI settings.json, or ask your local Gemini agent to apply the setup prompt.',
      'Merge StockFinder into mcpServers. Keep httpUrl: Gemini’s url field selects the older SSE transport.',
      'Restart Gemini CLI, check /mcp, and paste the connection test.'
    ],
    docsUrl: 'https://geminicli.com/docs/tools/mcp-server/'
  },
  {
    id: 'windsurf',
    name: 'Windsurf / Cascade',
    configLabel: 'Copy Cascade configuration',
    configPath: 'Cascade → Open MCP config file',
    steps: [
      'In Cascade’s MCP menu, choose Open MCP config file. Use the file your installed version opens.',
      'Merge StockFinder into mcpServers, save, and refresh the MCP server list.',
      'Enable StockFinder and paste the connection test into a local Cascade chat. If you use Devin Local, select its separate setup above.'
    ],
    docsUrl: 'https://docs.windsurf.com/plugins/cascade/mcp'
  },
  {
    id: 'devin',
    name: 'Devin Local',
    configLabel: 'Copy Devin configuration',
    configPath: 'Personal devin/mcp_config.json (open from Customize → MCPs)',
    steps: [
      'Open Customize → MCPs in Devin Desktop and choose This computer, then open your personal MCP configuration.',
      'Merge StockFinder into mcpServers. User config is ~/.config/devin/mcp_config.json, or %APPDATA%\\devin\\mcp_config.json on Windows.',
      'Refresh the MCP list, or run devin mcp list in the CLI, then paste the connection test into a Devin Local session on this computer.'
    ],
    docsUrl: 'https://docs.devin.ai/cli/extensibility/mcp/configuration'
  },
  {
    id: 'cline',
    name: 'Cline',
    configLabel: 'Copy Cline configuration',
    configPath:
      'Editor: Configure MCP Servers; CLI: ~/.cline/data/settings/cline_mcp_settings.json (or CLINE_MCP_SETTINGS_PATH)',
    steps: [
      'In the editor, open MCP Servers → Configure → Configure MCP Servers. For the CLI, open ~/.cline/data/settings/cline_mcp_settings.json, or the file named by CLINE_MCP_SETTINGS_PATH.',
      'Merge the configuration into mcpServers. Keep type: streamableHttp; omitting it selects the older SSE transport.',
      'Save and reconnect StockFinder. In the CLI, run cline config mcp to inspect the entry. Paste the connection test into Cline to verify a real tool call.'
    ],
    docsUrl: 'https://docs.cline.bot/mcp/mcp-overview'
  },
  {
    id: 'opencode',
    name: 'OpenCode v1',
    configLabel: 'Copy OpenCode v1 configuration',
    configPath: '~/.config/opencode/opencode.json',
    steps: [
      'Open your personal OpenCode configuration, or give your local agent the setup prompt.',
      'Merge StockFinder directly under mcp. Keep oauth: false because StockFinder uses its private connection token.',
      'Restart OpenCode, check its MCP list, and paste the connection test. For v2, use the separate OpenCode v2 setup.'
    ],
    docsUrl: 'https://opencode.ai/docs/mcp-servers/'
  },
  {
    id: 'opencode-v2',
    name: 'OpenCode v2',
    configLabel: 'Copy OpenCode v2 configuration',
    configPath: '~/.config/opencode/opencode.json (or opencode.jsonc)',
    steps: [
      'Open your personal OpenCode v2 configuration, or give your local agent the setup prompt.',
      'Merge StockFinder under mcp.servers. V2 uses this wrapper instead of v1’s mcp.stockfinder format.',
      'Restart OpenCode, check /mcps, and paste the connection test.'
    ],
    docsUrl: 'https://dev.opencode.ai/v2/docs/mcp-servers/'
  },
  {
    id: 'claude-desktop',
    name: 'Claude Desktop',
    configLabel: 'Local bridge required',
    steps: [
      'Use Claude Code on this computer with StockFinder’s direct HTTP connection.',
      'Claude Desktop chat can use a desktop extension or stdio server for local tools; StockFinder does not currently ship an extension or bridge.',
      'Adding the local address as a custom connector will not work: those connections run from Anthropic’s cloud.'
    ],
    docsUrl:
      'https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop',
    supported: false,
    limitation:
      'Direct local HTTP setup is not available for Claude Desktop chat. Choose Claude Code or another local client. StockFinder does not ship a Claude Desktop extension or stdio bridge yet.'
  },
  {
    id: 'other',
    name: 'Another AI app',
    configLabel: 'Copy generic configuration',
    steps: [
      'Check that your client makes MCP requests from this computer and supports Streamable HTTP with an Authorization header.',
      'Add StockFinder using the copied address and bearer header. Adapt the JSON wrapper to your client’s documented format.',
      'Enable its tools, reconnect, and paste the connection test. Cloud-only and browser-only connectors cannot reach this address.'
    ],
    docsUrl: 'https://modelcontextprotocol.io/docs/develop/connect-local-servers'
  }
]

/** Local HTTP clients need both the live address and the private connection token. */
export function mcpClientConfig(info: McpConnectionInfo, format: McpClientId): string | null {
  if (!info.enabled || !info.running || !info.url || !info.token || format === 'claude-desktop')
    return null
  const headers = { Authorization: `Bearer ${info.token}` }
  if (format === 'codex') {
    return [
      '[mcp_servers.stockfinder]',
      `url = ${JSON.stringify(info.url)}`,
      `http_headers = { Authorization = ${JSON.stringify(headers.Authorization)} }`
    ].join('\n')
  }
  if (format === 'claude-code') {
    return `claude mcp add --transport http --scope user stockfinder ${info.url} --header "Authorization: Bearer ${info.token}"`
  }
  const remote = { url: info.url, headers }
  let config: object
  switch (format) {
    case 'cursor':
      config = { mcpServers: { stockfinder: remote } }
      break
    case 'vscode':
      config = { servers: { stockfinder: { type: 'http', ...remote } } }
      break
    case 'copilot':
      config = { mcpServers: { stockfinder: { type: 'http', ...remote, tools: ['*'] } } }
      break
    case 'gemini-cli':
      config = { mcpServers: { stockfinder: { httpUrl: info.url, headers } } }
      break
    case 'windsurf':
      config = { mcpServers: { stockfinder: { serverUrl: info.url, headers } } }
      break
    case 'devin':
      config = { mcpServers: { stockfinder: { ...remote, transport: 'http' } } }
      break
    case 'cline':
      config = {
        mcpServers: {
          stockfinder: { type: 'streamableHttp', ...remote, disabled: false, autoApprove: [] }
        }
      }
      break
    case 'opencode':
      config = { mcp: { stockfinder: { type: 'remote', ...remote, oauth: false, enabled: true } } }
      break
    case 'opencode-v2':
      config = { mcp: { servers: { stockfinder: { type: 'remote', ...remote, oauth: false } } } }
      break
    case 'other':
      config = { mcpServers: { stockfinder: { type: 'http', ...remote } } }
  }
  return JSON.stringify(config, null, 2)
}

export const MCP_CONNECTION_TEST_PROMPT =
  'Test my StockFinder MCP connection using its tools. Call stockfinder_status and stockfinder_list_jobs, then tell me whether StockFinder is reachable and whether its Pexels key is configured. Do not create packs, change settings, or download anything. Do not include connection tokens, configuration, API keys, or private pack contents in your reply.'

export const MCP_STARTER_PROMPT =
  'Help me create or continue a footage pack with the StockFinder MCP tools. First call stockfinder_status and stockfinder_list_jobs. Ask which existing pack to continue, or ask for my script or idea before creating a new one. Read the selected pack with stockfinder_get_job and follow its waitingOn state. For an idea, write and save the draft with stockfinder_submit_script before submitting a beat plan. Plan the numbered sentences, search Pexels for each beat, and select suitable returned candidates within the pack’s limits. If desktop approval is required, ask me to approve in StockFinder and wait. Check downloads and retry only failed items, then call stockfinder_finish_job when the required files are ready. Keep all work in the same pack and do not reveal keys or connection tokens.'

/** This prompt intentionally contains the user's token; only copy it at their request. */
export function mcpSetupPrompt(info: McpConnectionInfo, clientId: McpClientId): string | null {
  const profile = MCP_CLIENTS.find((client) => client.id === clientId)
  const config = mcpClientConfig(info, clientId)
  if (!profile || profile.supported === false || !config) return null
  return [
    `Connect my local ${profile.name} agent to StockFinder through MCP. StockFinder is already running on this computer.`,
    'Use the native client configuration below. This is Streamable HTTP with a fixed Authorization bearer header, not SSE or OAuth. Do not start another StockFinder instance or install a bridge.',
    `Setup location: ${profile.configPath ?? 'your client’s private personal MCP configuration'}.`,
    ...profile.steps.map((step, index) => `${index + 1}. ${step}`),
    'Apply only the stockfinder entry in my personal configuration, respecting any configured home or settings-path override for this client. Preserve all other settings, comments, and MCP servers. If an entry already exists, update it instead of duplicating it. Do not put this token in a shared project file, a repository, logs, or your response. For a terminal command, keep its --scope user setting.',
    'If you cannot edit the client configuration, explain exactly where I should paste it. If a client restart or a new chat is needed, tell me before claiming success. Never claim success until an actual StockFinder tool call works.',
    'Private configuration:',
    config,
    `Official client guide: ${profile.docsUrl}`,
    'After setup, test only the connection; do not create or alter packs:',
    MCP_CONNECTION_TEST_PROMPT,
    'This address is local to this computer. Keep StockFinder open and use a local agent session, not a cloud runner, browser connector, SSH host, or container with a different loopback network.'
  ].join('\n\n')
}
