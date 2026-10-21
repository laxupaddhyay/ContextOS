import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { BookOpen, Files, Plus, Send, ShieldCheck, Sparkles, UploadCloud } from 'lucide-react';

const API = 'http://localhost:8080/api/v1';
const USER = '00000000-0000-0000-0000-000000000001';
type Workspace = { id: string; name: string; role: string };
type Doc = { id: string; filename: string; status: string; failure_code?: string | null };
type Citation = { documentId: string; filename: string; page: number | null; chunkId: string; quote: string };
type RequestMeta = { latencyMs?: number; model?: string; usage?: { inputTokens?: number; outputTokens?: number } };

export default function App() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspace, setWorkspace] = useState('');
  const [docs, setDocs] = useState<Doc[]>([]);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [citations, setCitations] = useState<Citation[]>([]);
  const [requestMeta, setRequestMeta] = useState<RequestMeta>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const loadStarted = useRef(false);

  async function load() {
    try {
      let response = await fetch(`${API}/workspaces`, { headers: { 'X-User-Id': USER } });
      if (!response.ok) throw new Error('Could not load workspaces');
      let items: Workspace[] = await response.json();
      if (!items.length) {
        response = await fetch(`${API}/workspaces`, {
          method: 'POST', headers: { 'X-User-Id': USER, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Product Knowledge' }),
        });
        if (!response.ok) throw new Error('Could not create the demo workspace');
        items = [await response.json()];
      }
      setWorkspaces(items);
      setWorkspace(items[0].id);
      setError('');
    } catch {
      setError('API unavailable. Start the Docker Compose services and refresh.');
    }
  }

  useEffect(() => {
    // React StrictMode replays effects in development; avoid creating duplicate demo workspaces.
    if (loadStarted.current) return;
    loadStarted.current = true;
    load();
  }, []);

  useEffect(() => {
    if (!workspace) return;
    const refresh = () => fetch(`${API}/workspaces/${workspace}/documents`, { headers: { 'X-User-Id': USER } })
      .then(response => response.ok ? response.json() : Promise.reject())
      .then(setDocs).catch(() => {});
    refresh();
    const interval = setInterval(refresh, 4000);
    return () => clearInterval(interval);
  }, [workspace]);

  async function upload(file?: File) {
    if (!file || !workspace) return;
    setError('');
    const data = new FormData();
    data.append('file', file);
    try {
      const response = await fetch(`${API}/workspaces/${workspace}/documents`, {
        method: 'POST', headers: { 'X-User-Id': USER }, body: data,
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.detail || 'Upload failed');
      }
      const uploaded: Doc = await response.json();
      setDocs(current => [uploaded, ...current.filter(doc => doc.id !== uploaded.id)]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function documentAction(id: string, action: 'retry' | 'delete') {
    if (action === 'delete' && !window.confirm('Delete this document and its indexed passages?')) return;
    setError('');
    try {
      const response = await fetch(`${API}/documents/${id}${action === 'retry' ? '/retry' : ''}`, {
        method: action === 'retry' ? 'POST' : 'DELETE', headers: { 'X-User-Id': USER },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || `Could not ${action} document`);
      if (action === 'delete') setDocs(current => current.filter(doc => doc.id !== id));
      else setDocs(current => current.map(doc => doc.id === id ? { ...doc, status: 'QUEUED' } : doc));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function ask(event: FormEvent) {
    event.preventDefault();
    if (!question.trim() || !workspace) return;
    setBusy(true); setError(''); setAnswer(''); setCitations([]); setRequestMeta({});
    try {
      const response = await fetch(`${API}/workspaces/${workspace}/ask`, {
        method: 'POST', headers: { 'X-User-Id': USER, 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || 'Request failed');
      setAnswer(result.answer);
      setCitations(result.citations || []);
      setRequestMeta({ latencyMs: result.latencyMs, model: result.model, usage: result.usage });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const browseFiles = (file?: File) => upload(file);
  const filePicker = (onChange: (file?: File) => void) => (
    <input type="file" accept=".pdf,.docx,.md,.markdown" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; onChange(file); }} />
  );

  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><span className="mark"><Sparkles size={19} /></span><span>context<span className="brand-light">OS</span></span></div>
      <div className="side-label">WORKSPACE</div>
      <button className="workspace"><span className="workspace-dot">P</span><span>{workspaces[0]?.name || 'Loading…'}</span><span className="chevron">⌄</span></button>
      <div className="side-label source-label">YOUR KNOWLEDGE <Plus size={14} /></div>
      <div className="nav-item active"><Files size={17} /> Documents <span className="count">{docs.length}</span></div>
      <div className="nav-item"><BookOpen size={17} /> Ask ContextOS</div>
      <div className="sidebar-bottom">
        <div className="secure"><ShieldCheck size={16} /><span>Workspace protected<br /><small>Your data stays scoped</small></span></div>
        <div className="profile"><div className="avatar">JD</div><div>Jordan Davis<small>Workspace admin</small></div><span className="dots">•••</span></div>
      </div>
    </aside>

    <main className="main">
      <header><div><div className="eyebrow">PRODUCT KNOWLEDGE <span> / </span> ASSISTANT</div><h1>Ask your knowledge base</h1><p className="subtitle">Answers grounded in your team’s documents, with sources you can verify.</p></div><div className="status"><i /> Local demo</div></header>
      {error && <div className="error" role="alert">{error}</div>}
      <section className="content">
        <div className="chat-area">
          <div className="welcome"><div className="welcome-icon"><Sparkles size={22} /></div><div className="eyebrow">YOUR AI KNOWLEDGE ASSISTANT</div><h2>What would you like to know?</h2><p>Ask a question about the documents in your workspace. ContextOS will find relevant passages and show you exactly where the answer comes from.</p><div className="suggestions"><button onClick={() => setQuestion('What are the key policies in the uploaded documents?')}>Summarize our key policies <span>↗</span></button><button onClick={() => setQuestion('What process should new team members follow?')}>How do our processes work? <span>↗</span></button></div></div>
          {(answer || busy) && <div className="response"><div className="response-head"><span className="assistant-mark"><Sparkles size={15} /></span><strong>ContextOS</strong><span className="verified"><ShieldCheck size={13} /> Source checked</span></div>{busy ? <p>Searching your workspace…</p> : <><p className="answer-text">{answer}</p><div className="answer-meta">{requestMeta.model}{requestMeta.latencyMs !== undefined && ` · ${requestMeta.latencyMs} ms`}{requestMeta.usage && ` · ${requestMeta.usage.inputTokens ?? 0} in / ${requestMeta.usage.outputTokens ?? 0} out tokens`}</div>{citations.length > 0 && <div className="citation-list"><div className="citation-title">SOURCES <span>{citations.length}</span></div>{citations.map(citation => <article className="citation" key={citation.chunkId}><div className="file-icon">▤</div><div><strong>{citation.filename}</strong><small>{citation.page ? `Page ${citation.page} · ` : ''}Source passage</small><p>“{citation.quote}”</p></div></article>)}</div>}</>}</div>}
          <form className="composer" onSubmit={ask}><textarea value={question} onChange={event => setQuestion(event.target.value)} placeholder="Ask anything about your team’s knowledge…" rows={2} /><div className="composer-bottom"><span><ShieldCheck size={14} /> Answers are scoped to your workspace</span><button disabled={busy || !question.trim()} aria-label="Send question"><Send size={16} /></button></div></form>
        </div>

        <aside className="right-rail">
          <div className="rail-head"><div><h3>Knowledge sources</h3><p>Documents in this workspace</p></div><label className="upload-btn"><UploadCloud size={15} /> Add files{filePicker(browseFiles)}</label></div>
          <div className="source-list">{docs.length ? docs.map(doc => <div className="source-row" key={doc.id}>
            <div className="doc-icon">{doc.filename.toLowerCase().endsWith('.pdf') ? 'PDF' : doc.filename.toLowerCase().endsWith('.docx') ? 'DOC' : 'MD'}</div>
            <div className="source-info"><strong>{doc.filename}</strong><small><i className={doc.status === 'READY' ? 'ready-dot' : ''} /> {doc.status === 'READY' ? 'Ready to search' : doc.status === 'FAILED' ? `Failed · ${doc.failure_code || 'INGESTION_ERROR'}` : doc.status === 'QUEUED' || doc.status === 'PROCESSING' ? 'Processing' : doc.status}</small></div>
            <div className="document-actions">{doc.status === 'FAILED' && doc.failure_code !== 'RETRY_LIMIT' && <button title="Retry ingestion" aria-label={`Retry ${doc.filename}`} onClick={() => documentAction(doc.id, 'retry')}>Retry</button>}<button title="Delete document" aria-label={`Delete ${doc.filename}`} onClick={() => documentAction(doc.id, 'delete')}>×</button></div>
          </div>) : <div className="empty-sources"><div className="upload-illustration"><UploadCloud size={21} /></div><strong>Your knowledge starts here</strong><p>Upload PDFs, Word docs, or Markdown files to make them searchable.</p><label className="browse-btn">Browse files{filePicker(browseFiles)}</label></div>}</div>
          <div className="rail-note"><ShieldCheck size={16} /><p><strong>Permission-aware by design</strong><br />Only documents shared with this workspace are used to answer questions.</p></div>
        </aside>
      </section>
      <footer><span>ContextOS <b>·</b> Secure knowledge for your team</span><span>Answers may need verification</span></footer>
    </main>
  </div>;
}
