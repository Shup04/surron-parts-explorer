'use client';

import Link from 'next/link';
import { ChevronDown, ChevronRight } from 'lucide-react';
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
  depth = 0,
}: TreeProps) {
  return nodes.map((node) => {
    const active = node.occurrenceId ? selectedId === node.occurrenceId : activeId === node.id;
    const open = expanded.has(node.id);
    return (
      <li key={node.id} data-navigation-kind={node.kind}>
        <div
          className={`tree-row ${active ? 'active' : ''}`}
          style={{ paddingLeft: 8 + depth * 15 }}
        >
          {node.children.length ? (
            <button
              className="tree-toggle"
              aria-label={`${open ? 'Collapse' : 'Expand'} ${node.name}`}
              aria-expanded={open}
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
          >
            <span
              className={`part-dot ${node.kind === 'component' || node.kind === 'installed' ? 'component' : 'assembly'}`}
            />
            <span>{node.name}</span>
            {node.children.length > 0 && (
              <small>{node.children.length.toString().padStart(2, '0')}</small>
            )}
          </button>
        </div>
        {node.children.length > 0 && open && (
          <ul>
            <CuratedPartsTree
              nodes={node.children}
              expanded={expanded}
              activeId={activeId}
              selectedId={selectedId}
              onToggle={onToggle}
              onNavigate={onNavigate}
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
}

function ChildList({
  nodes,
  onNavigate,
}: {
  nodes: NavigationNode[];
  onNavigate: DetailsProps['onNavigate'];
}) {
  return (
    <ul className="component-list">
      {nodes.map((child) => (
        <li key={child.id}>
          <button onClick={() => onNavigate(child)}>
            <span>
              {child.name}
              {child.children.length > 0 && (
                <small className="oem-list-number">
                  {child.children.length} {child.children.length === 1 ? 'section' : 'sections'}
                </small>
              )}
            </span>
            <ChevronRight size={13} />
          </button>
        </li>
      ))}
    </ul>
  );
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
      <small>
        {sourceRow.modelYears.length
          ? `Source years: ${sourceRow.modelYears.join(', ')}`
          : 'Source year unspecified'}
      </small>
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
        Source references may include alternatives and historical revisions. They do not identify
        the installed variant. Quantities belong to each source occurrence.
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
  roots,
  database,
  onNavigate,
  onSelectOccurrence,
}: DetailsProps) {
  if (!node)
    return (
      <>
        <h2>Sur-Ron Light Bee X</h2>
        <p className="part-description">
          Browse motorcycle systems and serviceable components. OEM references are available within
          each section and through search.
        </p>
        <div className="detail-section">
          <h3>
            Motorcycle systems <span>{roots.length}</span>
          </h3>
          <ChildList nodes={roots} onNavigate={onNavigate} />
        </div>
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
            <>
              <h3>Installed variant not confirmed</h3>
              <p className="muted">
                This section identifies a component to inspect or service. It does not establish
                which OEM variant is installed or confirm fitment from a catalog year alone.
              </p>
            </>
          )}
        </div>
      )}
      {regularChildren.length > 0 && (
        <div className="detail-section">
          <h3>
            Components & assemblies <span>{regularChildren.length}</span>
          </h3>
          <ChildList nodes={regularChildren} onNavigate={onNavigate} />
        </div>
      )}
      {serviceChildren.map((service) => (
        <details className="detail-section oem-conflict" key={service.id}>
          <summary>
            {service.name}
            {service.children.length > 0 && ` · ${service.children.length} sections`}
          </summary>
          {service.children.length > 0 && (
            <ChildList nodes={service.children} onNavigate={onNavigate} />
          )}
          <button className="inline-link" onClick={() => onNavigate(service)}>
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
