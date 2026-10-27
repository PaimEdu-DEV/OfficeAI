import { useEffect, useState } from 'react';
import type { AgentInfo } from '../shared/types';
import Office from '../office/Office';
import './styles.css';
export default function App() {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  useEffect(() => {
    const api = window.aiOffice; if (!api) return;
    const off = api.on('agents-changed', setAgents);
    void api.agents.list().then(setAgents).catch(console.error);
    return off;
  }, []);
  return <main className="app"><header><strong>◈ AI OFFICE</strong><span>{window.aiOffice ? 'Workspace conectado' : 'Desconectado'}</span></header><Office agents={agents} onInteract={event => console.info('office-interaction', event)} /><footer>W A S D · mover &nbsp; / &nbsp; Clique · navegar &nbsp; / &nbsp; E · interagir</footer></main>;
}
