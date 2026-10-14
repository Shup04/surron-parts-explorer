'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowUpRight } from 'lucide-react';
import type { OemDatabase } from '@/oem/types';
import { getOccurrenceDetails } from '@/oem/queries';

export function OemDetails({
  database,
  occurrenceId,
  hasGeometry,
  onNavigate,
  actions,
}: {
  database: OemDatabase;
  occurrenceId: string;
  hasGeometry: boolean;
  onNavigate: (id: string) => void;
  onIsolate?: () => void;
  actions?: ReactNode;
}) {
  const detail = getOccurrenceDetails(database, occurrenceId);
  if (!detail) return null;
  const { part, occurrence, sourceRow: row, source, assembly, conflicts, patch } = detail;
  const otherOccurrences = database.occurrences.filter(
    (item) => item.partId === part.id && item.id !== occurrenceId,
  );
  return (
    <div className="oem-part-details">
      <h2>{part.normalizedName}</h2>
      {part.oemNumber && <code className="oem-number">{part.oemNumber}</code>}
      {actions}
      <div className="detail-section">
        <dl>
          {row.dimensionsText && (
            <>
              <dt>Source dimensions</dt>
              <dd>
                {row.dimensionsText}
                {row.dimensionUnitText && ` ${row.dimensionUnitText}`}
              </dd>
            </>
          )}
          {row.weightText && (
            <>
              <dt>Source weight</dt>
              <dd>
                {row.weightText}
                {row.weightUnitText && ` ${row.weightUnitText}`}
              </dd>
            </>
          )}
          {row.material && (
            <>
              <dt>Material</dt>
              <dd>{row.material}</dd>
            </>
          )}
          <dt>Source assembly</dt>
          <dd>
            <button className="inline-link" onClick={() => onNavigate(assembly.id)}>
              {assembly.name}
            </button>
          </dd>
          {occurrence.quantity !== null && (
            <>
              <dt>Quantity in source</dt>
              <dd>
                {occurrence.quantity}
                {patch && 'quantity' in patch && <small> · corrected</small>}
              </dd>
            </>
          )}
        </dl>
      </div>
      <details className="detail-section oem-conflict">
        <summary>Source &amp; verification</summary>
        <div className="source-card">
          <strong>{source.title}</strong>
          <p>
            {source.kind === 'pdf' && `Page ${row.page} · `}Figure {row.figure}
            {row.callout && ` · Item ${row.callout}`}
          </p>
          <a
            href={source.url + (source.kind === 'pdf' ? `#page=${row.page}` : '')}
            target="_blank"
            rel="noreferrer"
          >
            Open reference <ArrowUpRight size={12} />
          </a>
        </div>
        {row.originalDescription && <p className="muted">{row.originalDescription}</p>}
        <p className="muted">
          {row.modelYears.length ? `Source year claim: ${row.modelYears.join(', ')}. ` : ''}
          {source.kind === 'web'
            ? 'Retailer reference; fitment is unverified.'
            : 'Catalog inclusion does not establish cross-year fitment.'}
        </p>
        <p className="muted">
          Verification: {occurrence.reviewStatus.replaceAll('-', ' ')}.
          {row.dimensionsText && occurrence.reviewStatus !== 'mechanically-verified'
            ? ' Source dimensions have not been mechanically verified.'
            : ''}
        </p>
        {row.itemType !== 'unknown' && <p className="muted">Source item type: {row.itemType}.</p>}
        {row.notes.map((note, i) => (
          <p className="muted" key={i}>
            {note}
          </p>
        ))}
        {patch?.note && <p className="muted">Reviewer note: {patch.note}</p>}
        <p>
          <Link
            className="inline-link"
            href={`/catalog?occurrence=${encodeURIComponent(occurrenceId)}`}
          >
            Review this source record <ArrowUpRight size={12} />
          </Link>
        </p>
        {!hasGeometry && (
          <Link className="inline-link" href="/editor">
            Map imported geometry <ArrowUpRight size={12} />
          </Link>
        )}
      </details>
      {conflicts.length > 0 && (
        <details className="detail-section oem-conflict">
          <summary>Source discrepancies ({conflicts.length})</summary>
          {conflicts.map((conflict) => (
            <div className="source-card" key={conflict.id}>
              <strong>{conflict.kind.replaceAll('-', ' ')} · review needed</strong>
              <p className="muted">{conflict.explanation}</p>
              {conflict.claims.map((claim) => {
                const evidence = getOccurrenceDetails(database, claim.occurrenceId);
                return (
                  <button
                    className="source-claim"
                    key={claim.occurrenceId}
                    onClick={() => onNavigate(claim.occurrenceId)}
                  >
                    <strong>{claim.value}</strong>
                    <small>
                      {evidence?.source.title} · {evidence?.sourceRow.callout ?? 'Unnumbered'}
                    </small>
                  </button>
                );
              })}
            </div>
          ))}
        </details>
      )}
      {otherOccurrences.length > 0 && (
        <details className="detail-section oem-conflict">
          <summary>Other source occurrences ({otherOccurrences.length})</summary>
          <ul className="component-list">
            {otherOccurrences.map((other) => {
              const entry = getOccurrenceDetails(database, other.id)!;
              return (
                <li key={other.id}>
                  <button onClick={() => onNavigate(other.id)}>
                    <span>
                      {entry.assembly.name}
                      <small className="oem-list-number">
                        {entry.source.title} · {entry.sourceRow.callout ?? 'Unnumbered'}
                        {entry.occurrence.quantity !== null &&
                          ` · Qty ${entry.occurrence.quantity}`}
                      </small>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </div>
  );
}
