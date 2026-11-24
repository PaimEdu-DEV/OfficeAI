# OfficeAI

Ambiente desktop que roda agentes de IA de programação lado a lado: o **Claude**, pelo Claude Agent SDK, e o **Codex**. Os dois trocam mensagens por uma ponte compartilhada, e você acompanha o trabalho deles em um escritório em pixel art.

## O que ele faz

Agentes de IA: Claude e Codex rodam em paralelo, cada um com seu painel.

Ponte de mensagens: um agente pode delegar tarefas ao outro, e há reuniões entre vários agentes.

Projetos e processos: gerencia os projetos abertos e os processos que os agentes executam.

Editor de arquivos: editor Monaco embutido para abrir e ajustar arquivos do projeto.

Escritório em pixel art: cena feita com Phaser que mostra o que cada agente está fazendo.

## Stack

Electron 33, Vite 5, React 18 e TypeScript. Phaser 3 para o escritório e Monaco Editor para o editor. O agente Claude usa o pacote @anthropic-ai/claude-agent-sdk.

## Como rodar

Pré-requisitos: Node.js 20 ou mais novo e as credenciais de cada agente que você quiser usar (Claude e Codex).

```bash
git clone https://github.com/PaimEdu-DEV/OfficeAI.git
cd OfficeAI
npm install
npm run dev
```

Outros comandos: `npm run build` compila o TypeScript e gera o build do Vite. `npm run typecheck` roda só a checagem de tipos.

## Estrutura

```
electron/    processo principal: adapters dos agentes, ponte, reuniões, projetos e processos
src/shared/  contrato de tipos entre o Electron e a interface (window.aiOffice)
src/office/  cena do escritório em Phaser
src/ui/      interface em React: painéis, editor e janelas
```

A interface só conversa com o Electron pela API `window.aiOffice`, definida em `src/shared/types.ts`. Fora do Electron, os agentes aparecem como "desconectado".

## Colaboração entre Claude e Codex

O projeto é desenvolvido com os dois agentes. A divisão de pastas e as regras de trabalho estão em [COLLAB.md](COLLAB.md).

## Autor

Eduardo Paim, desenvolvedor de software em Caxias do Sul, Brasil. Perfil: [@PaimEdu-DEV](https://github.com/PaimEdu-DEV)
