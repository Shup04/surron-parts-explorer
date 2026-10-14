'use client';

import Link from 'next/link';
import { ArrowUpRight, Focus } from 'lucide-react';
import type { OemDatabase } from '@/oem/types';
import { getOccurrenceDetails } from '@/oem/queries';

export function OemDetails({
  database,
  occurrenceId,
  hasGeometry,
  onNavigate,
  onIsolate,
}: {
  database: OemDatabase;
  occurrenceId: string;
  hasGeometry: boolean;
  onNavigate: (id: string) => void;
  onIsolate: () => void;
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
      <code className="oem-number">{part.oemNumber ?? 'OEM number not recorded'}</code>
      <span className="verification-badge">
        <span />
        {occurrence.reviewStatus.replaceAll('-', ' ')}
      </span>
      <p className="part-description">{row.originalDescription}</p>
      <div className="detail-section">
        <h3>Part identification</h3>
        <dl>
          <dt>Assembly</dt>
          <dd>
            <button className="inline-link" onClick={() => onNavigate(assembly.id)}>
              {assembly.name}
            </button>
          </dd>
          <dt>Quantity in source</dt>
          <dd>
            {occurrence.quantity ?? 'Not recorded'}
            {patch && 'quantity' in patch && <small> · reviewer correction</small>}
          </dd>
          <dt>Callout</dt>
          <dd>{row.callout ?? 'Unnumbered source row'}</dd>
          {row.itemType !== 'unknown' && (
            <>
              <dt>Source item type</dt>
              <dd>{row.itemType}</dd>
            </>
          )}
          {row.dimensionsText && (
            <>
              <dt>Documented dimensions</dt>
              <dd>
                {row.dimensionsText}
                {row.dimensionUnitText && (
                  <small className="oem-list-number">{row.dimensionUnitText}</small>
                )}
              </dd>
            </>
          )}
          {row.weightText && (
            <>
              <dt>Documented weight</dt>
              <dd>
                {row.weightText}
                {row.weightUnitText && (
                  <small className="oem-list-number">{row.weightUnitText}</small>
                )}
              </dd>
            </>
          )}
          {row.material && (
            <>
              <dt>Material</dt>
              <dd>{row.material}</dd>
            </>
          )}
        </dl>
        {row.dimensionsText && (
          <p className="muted">
            Transcribed source dimensions; mechanical measurements await verification.
          </p>
        )}
      </div>
      <div className="detail-section">
        <h3>Source documentation</h3>
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
        <p className="muted">
          {row.modelYears.length
            ? `Source year claim: ${row.modelYears.join(', ')}.`
            : 'Model year is unspecified in this source.'}{' '}
          {source.kind === 'web'
            ? 'Retailer reference; fitment is unverified.'
            : 'Catalog inclusion does not establish cross-year fitment.'}
        </p>
      </div>
      {conflicts.length > 0 && (
        <div className="detail-section">
          <h3>
            Source discrepancies <span>{conflicts.length}</span>
          </h3>
          {conflicts.map((conflict) => (
            <details className="oem-conflict" key={conflict.id}>
              <summary>{conflict.kind.replaceAll('-', ' ')} · review needed</summary>
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
            </details>
          ))}
        </div>
      )}
      {otherOccurrences.length > 0 && (
        <div className="detail-section">
          <h3>
            Other source occurrences <span>{otherOccurrences.length}</span>
          </h3>
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
        </div>
      )}
      <div className="detail-section">
        <h3>3D inspection</h3>
        {hasGeometry ? (
          <button className="text-button" onClick={onIsolate}>
            <Focus size={15} />
            Toggle isolation
          </button>
        ) : (
          <>
            <p className="muted">No 3D representation assigned.</p>
            <Link className="inline-link" href="/editor">
              Map imported geometry <ArrowUpRight size={12} />
            </Link>
          </>
        )}
      </div>
      {row.notes.length > 0 && (
        <details className="detail-section oem-conflict">
          <summary>Source notes</summary>
          {row.notes.map((note, i) => (
            <p className="muted" key={i}>
              {note}
            </p>
          ))}
        </details>
      )}
      {patch?.note && (
        <div className="detail-section">
          <h3>Reviewer note</h3>
          <p className="muted">{patch.note}</p>
        </div>
      )}
      <Link
        className="inline-link"
        href={`/catalog?occurrence=${encodeURIComponent(occurrenceId)}`}
      >
        Review this source record <ArrowUpRight size={12} />
      </Link>
    </div>
  );
}
