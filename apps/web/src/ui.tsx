import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { BookOpen, Files, Plus, Send, ShieldCheck, Sparkles, ThumbsDown, ThumbsUp, UploadCloud } from 'lucide-react';
import { apiFetch, beginSignIn, finishSignIn, isLocalAuth, signOut } from './auth';
import type { User } from 'oidc-client-ts';
type Workspace = { id: string; name: string; role: string };
type Doc = { id: string; filename: string; status: string; failure_code?: string | null };
type Citation = { documentId: string; filename: string; page: number | null; chunkId: string; quote: string };
type RequestMeta = { latencyMs?: number; model?: string; usage?: { inputTokens?: number; outputTokens?: number } };
type Conversation = { id: string; title: string; last_message?: string };
type ChatMessage = { id: string; role: 'USER' | 'ASSISTANT'; content: string; metadata?: RequestMeta & { citations?: Citation[] }; rating?: number | null };

export default function App() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspace, setWorkspace] = useState('');
  const [docs, setDocs] = useState<Doc[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversation, setConversation] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [authReady, setAuthReady] = useState(false);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const loadStarted = useRef(false);
  const initializedWorkspace = useRef('');

  useEffect(() => {
    let active = true;
    finishSignIn().then(user => {
      if (active) { setAuthUser(user); setAuthReady(true); setError(''); }
    }).catch(e => {
      if (active) { setError(e instanceof Error ? e.message : 'Could not complete sign in.'); setAuthReady(true); }
    });
    return () => { active = false; };
  }, []);

  async function load() {
    try {
      let response = await apiFetch(`/workspaces`);
      if (!response.ok) throw new Error('Could not load workspaces');
      let items: Workspace[] = await response.json();
      if (!items.length) {
        response = await apiFetch(`/workspaces`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
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
    if (!authReady || (!isLocalAuth && !authUser)) return;
    if (loadStarted.current) return;
    loadStarted.current = true;
    load();
  }, [authReady, authUser]);

  useEffect(() => {
    if (!workspace) return;
    const refresh = () => apiFetch(`/workspaces/${workspace}/documents`)
      .then(response => response.ok ? response.json() : Promise.reject())
      .then(setDocs).catch(() => {});
    refresh();
    const interval = setInterval(refresh, 4000);
    return () => clearInterval(interval);
  }, [workspace]);

  async function refreshMessages(id: string) {
    const response = await apiFetch(`/conversations/${id}/messages`);
    if (!response.ok) throw new Error('Could not load this conversation');
    const result: ChatMessage[] = await response.json();
    setMessages(result);
  }

  useEffect(() => {
    if (!workspace || initializedWorkspace.current === workspace) return;
    initializedWorkspace.current = workspace;
    (async () => {
      try {
        let response = await apiFetch(`/workspaces/${workspace}/conversations`);
        if (!response.ok) throw new Error('Could not load conversations');
        let items: Conversation[] = await response.json();
        if (!items.length) {
          response = await apiFetch(`/workspaces/${workspace}/conversations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
          if (!response.ok) throw new Error('Could not start a conversation');
          items = [await response.json()];
        }
        setConversations(items);
        setConversation(items[0].id);
      } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    })();
  }, [workspace]);

  useEffect(() => {
    if (!conversation) return;
    refreshMessages(conversation).catch(e => setError(e instanceof Error ? e.message : String(e)));
  }, [conversation]);

  async function newConversation() {
    if (!workspace) return;
    try {
      const response = await apiFetch(`/workspaces/${workspace}/conversations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      if (!response.ok) throw new Error('Could not start a conversation');
      const created: Conversation = await response.json();
      setConversations(items => [created, ...items]);
      setConversation(created.id);
      setMessages([]);
      setError('');
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }

  async function upload(file?: File) {
    if (!file || !workspace) return;
    setError('');
    const data = new FormData();
    data.append('file', file);
    try {
      const response = await apiFetch(`/workspaces/${workspace}/documents`, {
        method: 'POST', body: data,
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
      const response = await apiFetch(`/documents/${id}${action === 'retry' ? '/retry' : ''}`, {
        method: action === 'retry' ? 'POST' : 'DELETE',
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
    if (!question.trim() || !conversation) return;
    setBusy(true); setError('');
    try {
      const response = await apiFetch(`/conversations/${conversation}/messages`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || 'Request failed');
      setMessages(current => [...current, result.userMessage, result.assistantMessage]);
      setConversations(items => items.map(item => item.id === conversation ? { ...item, title: item.title === 'New conversation' ? question.slice(0, 80) : item.title, last_message: result.assistantMessage.content } : item));
      setQuestion('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function rateMessage(id: string, rating: number) {
    try {
      const response = await apiFetch(`/messages/${id}/feedback`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rating }) });
      if (!response.ok) throw new Error('Could not save feedback');
      setMessages(current => current.map(message => message.id === id ? { ...message, rating } : message));
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }

  const browseFiles = (file?: File) => upload(file);
  const filePicker = (onChange: (file?: File) => void) => (
    <input type="file" accept=".pdf,.docx,.md,.markdown" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; onChange(file); }} />
  );

  if (!authReady) return <main className="auth-screen"><p>Checking your sign in…</p></main>;
  if (!isLocalAuth && !authUser) return <main className="auth-screen"><section><span className="mark"><Sparkles size={19} /></span><h1>Sign in to ContextOS</h1><p>{error || 'Use your organization account to access workspace knowledge.'}</p><button onClick={() => beginSignIn().catch(e => setError(e instanceof Error ? e.message : 'Could not start sign in.'))}>Sign in</button></section></main>;

  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><span className="mark"><Sparkles size={19} /></span><span>context<span className="brand-light">OS</span></span></div>
      <div className="side-label">WORKSPACE</div>
      <button className="workspace"><span className="workspace-dot">P</span><span>{workspaces[0]?.name || 'Loading…'}</span><span className="chevron">⌄</span></button>
      <div className="side-label source-label">YOUR KNOWLEDGE</div>
      <div className="nav-item active"><Files size={17} /> Documents <span className="count">{docs.length}</span></div>
      <div className="side-label chat-label">RECENT CHATS <button onClick={newConversation} title="New conversation"><Plus size={14} /></button></div>
      <div className="chat-list">{conversations.map(item => <button key={item.id} className={`chat-link ${conversation === item.id ? 'selected' : ''}`} onClick={() => setConversation(item.id)}><BookOpen size={14} /><span>{item.title}</span></button>)}</div>
      <div className="sidebar-bottom">
        <div className="secure"><ShieldCheck size={16} /><span>Workspace protected<br /><small>Your data stays scoped</small></span></div>
        <div className="profile"><div className="avatar">{isLocalAuth ? 'JD' : String(authUser?.profile.name || authUser?.profile.preferred_username || 'U').slice(0, 2).toUpperCase()}</div><div>{isLocalAuth ? 'Jordan Davis' : String(authUser?.profile.name || authUser?.profile.preferred_username || 'Signed in')}<small>{isLocalAuth ? 'Local demo user' : 'Signed in'}</small></div>{isLocalAuth ? <span className="dots">•••</span> : <button className="signout" onClick={() => signOut().catch(e => setError(e instanceof Error ? e.message : 'Could not sign out.'))}>Sign out</button>}</div>
      </div>
    </aside>

    <main className="main">
      <header><div><div className="eyebrow">PRODUCT KNOWLEDGE <span> / </span> ASSISTANT</div><h1>Ask your knowledge base</h1><p className="subtitle">Answers grounded in your team’s documents, with sources you can verify.</p></div><div className="status"><i /> {isLocalAuth ? 'Local demo' : 'Signed in'}</div></header>
      {error && <div className="error" role="alert">{error}</div>}
      <section className="content">
        <div className="chat-area">
          {messages.length === 0 && <div className="welcome"><div className="welcome-icon"><Sparkles size={22} /></div><div className="eyebrow">YOUR AI KNOWLEDGE ASSISTANT</div><h2>What would you like to know?</h2><p>Ask a question about the documents in your workspace. ContextOS will find relevant passages and show you exactly where the answer comes from.</p><div className="suggestions"><button onClick={() => setQuestion('What are the key policies in the uploaded documents?')}>Summarize our key policies <span>↗</span></button><button onClick={() => setQuestion('What process should new team members follow?')}>How do our processes work? <span>↗</span></button></div></div>}
          <div className="message-thread">{messages.map(message => {
            const metadata = message.metadata || {};
            const citations = metadata.citations || [];
            return message.role === 'USER' ? <div className="message user-message" key={message.id}><div className="message-bubble">{message.content}</div></div> : <article className="response" key={message.id}>
              <div className="response-head"><span className="assistant-mark"><Sparkles size={15} /></span><strong>ContextOS</strong>{citations.length > 0 && <span className="verified"><ShieldCheck size={13} /> Source checked</span>}</div>
              <p className="answer-text">{message.content}</p>
              <div className="answer-meta">{metadata.model}{metadata.latencyMs !== undefined && ` · ${metadata.latencyMs} ms`}{metadata.usage && ` · ${metadata.usage.inputTokens ?? 0} in / ${metadata.usage.outputTokens ?? 0} out tokens`}</div>
              {citations.length > 0 && <div className="citation-list"><div className="citation-title">SOURCES <span>{citations.length}</span></div>{citations.map(citation => <article className="citation" key={citation.chunkId}><div className="file-icon">▤</div><div><strong>{citation.filename}</strong><small>{citation.page ? `Page ${citation.page} · ` : ''}Source passage</small><p>“{citation.quote}”</p></div></article>)}</div>}
              <div className="feedback-actions"><span>Was this helpful?</span><button className={message.rating === 5 ? 'rated' : ''} aria-label="Helpful" onClick={() => rateMessage(message.id, 5)}><ThumbsUp size={14} /></button><button className={message.rating === 1 ? 'rated' : ''} aria-label="Not helpful" onClick={() => rateMessage(message.id, 1)}><ThumbsDown size={14} /></button></div>
            </article>;
          })}{busy && <div className="response searching"><div className="response-head"><span className="assistant-mark"><Sparkles size={15} /></span><strong>ContextOS</strong></div><p>Searching your workspace…</p></div>}</div>
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
