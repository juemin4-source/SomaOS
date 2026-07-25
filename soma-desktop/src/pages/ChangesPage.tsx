// ChangesPage — 三栏 Diff 审阅（Figma frame 18:155）
// 左侧: 文件树 + Review Findings
// 右侧: Diff Editor

interface ChangesPageProps {
  onBack: () => void;
}

const FILES = [
  { status: "M", name: "plugin_adapter.rs", active: true },
  { status: "M", name: "registry.rs" },
  { status: "M", name: "protocol.rs" },
  { status: "A", name: "adapter_test.rs", accent: true },
];

const FINDINGS = [
  { label: "F1", text: "凭据泄漏风险", color: "#E7B969" },
  { label: "F2", text: "错误类型不统一", color: "#E7B969" },
];

export function ChangesPage({ onBack }: ChangesPageProps) {
  return (
    <div className="changes-layout">
      {/* Files Sidebar */}
      <div className="changes-files">
        <div className="changes-section-label">CHANGES</div>
        {FILES.map((f) => (
          <div key={f.name} className={`changes-file ${f.active ? "active" : ""}`}>
            <span className={`file-status ${f.accent ? "added" : ""}`}>{f.status}</span>
            <span className="file-name">{f.name}</span>
          </div>
        ))}

        <div className="changes-section-label" style={{ marginTop: 24 }}>REVIEW FINDINGS</div>
        {FINDINGS.map((f) => (
          <div key={f.label} className="finding-link">
            <span className="finding-dot" style={{ background: f.color }} />
            <span className="finding-text">{f.label} · {f.text}</span>
          </div>
        ))}
      </div>

      {/* Diff Editor */}
      <div className="diff-editor">
        <div className="editor-tab">
          <div className="editor-tab-left">
            <span className="tab-filename">plugin_adapter.rs</span>
            <div className="chip">M</div>
          </div>
          <div className="editor-tab-right">
            <span className="finding-badge">1 / 2 Findings</span>
            <button className="back-btn" onClick={onBack}>← 返回</button>
          </div>
        </div>
        <div className="diff-code">
          <pre className="diff-line"><span className="line-num">41</span><span className="line-removed">-    let token = env::var("API_KEY").unwrap();</span></pre>
          <pre className="diff-line"><span className="line-num">42</span><span className="line-added">+    let token = CredentialStore::load("api")?;</span></pre>
          <pre className="diff-line"><span className="line-num">43</span> </pre>
          <pre className="diff-line"><span className="line-num">44</span>     let client = Client::new(token);</pre>
        </div>
      </div>
    </div>
  );
}
