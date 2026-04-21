import React, { useState } from 'react';

export default function MermaidCode({ code }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  if (!code) {
    return <div className="diagram-empty">No Mermaid code yet.</div>;
  }

  return (
    <div className="mermaid-code">
      <div className="code-toolbar">
        <button type="button" className="secondary-btn" onClick={copy}>
          {copied ? 'Copied!' : 'Copy code'}
        </button>
      </div>
      <pre className="code-block"><code>{code}</code></pre>
    </div>
  );
}
