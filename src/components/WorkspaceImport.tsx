import { useState, type Dispatch, type SetStateAction, type RefObject } from 'react';
import { Workspace } from '../domain';
import { createSampleWorkspace } from '../sample';
import { importCsv, ImportKind } from '../csv';
interface Props {
  w: Workspace | null;
  setW: Dispatch<SetStateAction<Workspace | null>>;
  generationRef: RefObject<number>;
  setTicket: (s: string | null) => void;
  setPreview: (s: string) => void;
  setNotice: (s: string) => void;
}
export default function WorkspaceImport({
  w,
  setW,
  generationRef,
  setTicket,
  setPreview,
  setNotice
}: Props) {
  const [kind, setKind] = useState<ImportKind>('customers'),
    [coverage, setCoverage] = useState(''),
    [asOf, setAsOf] = useState('');
  return <div className="toolbar">
    <button className="primary" onClick={() => {
      generationRef.current++;
      setTicket(null);
      setW(createSampleWorkspace());
      setNotice('Fictional sample venue loaded.');
      setPreview('');
    }}>Load sample venue ↗</button>
    <label className="import">Import CSV<input type="file" accept=".csv" onChange={async e => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 8000000) {
          setNotice('CSV file exceeds the 8 MB upload limit.');
          return;
        }
        const gen = ++generationRef.current;
        const input = e.target;
        const text = await file.text();
        if (gen !== generationRef.current) return;
        if (!coverage || !asOf || Date.parse(coverage) > Date.parse(asOf)) {
          setNotice('Enter a valid history coverage start and as-of date before importing.');
          return;
        }
        const base: Workspace = w?.source === 'import' ? w : {
          source: 'import',
          clock: new Date(asOf).toISOString(),
          asOf: new Date(asOf).toISOString(),
          coverageStart: new Date(coverage).toISOString(),
          events: [],
          customers: [],
          orders: [],
          campaigns: [],
          feedback: [],
          clicks: []
        };
        const result = importCsv(text, base, kind, {
          coverageStart: new Date(coverage).toISOString(),
          asOf: new Date(asOf).toISOString()
        });
        setW(result.workspace);
        setNotice(`${result.imported} rows imported, ${result.skipped} unchanged. ${result.errors.map(x => `Row ${x.row}: ${x.message}`).join(' ')}`);
        input.value = '';
      }} />
    </label>
    <a href="/templates/customers.csv" download>Customers template</a>
    <a href="/templates/events.csv" download>Events template</a>
    <a href="/templates/orders.csv" download>Orders template</a>
    <select aria-label="CSV type" value={kind} onChange={e => setKind(e.target.value as ImportKind)}>
      <option>customers</option>
      <option>events</option>
      <option>orders</option>
    </select>
    <label className="fine">History start <input aria-label="History coverage start" type="date" value={coverage} onChange={e => setCoverage(e.target.value)} />
    </label>
    <label className="fine">As of <input aria-label="History as of" type="date" value={asOf} onChange={e => setAsOf(e.target.value)} />
    </label>
    <button className="quiet" onClick={() => {
      generationRef.current++;
      setTicket(null);
      setW(null);
      setPreview('');
      setNotice('This browser workspace was reset.');
    }}>Reset my demo</button>
  </div>;
}
