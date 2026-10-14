'use client';

import { ArrowUpRight } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Part } from '@/core/types';

/** Details for custom or demonstration parts; viewer actions stay next to the model. */
export function PartDetails({
  part,
  parentName,
  onNavigate,
  actions,
}: {
  part: Part;
  parentName?: string;
  onNavigate: (id: string) => void;
  actions?: ReactNode;
}) {
  const specifications = Object.entries(part.specifications).filter(([, value]) => value.trim());
  const images = part.images.filter((image) => /^(https?:\/\/|\/(?!\/))/.test(image.url));
  const hasSpecifications =
    specifications.length > 0 || part.dimensions.length > 0 || part.material;
  const hasLocation = (part.parentId && parentName) || part.quantity !== null;
  const demonstration = part.verification === 'demonstration';

  return (
    <div className="part-details">
      <h2>{part.name}</h2>
      {part.oemNumber && <code className="oem-number">{part.oemNumber}</code>}
      {part.genericDesignation && <p className="part-description">{part.genericDesignation}</p>}
      {actions}
      {demonstration ? (
        <p className="muted">Demonstration geometry</p>
      ) : (
        part.description && <p className="part-description">{part.description}</p>
      )}
      {hasSpecifications && (
        <div className="detail-section">
          <h3>Specifications</h3>
          <dl>
            {part.material && (
              <>
                <dt>Material</dt>
                <dd>{part.material}</dd>
              </>
            )}
            {specifications.map(([key, value]) => (
              <div className="definition-pair" key={key}>
                <dt>{key}</dt>
                <dd>{value}</dd>
              </div>
            ))}
            {part.dimensions.map((dimension, i) => (
              <div className="definition-pair" key={i}>
                <dt>{dimension.label}</dt>
                <dd>
                  {dimension.value} {dimension.unit}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      {hasLocation && (
        <div className="detail-section">
          <dl>
            {part.parentId && parentName && (
              <>
                <dt>Assembly</dt>
                <dd>
                  <button className="inline-link" onClick={() => onNavigate(part.parentId!)}>
                    {parentName}
                  </button>
                </dd>
              </>
            )}
            {part.quantity !== null && (
              <>
                <dt>Quantity in assembly</dt>
                <dd>{part.quantity}</dd>
              </>
            )}
          </dl>
        </div>
      )}
      {images.length > 0 && (
        <div className="detail-section part-images">
          {images.map((image) => (
            <figure key={image.url}>
              <img src={image.url} alt={image.alt} loading="lazy" />
              <figcaption>{image.alt}</figcaption>
            </figure>
          ))}
        </div>
      )}
      <details className="detail-section oem-conflict">
        <summary>Source &amp; verification</summary>
        <p className="muted">Verification: {part.verification.replaceAll('-', ' ')}.</p>
        {demonstration && part.description && <p className="muted">{part.description}</p>}
        {part.sources.map((source, i) => (
          <div className="source-card" key={i}>
            <strong>{source.document}</strong>
            {(source.page || source.diagram || source.item) && (
              <p>
                {[
                  source.page && `Page ${source.page}`,
                  source.diagram && `Diagram ${source.diagram}`,
                  source.item && `Item ${source.item}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            )}
            {source.url && /^https?:\/\//.test(source.url) && (
              <a href={source.url} target="_blank" rel="noreferrer">
                Open source <ArrowUpRight size={12} />
              </a>
            )}
            {source.notes && <p>{source.notes}</p>}
          </div>
        ))}
      </details>
      {(part.compatibility.length > 0 || part.alternatives.length > 0) && (
        <details className="detail-section oem-conflict">
          <summary>Compatibility &amp; alternatives</summary>
          {part.compatibility.map((fit, i) => (
            <p className="muted" key={i}>
              {fit.model}
              {fit.years.length > 0 && ` · ${fit.years.join(', ')}`}
              <br />
              {fit.verification.replaceAll('-', ' ')}
            </p>
          ))}
          {part.alternatives.map((alternative) => (
            <p className="muted" key={alternative.id}>
              {alternative.id} · {alternative.relation.replaceAll('-', ' ')}
              {alternative.notes && (
                <>
                  <br />
                  {alternative.notes}
                </>
              )}
            </p>
          ))}
        </details>
      )}
    </div>
  );
}
