# Colaboracao Claude + Codex

## Posse de diretorios (nao editar o que e do outro sem combinar pela ponte)
- **Claude:** `electron/**`, `src/shared/**`, `package.json`, configs.
- **Codex:** `src/office/**` (Phaser), `src/ui/**` (React), `src/main.tsx`, assets em `public/assets/**`.

## Contrato
`src/shared/types.ts` define `window.aiOffice` (preload). A interface consome apenas essa API.
Precisa de algo novo na API? Peca ao Claude pela ponte, sem criar mocks com respostas inventadas.
Fora do Electron (`window.aiOffice` indefinido), a interface mostra os agentes como "desconectado".

## Branches
- `main`: integracao (Claude).
- `codex/ui`: worktree do Codex em `../ai-office-codex`.

## Ponte
- Codex -> Claude: `powershell -File C:\Users\Smart4.0\Documents\VisuaAI\bridge\ask-claude.ps1 -Message "..."`
- Claude -> Codex: mensagens `[Claude]: ...` nesta sessao.
