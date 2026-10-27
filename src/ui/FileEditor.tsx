import { lazy, Suspense, useEffect, useState } from "react";
import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import EditorWorker from "monaco-editor/editor/editor.worker.js?worker";
(
  globalThis as typeof globalThis & { MonacoEnvironment: unknown }
).MonacoEnvironment = { getWorker: () => new EditorWorker() };
loader.config({ monaco });
const Editor = lazy(() => import("@monaco-editor/react"));
export default function FileEditor({
  projectId,
  path,
}: {
  projectId: string;
  path: string;
}) {
  const [content, setContent] = useState<string>(),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    setContent(undefined);
    setError("");
    void window.aiOffice.fs
      .read(projectId, path)
      .then((text) => {
        if (live) setContent(text);
      })
      .catch((e) => {
        if (live) setError(String(e));
      });
    return () => {
      live = false;
    };
  }, [projectId, path]);
  const language =
    (
      {
        ts: "typescript",
        tsx: "typescript",
        js: "javascript",
        jsx: "javascript",
        json: "json",
        css: "css",
        html: "html",
        md: "markdown",
        py: "python",
        ps1: "powershell",
      } as Record<string, string>
    )[path.split(".").pop() ?? ""] ?? "plaintext";
  return (
    <div className="editor">
      <div className="editor-path">
        ◇ {path}
        <span>LEITURA</span>
      </div>
      {error ? (
        <p className="panel-error">{error}</p>
      ) : content === undefined ? (
        <p>Carregando arquivo…</p>
      ) : (
        <Suspense fallback={<p>Carregando editor…</p>}>
          <Editor
            path={`${projectId}/${path}`}
            language={language}
            value={content}
            theme="vs-dark"
            options={{
              readOnly: true,
              minimap: { enabled: false },
              fontSize: 12,
              padding: { top: 16 },
              automaticLayout: true,
              scrollBeyondLastLine: false,
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
