import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, kes } from '../api';

const EMPTY = { status: '', from: '', to: '', minAmount: '', maxAmount: '' };

// Filters live in the URL (?status=completed&from=...), so a filtered view survives reloads and can be shared.
export default function PaymentHistory() {
  const [params, setParams] = useSearchParams();
  const applied = {
    status: params.get('status') || '',
    from: params.get('from') || '',
    to: params.get('to') || '',
    minAmount: params.get('minAmount') || '',
    maxAmount: params.get('maxAmount') || '',
  };
  const page = Math.max(1, Number(params.get('page')) || 1);
  const limit = [10, 20, 50].includes(Number(params.get('limit'))) ? Number(params.get('limit')) : 20;

  const [form, setForm] = useState(applied);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const query = params.toString();

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const q = new URLSearchParams(query);
    q.set('page', String(page));
    q.set('limit', String(limit));
    api(`/payments?${q}`)
      .then((r) => {
        if (!alive) return;
        setResult(r);
        setError('');
      })
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [query, page, limit]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const apply = (e) => {
    e.preventDefault();
    const next = new URLSearchParams();
    Object.entries(form).forEach(([k, v]) => v && next.set(k, v));
    if (limit !== 20) next.set('limit', String(limit));
    setParams(next);
  };
  const reset = () => {
    setForm(EMPTY);
    setParams(limit !== 20 ? { limit: String(limit) } : {});
  };
  const go = (p) => {
    const next = new URLSearchParams(params);
    next.set('page', String(p));
    setParams(next);
  };
  const setLimit = (v) => {
    const next = new URLSearchParams(params);
    next.set('limit', v);
    next.delete('page');
    setParams(next);
  };

  const pg = result?.pagination;
  const from = pg && pg.total ? (pg.page - 1) * pg.limit + 1 : 0;
  const to = pg ? Math.min(pg.page * pg.limit, pg.total) : 0;

  return (
    <>
      <h2>Payment history</h2>

      <form className="card filters" onSubmit={apply}>
        <label className="field">
          <span>Status</span>
          <select value={form.status} onChange={set('status')}>
            <option value="">All</option>
            <option value="completed">Completed</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
          </select>
        </label>
        <label className="field">
          <span>From</span>
          <input type="date" value={form.from} onChange={set('from')} />
        </label>
        <label className="field">
          <span>To</span>
          <input type="date" value={form.to} onChange={set('to')} />
        </label>
        <label className="field">
          <span>Min amount (KES)</span>
          <input type="number" min="0" step="1" value={form.minAmount} onChange={set('minAmount')} placeholder="0" />
        </label>
        <label className="field">
          <span>Max amount (KES)</span>
          <input type="number" min="0" step="1" value={form.maxAmount} onChange={set('maxAmount')} placeholder="Any" />
        </label>
        <div className="filter-actions">
          <button className="btn primary">Apply filters</button>
          <button type="button" className="btn" onClick={reset}>Reset</button>
        </div>
      </form>

      <div className="card">
        {error && <p className="error">{error}</p>}
        {!result && !error && <p className="muted">Loading...</p>}
        {result && (
          <>
            <div className="table-wrap" aria-busy={loading}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>For</th>
                    <th>Payer</th>
                    <th className="num">Amount</th>
                    <th>Status</th>
                    <th>M-Pesa receipt</th>
                  </tr>
                </thead>
                <tbody>
                  {result.data.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="empty">No payments match these filters.</td>
                    </tr>
                  ) : (
                    result.data.map((p) => (
                      <tr key={p.id}>
                        <td>{new Date(p.paidAt || p.createdAt).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                        <td>{p.description}</td>
                        <td>{p.phone}</td>
                        <td className="num"><strong>{kes(p.amount)}</strong></td>
                        <td><span className={`pill ${p.status}`}>{p.status}</span></td>
                        <td className="mono">{p.mpesaReceiptNumber || (p.failureReason ? <span className="muted small">{p.failureReason}</span> : '-')}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="pager">
              <span className="muted small">
                {pg.total ? `Showing ${from}-${to} of ${pg.total}` : '0 payments'}
              </span>
              <div className="pager-controls">
                <label className="small muted">
                  Rows{' '}
                  <select value={limit} onChange={(e) => setLimit(e.target.value)}>
                    <option>10</option>
                    <option>20</option>
                    <option>50</option>
                  </select>
                </label>
                <button className="btn small" disabled={pg.page <= 1} onClick={() => go(pg.page - 1)}>Previous</button>
                <span className="small">Page {pg.page} of {Math.max(1, pg.totalPages)}</span>
                <button className="btn small" disabled={pg.page >= pg.totalPages} onClick={() => go(pg.page + 1)}>Next</button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
