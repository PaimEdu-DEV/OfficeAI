// Contrato entre o processo principal (Electron) e a interface (React/Phaser).
// Toda atividade exibida deve vir de um AgentEvent real emitido por um adaptador.

export type AgentId = 'claude' | 'codex' | (string & {});

export type AgentStatus =
  | 'idle' | 'thinking' | 'coding' | 'running_command' | 'installing' | 'testing'
  | 'analyzing_error' | 'talking' | 'in_meeting' | 'awaiting_approval'
  | 'awaiting_agent' | 'error' | 'disconnected';

export interface AgentInfo {
  id: AgentId;
  name: string;
  status: AgentStatus;
  sessionId?: string;
  projectId?: string;
  lastActivity?: number;
  capabilities: string[]; // ex.: 'streaming', 'approvals', 'resume', 'interrupt'
  unavailable?: string;   // motivo, quando o CLI não está disponível
}

interface BaseEvent { agentId: AgentId; ts: number; sessionId?: string; projectId?: string }

export type AgentEvent = BaseEvent & (
  | { kind: 'status'; status: AgentStatus; detail?: string }
  | { kind: 'user_message'; text: string }
  | { kind: 'message_delta'; messageId: string; text: string }
  | { kind: 'message'; messageId: string; text: string }
  | { kind: 'tool_start'; toolId: string; tool: string; summary: string }
  | { kind: 'tool_end'; toolId: string; ok: boolean; output?: string }
  | { kind: 'file_changed'; path: string; change: 'create' | 'modify' | 'delete' }
  | { kind: 'approval_request'; requestId: string; summary: string; detail?: string }
  | { kind: 'usage'; inputTokens?: number; outputTokens?: number; costUsd?: number }
  | { kind: 'error'; message: string }
);

// Mensagem real trafegando pela ponte Claude <-> Codex.
export interface BridgeMessage {
  id: string;
  ts: number;
  from: AgentId;
  to: AgentId;
  text: string;
  taskId?: string;
}

export interface Project {
  id: string;
  name: string;
  path: string;
  agents: AgentId[];
  goal?: string;
  createdAt: number;
}

export interface ManagedProcess {
  id: string;
  projectId: string;
  command: string;
  cwd: string;
  pid?: number;
  state: 'running' | 'exited' | 'failed';
  exitCode?: number;
  previewUrl?: string; // detectado no stdout (http://localhost:...)
  startedAt: number;
}

export interface ProcessOutput { processId: string; stream: 'stdout' | 'stderr'; data: string }

export interface FileEntry { name: string; path: string; dir: boolean }

export interface Meeting {
  id: string;
  goal: string;
  projectId?: string;
  participants: AgentId[];
  state: 'active' | 'paused' | 'ended';
  round: number;
  maxRounds: number;      // limite de rodadas automaticas de discussao entre agentes
  working: AgentId[];     // agentes processando uma chamada real neste momento
  summary?: string;
  createdAt: number;
}

export interface MeetingMessage {
  id: string;
  meetingId: string;
  ts: number;
  author: AgentId | 'user' | 'system';
  to: AgentId | 'all';
  text: string;
}

// API exposta em window.aiOffice pelo preload.
export interface AiOfficeApi {
  agents: {
    list(): Promise<AgentInfo[]>;
    send(agentId: AgentId, text: string, projectId?: string): Promise<void>;
    interrupt(agentId: AgentId): Promise<void>;
    respondApproval(agentId: AgentId, requestId: string, approved: boolean): Promise<void>;
    history(agentId: AgentId, projectId?: string): Promise<AgentEvent[]>;
  };
  projects: {
    list(): Promise<Project[]>;
    create(p: { name: string; parentDir: string; agent: AgentId; goal?: string }): Promise<Project>;
    open(dir: string): Promise<Project>;
    pickDirectory(): Promise<string | null>;
  };
  fs: {
    list(projectId: string, relDir?: string): Promise<FileEntry[]>;
    read(projectId: string, relPath: string): Promise<string>;
    write(projectId: string, relPath: string, content: string): Promise<void>;
  };
  processes: {
    list(): Promise<ManagedProcess[]>;
    start(projectId: string, command: string): Promise<ManagedProcess>;
    stop(processId: string): Promise<void>;
    openExternal(url: string): Promise<void>;
  };
  bridge: {
    timeline(): Promise<BridgeMessage[]>;
  };
  meetings: {
    list(): Promise<Meeting[]>;
    messages(meetingId: string): Promise<MeetingMessage[]>;
    start(m: { participants: AgentId[]; goal: string; projectId?: string; maxRounds?: number }): Promise<Meeting>;
    // Mensagem do usuario para todos ou para um agente. Dispara chamadas reais aos agentes.
    say(meetingId: string, text: string, to?: AgentId | 'all'): Promise<void>;
    requestTurn(meetingId: string, agentId: AgentId): Promise<void>;
    setPaused(meetingId: string, paused: boolean): Promise<void>;
    // Encerra; com summarize=true pede ao Claude um resumo real das decisoes.
    end(meetingId: string, summarize?: boolean): Promise<Meeting>;
    exportMarkdown(meetingId: string): Promise<string | null>; // caminho salvo
  };
  on(channel: 'agent-event', cb: (e: AgentEvent) => void): () => void;
  on(channel: 'agents-changed', cb: (a: AgentInfo[]) => void): () => void;
  on(channel: 'bridge-message', cb: (m: BridgeMessage) => void): () => void;
  on(channel: 'process-output', cb: (o: ProcessOutput) => void): () => void;
  on(channel: 'processes-changed', cb: (p: ManagedProcess[]) => void): () => void;
  on(channel: 'meeting-changed', cb: (m: Meeting) => void): () => void;
  on(channel: 'meeting-message', cb: (m: MeetingMessage) => void): () => void;
}

declare global {
  interface Window { aiOffice: AiOfficeApi }
}
