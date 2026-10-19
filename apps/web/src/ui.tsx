import { useEffect, useState } from 'react';
import { BookOpen, Files, Plus, Send, ShieldCheck, Sparkles, UploadCloud } from 'lucide-react';

const API = 'http://localhost:8080/api/v1';
const USER = '00000000-0000-0000-0000-000000000001';
type Workspace = { id: string; name: string; role: string };
type Doc = { id: string; filename: string; status: string };
type Citation = { documentId: string; filename: string; page: number | null; chunkId: string; quote: string };

export default function App() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]), [workspace, setWorkspace] = useState('');
  const [docs, setDocs] = useState<Doc[]>([]), [question, setQuestion] = useState(''), [answer, setAnswer] = useState(''), [citations, setCitations] = useState<Citation[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function load() {
    try {
      let r = await fetch(`${API}/workspaces`, { headers: { 'X-User-Id': USER } });
      let ws: Workspace[] = await r.json();
      if (!ws.length) { r = await fetch(`${API}/workspaces`, { method: 'POST', headers: { 'X-User-Id': USER, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Product Knowledge' }) }); ws = [await r.json()]; }
      setWorkspaces(ws); setWorkspace(ws[0].id);
    } catch { setError('API unavailable. Start the Docker Compose services and refresh.'); }
  }
  useEffect(() => { load(); }, []);
  useEffect(() => { if (!workspace) return; const refresh = () => fetch(`${API}/workspaces/${workspace}/documents`, { headers: { 'X-User-Id': USER } }).then(r => r.json()).then(setDocs).catch(() => {}); refresh(); const id = setInterval(refresh, 4000); return () => clearInterval(id); }, [workspace]);
  async function upload(file?: File) {
    if (!file || !workspace) return; setError(''); const data = new FormData(); data.append('file', file);
    try { const r = await fetch(`${API}/workspaces/${workspace}/documents`, { method: 'POST', headers: { 'X-User-Id': USER }, body: data }); if (!r.ok) throw new Error((await r.json()).detail || 'Upload failed'); setDocs(d => [{ id: '', filename: file.name, status: 'QUEUED' }, ...d]); } catch (e) { setError(String(e)); }
  }
  async function ask(e: React.FormEvent) {
    e.preventDefault(); if (!question.trim() || !workspace) return; setBusy(true); setError(''); setAnswer(''); setCitations([]);
    try { const r = await fetch(`${API}/workspaces/${workspace}/ask`, { method: 'POST', headers: { 'X-User-Id': USER, 'Content-Type': 'application/json' }, body: JSON.stringify({ question }) }); const data = await r.json(); if (!r.ok) throw new Error(data.detail || 'Request failed'); setAnswer(data.answer); setCitations(data.citations || []); }
    catch (e) { setError(String(e)); } finally { setBusy(false); }
  }
  return <div className="shell"><aside className="sidebar"><div className="brand"><span className="mark"><Sparkles size={19}/></span><span>context<span className="brand-light">OS</span></span></div><div className="side-label">WORKSPACE</div><button className="workspace"><span className="workspace-dot">P</span><span>{workspaces[0]?.name || 'Loading…'}</span><span className="chevron">⌄</span></button><div className="side-label source-label">YOUR KNOWLEDGE <Plus size={14}/></div><div className="nav-item active"><Files size={17}/> Documents <span className="count">{docs.length}</span></div><div className="nav-item"><BookOpen size={17}/> Ask ContextOS</div><div className="sidebar-bottom"><div className="secure"><ShieldCheck size={16}/><span>Workspace protected<br/><small>Your data stays scoped</small></span></div><div className="profile"><div className="avatar">JD</div><div>Jordan Davis<small>Workspace admin</small></div><span className="dots">•••</span></div></div></aside>
    <main className="main"><header><div><div className="eyebrow">PRODUCT KNOWLEDGE <span> / </span> ASSISTANT</div><h1>Ask your knowledge base</h1><p className="subtitle">Answers grounded in your team’s documents, with sources you can verify.</p></div><div className="status"><i/> All systems operational</div></header>
      {error && <div className="error">{error}</div>}
      <section className="content"><div className="chat-area"><div className="welcome"><div className="welcome-icon"><Sparkles size={22}/></div><div className="eyebrow">YOUR AI KNOWLEDGE ASSISTANT</div><h2>What would you like to know?</h2><p>Ask a question about the documents in your workspace. ContextOS will find relevant passages and show you exactly where the answer comes from.</p><div className="suggestions"><button onClick={() => setQuestion('What are the key policies in the uploaded documents?')}>Summarize our key policies <span>↗</span></button><button onClick={() => setQuestion('What process should new team members follow?')}>How do our processes work? <span>↗</span></button></div></div>
        {(answer || busy) && <div className="response"><div className="response-head"><span className="assistant-mark"><Sparkles size={15}/></span><strong>ContextOS</strong><span className="verified"><ShieldCheck size={13}/> Grounded answer</span></div>{busy ? <p>Searching your workspace…</p> : <><p className="answer-text">{answer}</p>{citations.length > 0 && <div className="citation-list"><div className="citation-title">SOURCES <span>{citations.length}</span></div>{citations.map(c => <article className="citation" key={c.chunkId}><div className="file-icon">▤</div><div><strong>{c.filename}</strong><small>{c.page ? `Page ${c.page} · ` : ''}Source passage</small><p>“{c.quote}”</p></div></article>)}</div>}</>}</div>}
        <form className="composer" onSubmit={ask}><textarea value={question} onChange={e => setQuestion(e.target.value)} placeholder="Ask anything about your team’s knowledge…" rows={2}/><div className="composer-bottom"><span><ShieldCheck size={14}/> Answers are scoped to your workspace</span><button disabled={busy || !question.trim()} aria-label="Send question"><Send size={16}/></button></div></form>
      </div><aside className="right-rail"><div className="rail-head"><div><h3>Knowledge sources</h3><p>Documents in this workspace</p></div><label className="upload-btn"><UploadCloud size={15}/> Add files<input type="file" accept=".pdf,.docx,.md,.markdown" onChange={e => upload(e.target.files?.[0])}/></label></div><div className="source-list">{docs.length ? docs.map(d => <div className="source-row" key={d.id || d.filename}><div className="doc-icon">{d.filename.toLowerCase().endsWith('.pdf') ? 'PDF' : d.filename.toLowerCase().endsWith('.docx') ? 'DOC' : 'MD'}</div><div className="source-info"><strong>{d.filename}</strong><small><i className={d.status === 'READY' ? 'ready-dot' : ''}/> {d.status === 'READY' ? 'Ready to search' : d.status === 'FAILED' ? 'Processing failed' : 'Processing'}</small></div><span className="more">···</span></div>) : <div className="empty-sources"><div className="upload-illustration"><UploadCloud size={21}/></div><strong>Your knowledge starts here</strong><p>Upload PDFs, Word docs, or Markdown files to make them searchable.</p><label className="browse-btn">Browse files<input type="file" accept=".pdf,.docx,.md,.markdown" onChange={e => upload(e.target.files?.[0])}/></label></div>}</div><div className="rail-note"><ShieldCheck size={16}/><p><strong>Permission-aware by design</strong><br/>Only documents shared with this workspace are used to answer questions.</p></div></aside></section>
      <footer><span>ContextOS <b>·</b> Secure knowledge for your team</span><span>Answers may need verification</span></footer>
    </main></div>;
}
