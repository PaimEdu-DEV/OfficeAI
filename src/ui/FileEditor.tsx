import { useEffect, useState } from "react";
import Editor, { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import EditorWorker from "monaco-editor/editor/editor.worker.js?worker&inline";
import TypeScriptWorker from "monaco-editor/language/typescript/ts.worker.js?worker&inline";
import JsonWorker from "monaco-editor/language/json/json.worker.js?worker&inline";
import CssWorker from "monaco-editor/language/css/css.worker.js?worker&inline";
import HtmlWorker from "monaco-editor/language/html/html.worker.js?worker&inline";
(
  globalThis as typeof globalThis & { MonacoEnvironment: unknown }
).MonacoEnvironment = {
  getWorker: (_module: string, label: string) => {
    if (label === "typescript" || label === "javascript")
      return new TypeScriptWorker();
    if (label === "json") return new JsonWorker();
    if (["css", "scss", "less"].includes(label)) return new CssWorker();
    if (["html", "handlebars", "razor"].includes(label))
      return new HtmlWorker();
    return new EditorWorker();
  },
};
loader.config({ monaco });

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
        <Editor
          path={`${projectId}/${path}`}
          language={language}
          value={content}
          theme="vs"
          options={{
            readOnly: true,
            minimap: { enabled: false },
            fontSize: 12,
            padding: { top: 16 },
            automaticLayout: true,
            scrollBeyondLastLine: false,
          }}
        />
      )}
    </div>
  );
}
