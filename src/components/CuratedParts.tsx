'use client';

import Link from 'next/link';
import { ChevronDown, ChevronRight, Eye, EyeOff } from 'lucide-react';
import type { NavigationNode, ReferenceGroup } from '@/navigation/model';
import type { OemDatabase } from '@/oem/types';
import { getOccurrenceDetails } from '@/oem/queries';

interface TreeProps {
  nodes: NavigationNode[];
  expanded: Set<string>;
  activeId: string | null;
  selectedId: string | null;
  onToggle: (id: string) => void;
  onNavigate: (node: NavigationNode) => void;
  hiddenIds?: string[];
  mappedIds?: Set<string>;
  onToggleHidden?: (id: string) => void;
  onHover?: (id: string | null) => void;
  depth?: number;
}

/** Presentation groups never replace catalog identities or alter the viewer hierarchy. */
export function CuratedPartsTree({
  nodes,
  expanded,
  activeId,
  selectedId,
  onToggle,
  onNavigate,
  hiddenIds = [],
  mappedIds,
  onToggleHidden,
  onHover,
  depth = 0,
}: TreeProps) {
  return nodes.map((node) => {
    const active = node.occurrenceId ? selectedId === node.occurrenceId : activeId === node.id;
    const open = expanded.has(node.id);
    const hidden = node.occurrenceId ? hiddenIds.includes(node.occurrenceId) : false;
    return (
      <li key={node.id} data-navigation-kind={node.kind}>
        <div
          className={`tree-row ${active ? 'active' : ''} ${hidden ? 'is-hidden' : ''}`}
          data-navigation-id={node.id}
          style={{ paddingLeft: 8 + depth * 15 }}
        >
          {node.children.length ? (
            <button
              className="tree-toggle"
              aria-label={`${open ? 'Collapse' : 'Expand'} ${node.name}`}
              aria-expanded={open}
              aria-controls={`navigation-children-${node.id}`}
              onClick={() => onToggle(node.id)}
            >
              {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          ) : (
            <span className="tree-spacer" />
          )}
          <button
            className="tree-select"
            onClick={() => onNavigate(node)}
            aria-current={active ? 'true' : undefined}
            title={node.name}
            onMouseEnter={() => node.occurrenceId && onHover?.(node.occurrenceId)}
            onMouseLeave={() => node.occurrenceId && onHover?.(null)}
            onFocus={() => node.occurrenceId && onHover?.(node.occurrenceId)}
            onBlur={() => node.occurrenceId && onHover?.(null)}
          >
            <span className="tree-label">{node.name}</span>
            {node.children.length > 0 && <small aria-hidden="true">{node.children.length}</small>}
          </button>
          {node.occurrenceId && mappedIds?.has(node.occurrenceId) && onToggleHidden && (
            <button
              className="tree-visibility"
              aria-label={`${hidden ? 'Show' : 'Hide'} ${node.name}`}
              aria-pressed={hidden}
              onClick={() => onToggleHidden(node.occurrenceId!)}
            >
              {hidden ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          )}
        </div>
        {node.children.length > 0 && open && (
          <ul id={`navigation-children-${node.id}`}>
            <CuratedPartsTree
              nodes={node.children}
              expanded={expanded}
              activeId={activeId}
              selectedId={selectedId}
              onToggle={onToggle}
              onNavigate={onNavigate}
              hiddenIds={hiddenIds}
              mappedIds={mappedIds}
              onToggleHidden={onToggleHidden}
              onHover={onHover}
              depth={depth + 1}
            />
          </ul>
        )}
      </li>
    );
  });
}

interface DetailsProps {
  node: NavigationNode | null;
  roots: NavigationNode[];
  database: OemDatabase;
  onNavigate: (node: NavigationNode) => void;
  onSelectOccurrence: (id: string) => void;
  onBrowseParts?: (nodeId: string | null) => void;
  modeledOnly?: boolean;
}

/** Each button opens one exact source occurrence; source quantities are never summed. */
function OccurrenceButton({
  occurrenceId,
  database,
  onSelect,
  showName = false,
}: {
  occurrenceId: string;
  database: OemDatabase;
  onSelect: (id: string) => void;
  showName?: boolean;
}) {
  const details = getOccurrenceDetails(database, occurrenceId);
  if (!details) return null;
  const { occurrence, part, source, sourceRow } = details;
  return (
    <button className="source-claim" onClick={() => onSelect(occurrenceId)}>
      {showName && (
        <>
          <strong>{part.normalizedName}</strong>
          {part.oemNumber && <small>{part.oemNumber}</small>}
        </>
      )}
      <span>{source.title}</span>
      <small>
        {source.kind === 'pdf' && `Page ${sourceRow.page} · `}
        Figure {sourceRow.figure}
        {sourceRow.callout && ` · ${sourceRow.callout}`}
        {occurrence.quantity !== null && ` · Qty ${occurrence.quantity}`}
      </small>
      {sourceRow.modelYears.length > 0 && (
        <small>Source years: {sourceRow.modelYears.join(', ')}</small>
      )}
      {sourceRow.dimensionsText && (
        <small>
          {sourceRow.dimensionsText}
          {sourceRow.dimensionUnitText && ` · ${sourceRow.dimensionUnitText}`}
        </small>
      )}
    </button>
  );
}

function ReferenceParts({
  references,
  database,
  onSelectOccurrence,
  title,
}: {
  references: ReferenceGroup[];
  database: OemDatabase;
  onSelectOccurrence: DetailsProps['onSelectOccurrence'];
  title: string;
}) {
  return (
    <details className="detail-section oem-conflict" data-testid="navigation-references">
      <summary>
        {title} · {references.length}
      </summary>
      <p className="muted">
        Alternatives and historical revisions may differ from your motorcycle. Quantities are
        specific to each source.
      </p>
      {references.length ? (
        references.map((reference) => (
          <details className="oem-conflict source-card" key={reference.id}>
            <summary>
              {reference.name}
              {reference.oemNumber && (
                <small className="oem-list-number">{reference.oemNumber}</small>
              )}
            </summary>
            {reference.occurrenceIds.map((id) => (
              <OccurrenceButton
                key={id}
                occurrenceId={id}
                database={database}
                onSelect={onSelectOccurrence}
              />
            ))}
          </details>
        ))
      ) : (
        <p className="muted">No source references match the selected source and year.</p>
      )}
    </details>
  );
}

export function CuratedAssemblyDetails({
  node,
  database,
  onNavigate,
  onSelectOccurrence,
  onBrowseParts,
  modeledOnly,
}: DetailsProps) {
  if (modeledOnly && node)
    return (
      <>
        <h2>{node.name}</h2>
        <p className="muted">
          {node.modelPartIds?.length ?? 0} modeled{' '}
          {node.modelPartIds?.length === 1 ? 'part' : 'parts'}
        </p>
        {node.children.length > 0 && onBrowseParts && (
          <button className="text-button" onClick={() => onBrowseParts(node.id)}>
            Browse components <ChevronRight size={14} aria-hidden="true" />
          </button>
        )}
      </>
    );
  if (!node)
    return (
      <>
        <h2>Sur-Ron Light Bee X</h2>
        {onBrowseParts && (
          <button className="text-button" onClick={() => onBrowseParts(null)}>
            Browse motorcycle systems
          </button>
        )}
        <Link className="inline-link" href="/catalog">
          Complete OEM reference catalog
        </Link>
      </>
    );

  const regularChildren = node.children.filter((child) => child.kind !== 'service');
  const serviceChildren = node.children.filter((child) => child.kind === 'service');
  const isComponent = node.kind === 'component' || node.kind === 'installed';
  return (
    <>
      <h2>{node.name}</h2>
      {isComponent && (
        <div className="detail-section">
          {node.installedOccurrenceIds.length ? (
            <>
              <h3>Confirmed configuration</h3>
              {node.installedOccurrenceIds.map((id) => (
                <OccurrenceButton
                  key={id}
                  occurrenceId={id}
                  database={database}
                  onSelect={onSelectOccurrence}
                  showName
                />
              ))}
            </>
          ) : (
            <p className="muted">
              Installed variant not confirmed. Compare the OEM references below with your
              motorcycle.
            </p>
          )}
        </div>
      )}
      {regularChildren.length > 0 && onBrowseParts && (
        <button className="text-button" onClick={() => onBrowseParts(node.id)}>
          Browse components <ChevronRight size={14} aria-hidden="true" />
        </button>
      )}
      {serviceChildren.map((service) => (
        <details className="detail-section oem-conflict" key={service.id}>
          <summary>
            {service.name}
            {service.children.length > 0 && ` · ${service.children.length} sections`}
          </summary>
          <button
            className="inline-link"
            onClick={() => (onBrowseParts ? onBrowseParts(service.id) : onNavigate(service))}
          >
            Browse {service.name.toLocaleLowerCase()}
          </button>
        </details>
      ))}
      <ReferenceParts
        references={node.references}
        database={database}
        onSelectOccurrence={onSelectOccurrence}
        title={isComponent ? 'OEM reference candidates' : 'OEM reference parts'}
      />
      <Link className="inline-link" href="/catalog">
        Complete OEM reference catalog
      </Link>
    </>
  );
}
