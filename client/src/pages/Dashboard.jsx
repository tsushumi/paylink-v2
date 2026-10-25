import { useCallback, useEffect, useState } from 'react';
import { useNotifications } from '../context/NotificationContext';
import PaymentChart from '../components/PaymentChart';
import { socket } from '../socket';
import { api, kes } from '../api';

function Stat({ label, value, hint, tone }) {
  return (
    <div className="card stat">
      <p className="stat-label">{label}</p>
      <p className={`stat-value ${tone || ''}`}>{value}</p>
      {hint && <p className="muted small">{hint}</p>}
    </div>
  );
}

function CreateLink({ onCreated }) {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/payment-links', { method: 'POST', body: { description, amount: Number(amount) } });
      setDescription('');
      setAmount('');
      onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card inline-form" onSubmit={submit}>
      <h3>New payment link</h3>
      <div className="row">
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is it for?" maxLength={120} required />
        <input type="number" min="1" max="150000" step="1" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount (KES)" required />
        <button className="btn primary" disabled={busy}>Create</button>
      </div>
      {error && <p className="error">{error}</p>}
    </form>
  );
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt('Copy this link:', text);
    }
  };
  return (
    <button className="btn small" onClick={copy}>
      {copied ? 'Copied' : 'Copy link'}
    </button>
  );
}

const FEED_SIZE = 8;

// Real-time payment feed: seeded from the API, then updated by 'payment-update' socket events.
function LiveFeed() {
  const [items, setItems] = useState(null);
  const [fresh, setFresh] = useState(() => new Set());

  useEffect(() => {
    let alive = true;
    api(`/payments?limit=${FEED_SIZE}`)
      .then((r) => alive && setItems(r.data))
      .catch(() => alive && setItems([]));

    const onUpdate = (p) => {
      setItems((list) => [p, ...(list || []).filter((x) => x.id !== p.id)].slice(0, FEED_SIZE));
      setFresh((s) => new Set(s).add(`${p.id}:${p.status}`));
    };
    socket.on('payment-update', onUpdate);
    return () => {
      alive = false;
      socket.off('payment-update', onUpdate);
    };
  }, []);

  return (
    <div className="card">
      <h3>Live payments <span className="live on small-pill">Live</span></h3>
      {items === null ? (
        <p className="muted small">Loading...</p>
      ) : items.length === 0 ? (
        <p className="muted small">Payments will appear here the moment a customer starts paying.</p>
      ) : (
        <ul className="list" aria-live="polite">
          {items.map((p) => (
            <li key={`${p.id}:${p.status}`} className={`list-row ${fresh.has(`${p.id}:${p.status}`) ? 'flash' : ''}`}>
              <div>
                <strong>{kes(p.amount)}</strong> <span className="muted small">· {p.description}</span>
                <p className="muted small">
                  {p.phone} · {new Date(p.paidAt || p.createdAt).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}
                  {p.mpesaReceiptNumber ? ` · ${p.mpesaReceiptNumber}` : ''}
                  {p.status === 'failed' && p.failureReason ? ` · ${p.failureReason}` : ''}
                </p>
              </div>
              <span className={`pill ${p.status}`}>{p.status}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { paymentTick } = useNotifications();
  const [analytics, setAnalytics] = useState(null);
  const [links, setLinks] = useState([]);
  const [error, setError] = useState('');

  const loadAll = useCallback(async () => {
    try {
      const [a, l] = await Promise.all([api('/analytics'), api('/payment-links')]);
      setAnalytics(a);
      setLinks(l);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, []);

  // Initial load, and again whenever a payment notification arrives (live stats and chart).
  useEffect(() => {
    loadAll();
  }, [loadAll, paymentTick]);

  if (error) return <p className="error">{error}</p>;
  if (!analytics) return <p className="muted">Loading dashboard...</p>;

  return (
    <>
      <h2>Dashboard</h2>
      <div className="stats">
        <Stat label="Total revenue" value={kes(analytics.totalRevenue)} hint={`Avg ${kes(analytics.averagePayment)} per payment`} />
        <Stat label="Pending payments" value={analytics.pendingCount} tone={analytics.pendingCount ? 'amber' : ''} />
        <Stat label="Completed payments" value={analytics.completedCount} />
        <Stat
          label="Conversion rate"
          value={`${analytics.conversionRate}%`}
          hint={`${analytics.completedCount} of ${analytics.totalAttempts} attempts`}
        />
      </div>

      <PaymentChart data={analytics.chartData} />

      <LiveFeed />

      <CreateLink onCreated={loadAll} />

      <div className="card">
        <h3>Your payment links</h3>
        {links.length === 0 ? (
          <p className="muted small">No links yet. Create one above and share it with a customer.</p>
        ) : (
          <ul className="list">
            {links.map((l) => {
              const url = `${window.location.origin}/pay/${l.id}`;
              return (
                <li key={l.id} className="list-row">
                  <div>
                    <strong>{l.description}</strong>
                    <p className="muted small">{kes(l.amount)} · {l.paidCount} paid</p>
                  </div>
                  <div className="row-actions">
                    <a className="btn small" href={url} target="_blank" rel="noreferrer">Open</a>
                    <CopyButton text={url} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
