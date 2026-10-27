import type { AgentStatus } from '../../src/shared/types';

// Deriva o estado visual a partir do comando real que o agente esta executando.
export function statusForCommand(cmd: string): AgentStatus {
  if (/\b(npm|pnpm|yarn|bun)\s+(i|install|add|ci)\b|\bpip3?\s+install\b|\bcargo\s+add\b/.test(cmd)) return 'installing';
  if (/\b(test|vitest|jest|pytest|playwright|mocha)\b/.test(cmd)) return 'testing';
  return 'running_command';
}
