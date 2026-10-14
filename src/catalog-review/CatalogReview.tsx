'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Download, Search, Upload, ExternalLink, Save } from 'lucide-react';
import { oemDatabase } from '@/data/oem';
import { filterOccurrences, getOccurrenceDetails } from '@/oem/queries';
import { applyReviewPatches } from '@/oem/review';
import { validateReviewPatchSet } from '@/oem/validation';
import type { CatalogFilters, ReviewPatch, ReviewPatchSet, ReviewStatus } from '@/oem/types';
import { downloadCatalog, loadReviewPatches, saveReviewPatches } from './storage';
import './review.css';

export default function CatalogReview() {
  const [patches, setPatches] = useState<ReviewPatchSet>({ version: 1, patches: [] });
  const [filters, setFilters] = useState<CatalogFilters>({});
  const [limit, setLimit] = useState(150);
  const [selectedId, setSelectedId] = useState(oemDatabase.occurrences[0]?.id ?? '');
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState(
    'Review source evidence; edits are saved only in this browser.',
  );
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [number, setNumber] = useState('');
  const [quantity, setQuantity] = useState('');
  const [assemblyId, setAssemblyId] = useState('');
  const [status, setStatus] = useState<ReviewStatus>('unreviewed');
  const [note, setNote] = useState('');
  const [bulkStatus, setBulkStatus] = useState<ReviewStatus>('source-checked');
  const [bulkAssembly, setBulkAssembly] = useState('');
  const [localPdfs, setLocalPdfs] = useState<Record<string, string>>({});
  const pdfUrls = useRef<string[]>([]);
  const jsonInput = useRef<HTMLInputElement>(null);
  const database = useMemo(() => applyReviewPatches(oemDatabase, patches), [patches]);
  const occurrences = useMemo(() => filterOccurrences(database, filters), [database, filters]);
  const rows = useMemo(
    () =>
      occurrences
        .slice(0, limit)
        .map((occurrence) => getOccurrenceDetails(database, occurrence.id)!),
    [occurrences, limit, database],
  );
  const selected = useMemo(
    () => getOccurrenceDetails(database, selectedId),
    [database, selectedId],
  );
  const years = useMemo(
    () =>
      [...new Set(oemDatabase.sourceRows.flatMap((row) => row.modelYears))].sort((a, b) => a - b),
    [],
  );

  useEffect(() => {
    try {
      const loaded = loadReviewPatches();
      applyReviewPatches(oemDatabase, loaded);
      setPatches(loaded);
      const requested = new URLSearchParams(window.location.search).get('occurrence');
      if (requested && oemDatabase.occurrences.some((item) => item.id === requested))
        setSelectedId(requested);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load saved review.');
    }
    return () => pdfUrls.current.forEach(URL.revokeObjectURL);
  }, []);
  useEffect(() => {
    if (!selected) return;
    setName(selected.part.normalizedName);
    setNumber(selected.part.oemNumber ?? '');
    setQuantity(selected.occurrence.quantity?.toString() ?? '');
    setAssemblyId(selected.occurrence.assemblyId);
    setStatus(selected.occurrence.reviewStatus);
    setNote(database.reviewPatches.find((patch) => patch.occurrenceId === selectedId)?.note ?? '');
  }, [selected, database, selectedId]);

  function changeFilter(patch: Partial<CatalogFilters>) {
    setFilters((previous) => ({ ...previous, ...patch }));
    setLimit(150);
    setChecked(new Set());
  }
  function commit(changes: Omit<ReviewPatch, 'updatedAt'>[]) {
    try {
      const merged = new Map(patches.patches.map((patch) => [patch.occurrenceId, patch]));
      for (const patch of changes)
        merged.set(patch.occurrenceId, {
          ...merged.get(patch.occurrenceId),
          ...patch,
          updatedAt: new Date().toISOString(),
        });
      const next: ReviewPatchSet = { version: 1, patches: [...merged.values()] };
      saveReviewPatches(oemDatabase, next);
      setPatches(next);
      setError('');
      setMessage(
        `Saved review for ${changes.length} occurrence${changes.length === 1 ? '' : 's'}. Original source claims are unchanged.`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Review validation failed.');
    }
  }
  function saveSelected() {
    if (!selected) return;
    const override: Omit<ReviewPatch, 'updatedAt'> = {
      occurrenceId: selectedId,
      normalizedName: name,
      assemblyId,
      reviewStatus: status,
      note,
    };
    const nextNumber = number.trim() || null;
    const nextQuantity = quantity.trim() ? Number(quantity) : null;
    if (
      nextNumber !== selected.sourceRow.oemNumber ||
      database.reviewPatches.some((p) => p.occurrenceId === selectedId && 'oemNumber' in p)
    )
      override.oemNumber = nextNumber;
    if (
      nextQuantity !== selected.sourceRow.quantity ||
      database.reviewPatches.some((p) => p.occurrenceId === selectedId && 'quantity' in p)
    )
      override.quantity = nextQuantity;
    commit([override]);
  }
  async function openPdf(file: File | undefined) {
    if (!file || !selected) return;
    try {
      const bytes = await file.arrayBuffer();
      const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
        .map((value) => value.toString(16).padStart(2, '0'))
        .join('');
      if (selected.source.sha256 && digest !== selected.source.sha256)
        throw new Error(
          'This PDF does not match the audited source fingerprint. Select the original document listed below.',
        );
      const url = URL.createObjectURL(file);
      pdfUrls.current.push(url);
      setLocalPdfs((previous) => ({ ...previous, [selected.source.id]: url }));
      setMessage('Original PDF attached locally. No document was uploaded or published.');
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not open local PDF.');
    }
  }
  async function importPatches(file: File | undefined) {
    if (!file) return;
    try {
      const input = JSON.parse(await file.text());
      const payload = input.patches ? input : { version: 1, patches: input.reviewPatches };
      const result = validateReviewPatchSet(payload);
      if (!result.success) throw new Error(result.issues.map((issue) => issue.message).join('; '));
      saveReviewPatches(oemDatabase, result.data);
      setPatches(result.data);
      setError('');
      setMessage('Review patches imported. Source claims remain unchanged.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Invalid review JSON.');
    }
  }
  const statuses: ReviewStatus[] = [
    'unreviewed',
    'needs-review',
    'source-checked',
    'mechanically-verified',
  ];
  return (
    <main className="review-shell">
      <header className="review-header">
        <Link href="/" className="review-back">
          <ArrowLeft size={17} />
          Explorer
        </Link>
        <div>
          <span className="eyebrow">Local catalog workspace</span>
          <h1>OEM source review</h1>
        </div>
        <Link href="/editor">
          Model mapping <ExternalLink size={14} />
        </Link>
        <Button onClick={() => jsonInput.current?.click()}>
          <Upload size={15} />
          Import review
        </Button>
        <Button onClick={() => downloadCatalog(patches, 'oem-review-patches.json')}>
          <Download size={15} />
          Export edits
        </Button>
        <Button
          variant="primary"
          className="review-primary"
          onClick={() => downloadCatalog(database, 'surron-oem-catalog.json')}
        >
          <Download size={15} />
          Export complete catalog
        </Button>
        <input
          type="file"
          accept=".json"
          ref={jsonInput}
          hidden
          aria-label="Import review JSON"
          onChange={(event) => {
            void importPatches(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
      </header>
      <div className="review-summary">
        <span>
          <strong>{database.parts.length}</strong> distinct part identities
        </span>
        <span>
          <strong>{database.occurrences.length}</strong> source occurrences
        </span>
        <span>
          <strong>{database.sources.filter((source) => source.kind === 'pdf').length}</strong>{' '}
          audited PDFs
        </span>
        <span>
          <strong>{database.conflicts.length}</strong> discrepancies
        </span>
        <span>{patches.patches.length} local edits</span>
      </div>
      <div className="review-status" role="status" aria-label="Catalog review status">
        {message}
      </div>
      {error && (
        <div className="review-error" role="alert">
          {error}
        </div>
      )}
      <section className="review-filters" aria-label="Catalog review filters">
        <label className="review-search">
          <Search size={16} />
          <input
            aria-label="Search OEM records"
            placeholder="OEM number, description or callout"
            value={filters.text ?? ''}
            onChange={(event) => changeFilter({ text: event.target.value })}
          />
        </label>
        <select
          aria-label="Filter assembly"
          value={filters.assemblyId ?? ''}
          onChange={(event) => changeFilter({ assemblyId: event.target.value || undefined })}
        >
          <option value="">All assemblies</option>
          {database.assemblies.map((assembly) => (
            <option key={assembly.id} value={assembly.id}>
              {assembly.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter source"
          value={filters.sourceId ?? ''}
          onChange={(event) => changeFilter({ sourceId: event.target.value || undefined })}
        >
          <option value="">All sources</option>
          {database.sources.map((source) => (
            <option key={source.id} value={source.id}>
              {source.title}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter model year"
          value={filters.modelYear ?? ''}
          onChange={(event) =>
            changeFilter({
              modelYear:
                event.target.value === 'unknown'
                  ? 'unknown'
                  : event.target.value
                    ? Number(event.target.value)
                    : undefined,
            })
          }
        >
          <option value="">All source years</option>
          {years.map((year) => (
            <option key={year} value={year}>
              MY{year}
            </option>
          ))}
          <option value="unknown">Year unspecified</option>
        </select>
        <select
          aria-label="Filter review issues"
          value={filters.issue ?? ''}
          onChange={(event) =>
            changeFilter({ issue: (event.target.value || undefined) as CatalogFilters['issue'] })
          }
        >
          <option value="">All records</option>
          <option value="missing-oem">Missing OEM number</option>
          <option value="missing-quantity">Missing quantity</option>
          <option value="dimensions">Dimensions to verify</option>
          <option value="conflicts">Conflicting claims</option>
          <option value="duplicate-oem">Repeated OEM identity</option>
          <option value="needs-review">Needs review</option>
          <option value="unmapped">Awaiting geometry</option>
        </select>
      </section>
      <div className="review-workspace">
        <section className="review-table-panel" aria-label="Imported catalog records">
          <div className="review-table-heading">
            <strong>{occurrences.length} matching occurrences</strong>
            <button onClick={() => setChecked(new Set(rows.map((row) => row.occurrence.id)))}>
              Select displayed
            </button>
            <button onClick={() => setChecked(new Set())}>Clear selection</button>
          </div>
          {checked.size > 0 && (
            <div className="review-bulk">
              <span>{checked.size} selected</span>
              <select
                aria-label="Bulk verification status"
                value={bulkStatus}
                onChange={(event) => setBulkStatus(event.target.value as ReviewStatus)}
              >
                {statuses.map((value) => (
                  <option key={value} value={value}>
                    {value.replaceAll('-', ' ')}
                  </option>
                ))}
              </select>
              <button
                onClick={() =>
                  commit(
                    [...checked].map((occurrenceId) => ({
                      occurrenceId,
                      reviewStatus: bulkStatus,
                      note: note || 'Bulk reviewer status update',
                    })),
                  )
                }
              >
                Apply status
              </button>
              <select
                aria-label="Bulk parent assembly"
                value={bulkAssembly}
                onChange={(event) => setBulkAssembly(event.target.value)}
              >
                <option value="">Move to assembly…</option>
                {database.assemblies.map((assembly) => (
                  <option key={assembly.id} value={assembly.id}>
                    {assembly.name}
                  </option>
                ))}
              </select>
              <button
                disabled={!bulkAssembly}
                onClick={() =>
                  commit(
                    [...checked].map((occurrenceId) => ({
                      occurrenceId,
                      assemblyId: bulkAssembly,
                      note: note || 'Reviewer assigned assembly relationship',
                    })),
                  )
                }
              >
                Move selected
              </button>
            </div>
          )}
          <div className="review-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Select</th>
                  <th>Part / OEM identity</th>
                  <th>Qty</th>
                  <th>Assembly</th>
                  <th>Source · page / figure / callout</th>
                  <th>Review</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.occurrence.id}
                    className={selectedId === row.occurrence.id ? 'active' : ''}
                  >
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Select ${row.sourceRow.id}`}
                        checked={checked.has(row.occurrence.id)}
                        onChange={() =>
                          setChecked((previous) => {
                            const next = new Set(previous);
                            if (next.has(row.occurrence.id)) next.delete(row.occurrence.id);
                            else next.add(row.occurrence.id);
                            return next;
                          })
                        }
                      />
                    </td>
                    <td>
                      <button onClick={() => setSelectedId(row.occurrence.id)}>
                        {row.part.normalizedName}
                        <code>{row.part.oemNumber ?? 'No OEM number in source'}</code>
                      </button>
                    </td>
                    <td>{row.occurrence.quantity ?? '—'}</td>
                    <td>{row.assembly.name}</td>
                    <td>
                      <span>{row.source.title}</span>
                      <small>
                        {row.source.kind === 'pdf' ? `p. ${row.sourceRow.page} · ` : ''}
                        {row.sourceRow.figure} · {row.sourceRow.callout ?? 'No callout'}
                      </small>
                    </td>
                    <td>
                      <span className="review-record-status">
                        {row.occurrence.reviewStatus.replaceAll('-', ' ')}
                      </span>
                      {row.conflicts.length > 0 && (
                        <small>{row.conflicts.length} discrepancies</small>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && <p className="review-empty">No records match these filters.</p>}
            {occurrences.length > limit && (
              <button className="review-more" onClick={() => setLimit((value) => value + 150)}>
                Show next 150 records
              </button>
            )}
          </div>
        </section>
        <aside className="review-inspector" aria-label="Source record editor">
          {selected ? (
            <>
              <span className="eyebrow">REVIEW AN OCCURRENCE</span>
              <h2>{selected.part.normalizedName}</h2>
              <code className="review-oem">
                {selected.part.oemNumber ?? 'No OEM number recorded'}
              </code>
              <Link
                className="review-open-part"
                href={`/?part=${encodeURIComponent(selected.occurrence.id)}&assembly=${encodeURIComponent(selected.occurrence.assemblyId)}`}
              >
                Open in explorer <ExternalLink size={14} />
              </Link>
              <section>
                <h3>Editable review</h3>
                <label>
                  Normalized English name
                  <input value={name} onChange={(event) => setName(event.target.value)} />
                </label>
                <label>
                  OEM number override
                  <input value={number} onChange={(event) => setNumber(event.target.value)} />
                </label>
                <label>
                  Quantity override
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={quantity}
                    onChange={(event) => setQuantity(event.target.value)}
                  />
                </label>
                <label>
                  Assembly relationship
                  <select
                    value={assemblyId}
                    onChange={(event) => setAssemblyId(event.target.value)}
                  >
                    {database.assemblies.map((assembly) => (
                      <option key={assembly.id} value={assembly.id}>
                        {assembly.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Verification status
                  <select
                    value={status}
                    onChange={(event) => setStatus(event.target.value as ReviewStatus)}
                  >
                    {statuses.map((value) => (
                      <option key={value} value={value}>
                        {value.replaceAll('-', ' ')}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Review notes / correction evidence
                  <textarea
                    rows={3}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Required when overriding source OEM number or quantity"
                  />
                </label>
                <Button variant="primary" onClick={saveSelected}>
                  <Save size={15} />
                  Save reviewed occurrence
                </Button>
              </section>
              <section>
                <h3>Original source claim</h3>
                <dl>
                  <dt>Description</dt>
                  <dd>{selected.sourceRow.originalDescription}</dd>
                  <dt>OEM number</dt>
                  <dd>{selected.sourceRow.oemNumber ?? 'Not recorded'}</dd>
                  <dt>Quantity</dt>
                  <dd>{selected.sourceRow.quantityText ?? 'Not recorded'}</dd>
                  {selected.sourceRow.dimensionsText && (
                    <>
                      <dt>Dimensions</dt>
                      <dd>
                        {selected.sourceRow.dimensionsText}
                        {selected.sourceRow.dimensionUnitText && (
                          <small>{selected.sourceRow.dimensionUnitText}</small>
                        )}
                      </dd>
                    </>
                  )}
                  {selected.sourceRow.weightText && (
                    <>
                      <dt>Weight</dt>
                      <dd>
                        {selected.sourceRow.weightText}
                        {selected.sourceRow.weightUnitText && (
                          <small>{selected.sourceRow.weightUnitText}</small>
                        )}
                      </dd>
                    </>
                  )}
                  {selected.sourceRow.material && (
                    <>
                      <dt>Material</dt>
                      <dd>{selected.sourceRow.material}</dd>
                    </>
                  )}
                  <dt>Year evidence</dt>
                  <dd>{selected.sourceRow.applicability ?? 'Unspecified; no fitment inferred'}</dd>
                  <dt>Extraction confidence</dt>
                  <dd>{selected.sourceRow.confidence}</dd>
                </dl>
              </section>
              <section>
                <h3>Source location</h3>
                <p>
                  {selected.source.title}
                  <br />
                  Page {selected.sourceRow.page} · Figure {selected.sourceRow.figure}
                  <br />
                  Callout {selected.sourceRow.callout ?? 'not printed'}
                </p>
                <a
                  href={`${selected.source.url}${selected.source.kind === 'pdf' ? `#page=${selected.sourceRow.page}` : ''}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open external reference <ExternalLink size={13} />
                </a>
                {selected.source.kind === 'pdf' && (
                  <>
                    <label className="review-pdf-input">
                      Attach original PDF locally
                      <input
                        type="file"
                        accept=".pdf,application/pdf"
                        aria-label="Attach local source PDF"
                        onChange={(event) => {
                          void openPdf(event.target.files?.[0]);
                          event.target.value = '';
                        }}
                      />
                    </label>
                    <small>{selected.source.filename} · fingerprint checked; never uploaded.</small>
                    {localPdfs[selected.source.id] && (
                      <a
                        className="review-open-part"
                        href={`${localPdfs[selected.source.id]}#page=${selected.sourceRow.page}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open local PDF at page {selected.sourceRow.page}
                      </a>
                    )}
                  </>
                )}
              </section>
              {selected.conflicts.length > 0 && (
                <section>
                  <h3>Conflicting source claims</h3>
                  {selected.conflicts.map((conflict) => (
                    <details className="review-conflict" key={conflict.id}>
                      <summary>
                        {conflict.kind} discrepancy · {conflict.claims.length} claims
                      </summary>
                      <p>{conflict.explanation}</p>
                      <ul>
                        {conflict.claims.map((claim) => (
                          <li key={claim.occurrenceId}>
                            <button onClick={() => setSelectedId(claim.occurrenceId)}>
                              {claim.value}
                              <small>{claim.occurrenceId}</small>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </details>
                  ))}
                </section>
              )}
              {selected.sourceRow.reviewFlags.length > 0 && (
                <section>
                  <h3>Extraction review flags</h3>
                  <ul className="review-notes">
                    {selected.sourceRow.reviewFlags.map((flag, i) => (
                      <li key={i}>{flag.replaceAll('-', ' ')}</li>
                    ))}
                  </ul>
                </section>
              )}
              {selected.sourceRow.notes.length > 0 && (
                <section>
                  <h3>Notes preserved from extraction</h3>
                  {selected.sourceRow.notes.map((value, i) => (
                    <p key={i}>{value}</p>
                  ))}
                </section>
              )}
              <details>
                <summary>Raw extracted evidence</summary>
                <pre>{selected.sourceRow.rawText}</pre>
              </details>
              <p className="muted">
                This catalog identity appears in {selected.part.sourceRowIds.length} source records.
                Occurrence quantities are not a motorcycle-wide parts total.
              </p>
            </>
          ) : (
            <p>Select a source record.</p>
          )}
        </aside>
      </div>
    </main>
  );
}
