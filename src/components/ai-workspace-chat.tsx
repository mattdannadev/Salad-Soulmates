'use client';

import {
  FormEvent, useEffect, useRef, useState,
} from 'react';
import {
  Check, MessageCircle, Send, Sparkles, X,
} from 'lucide-react';
import { z } from 'zod';
import styles from './ai-workspace.module.css';

type FeedbackStatus = 'New' | 'Reviewed' | 'Resolved';

interface FeedbackProposal {
  action: 'update_feedback_status';
  feedbackId: string;
  feedbackSummary: string;
  changes: {
    status: FeedbackStatus;
    resolution_note: string;
  };
}

interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  proposal?: FeedbackProposal;
  proposalState?: 'pending' | 'cancelled' | 'completed';
}

interface ApiResponse {
  ok?: boolean;
  message?: string;
  proposal?: FeedbackProposal;
  error?: string;
}

const responseSchema = z.object({
  ok: z.boolean(),
  message: z.string().optional(),
  error: z.string().optional(),
  proposal: z.object({
    action: z.literal('update_feedback_status'),
    feedbackId: z.string(),
    feedbackSummary: z.string(),
    changes: z.object({
      status: z.enum(['New', 'Reviewed', 'Resolved']),
      resolution_note: z.string(),
    }),
  }).optional(),
});

async function postWorkspace(body: unknown): Promise<ApiResponse> {
  const response = await fetch('/api/ai-workspace', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = responseSchema.parse(await response.json());
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || payload.message || 'The request could not be completed.');
  }
  return payload;
}

function ProposalCard({
  proposal,
  state,
  busy,
  onChange,
  onConfirm,
  onCancel,
}: {
  proposal: FeedbackProposal;
  state: 'pending' | 'cancelled' | 'completed';
  busy: boolean;
  onChange: (proposal: FeedbackProposal) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<FeedbackStatus>(proposal.changes.status);
  const [note, setNote] = useState(proposal.changes.resolution_note);
  const pending = state === 'pending';

  return (
    <div className={styles.proposal} aria-label="Proposed feedback update">
      <div className={styles.proposalHeading}>
        <strong>Update feedback</strong>
        <span className={styles.state}>{({ pending: 'Needs approval', completed: 'Saved', cancelled: 'Cancelled' })[state]}</span>
      </div>
      <p className={styles.summary}>{proposal.feedbackSummary}</p>
      <dl className={styles.details}>
        <div>
          <dt>Feedback ID</dt>
          <dd>{proposal.feedbackId}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{proposal.changes.status}</dd>
        </div>
        <div>
          <dt>Resolution note</dt>
          <dd>{proposal.changes.resolution_note || 'None'}</dd>
        </div>
      </dl>
      {editing && pending && (
        <div className={styles.editForm}>
          <label htmlFor={`status-${proposal.feedbackId}`}>Status</label>
          <select
            id={`status-${proposal.feedbackId}`}
            value={status}
            onChange={(event) => {
              const { value } = event.target;
              if (value === 'New' || value === 'Reviewed' || value === 'Resolved') setStatus(value);
            }}
          >
            <option>New</option>
            <option>Reviewed</option>
            <option>Resolved</option>
          </select>
          <label htmlFor={`note-${proposal.feedbackId}`}>Resolution note</label>
          <textarea id={`note-${proposal.feedbackId}`} value={note} onChange={(event) => setNote(event.target.value)} rows={3} maxLength={2000} />
          <button
            type="button"
            className="secondary"
            onClick={() => {
              onChange({ ...proposal, changes: { status, resolution_note: note.trim() } });
              setEditing(false);
            }}
          >
            Save draft
          </button>
        </div>
      )}
      {pending && !editing && (
        <div className={styles.actions}>
          <button type="button" onClick={onConfirm} disabled={busy}>
            <Check size={16} aria-hidden="true" />
            Confirm update
          </button>
          <button type="button" className="secondary" onClick={() => setEditing(true)} disabled={busy}>Edit</button>
          <button type="button" className="secondary" onClick={onCancel} disabled={busy}>
            <X size={16} aria-hidden="true" />
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

export default function AiWorkspaceChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const nextId = useRef(0);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, busy]);

  const addMessage = (message: Omit<ChatMessage, 'id'>) => {
    const id = nextId.current + 1;
    nextId.current = id;
    setMessages((current) => [...current, { ...message, id }]);
    return id;
  };

  const updateMessage = (id: number, change: Partial<ChatMessage>) => {
    setMessages((current) => current.map((message) => (
      message.id === id ? { ...message, ...change } : message
    )));
  };

  const send = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    const history = messages.map(({ role, content }) => ({ role, content })).slice(-12);
    setDraft('');
    setError('');
    addMessage({ role: 'user', content: text });
    setBusy(true);
    try {
      const response = await postWorkspace({ mode: 'plan', message: text, history });
      addMessage({
        role: 'assistant',
        content: response.message || 'Here is a proposed update for you to review.',
        proposal: response.proposal,
        proposalState: response.proposal ? 'pending' : undefined,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The request could not be completed.');
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (id: number, proposal: FeedbackProposal) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await postWorkspace({ mode: 'execute', proposal });
      updateMessage(id, { proposalState: 'completed' });
      addMessage({ role: 'assistant', content: response.message || 'The feedback was updated.' });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The update could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={styles.workspace} aria-label="AI workspace chat">
      <div className={styles.intro}>
        <span className={styles.introIcon}><Sparkles size={20} aria-hidden="true" /></span>
        <div>
          <h2>What would you like to do?</h2>
          <p>
            Find feedback, ask a question, or describe a change.
            You will review any update before it is saved.
          </p>
        </div>
      </div>

      <div className={styles.conversation} role="log" aria-live="polite" aria-relevant="additions text">
        {messages.length === 0 && (
          <div className={styles.empty}>
            <MessageCircle size={28} aria-hidden="true" />
            <p>Try “Show me recent feedback” or “Mark the packaging issue as reviewed.”</p>
          </div>
        )}
        {messages.map((message) => (
          <article className={`${styles.message} ${message.role === 'user' ? styles.user : styles.assistant}`} key={message.id}>
            <span className={styles.speaker}>{message.role === 'user' ? 'You' : 'AI Workspace'}</span>
            <div className={styles.messageBody}>{message.content}</div>
            {message.proposal && (
              <ProposalCard
                proposal={message.proposal}
                state={message.proposalState || 'pending'}
                busy={busy}
                onChange={(proposal) => updateMessage(message.id, { proposal })}
                onConfirm={() => {
                  if (message.proposal) {
                    confirm(message.id, message.proposal).catch((cause: unknown) => {
                      setError(cause instanceof Error ? cause.message : 'The update could not be saved.');
                    });
                  }
                }}
                onCancel={() => updateMessage(message.id, { proposalState: 'cancelled' })}
              />
            )}
          </article>
        ))}
        {busy && <p className={styles.working} role="status">Working…</p>}
        <div ref={bottom} />
      </div>

      {error && <div className={styles.error} role="alert">{error}</div>}
      <form
        onSubmit={(event) => {
          send(event).catch((cause: unknown) => {
            setError(cause instanceof Error ? cause.message : 'The request could not be completed.');
          });
        }}
        className={styles.composer}
      >
        <label className={styles.label} htmlFor="workspace-prompt">Your request</label>
        <div className={styles.composerRow}>
          <textarea
            id="workspace-prompt"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder="Ask a question or describe an action…"
            rows={2}
            maxLength={1500}
            disabled={busy}
          />
          <button type="submit" disabled={busy || !draft.trim()} aria-label="Send request">
            <Send size={18} aria-hidden="true" />
            Send
          </button>
        </div>
        <small>Enter to send · Shift + Enter for a new line</small>
      </form>
    </section>
  );
}
