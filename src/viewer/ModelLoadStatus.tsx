import { modelFileName, type ModelLoadSnapshot } from './part-models';

export function ModelLoadStatus({
  state,
  onRetry,
  onFallback,
}: {
  state: ModelLoadSnapshot | null;
  onRetry: (id: string) => void;
  onFallback?: () => void;
}) {
  if (!state || (!state.loading && !state.failed)) return null;
  const active = state.models.filter((model) => model.status === 'loading');
  const queued = state.models.filter((model) => model.status === 'queued').length;
  const failed = state.models.filter((model) => model.status === 'failed');
  return (
    <section className="model-load-status" aria-label="Model loading">
      <div role="status" aria-live="polite" aria-atomic="true">
        <strong>
          {state.loaded} of {state.total} models loaded
        </strong>
        <span>
          {active.length} loading · {queued} queued
          {failed.length ? ` · ${failed.length} failed` : ''}
        </span>
      </div>
      <progress
        aria-label="Model files processed"
        max={state.total || 1}
        value={state.loaded + state.failed}
      />
      {onFallback && !state.loading && !state.loaded && !!failed.length && (
        <div>
          <button type="button" onClick={() => failed.forEach((model) => onRetry(model.id))}>
            Retry loading
          </button>
          <button type="button" onClick={onFallback}>
            Use demonstration geometry
          </button>
        </div>
      )}
      {!!active.length && (
        <details>
          <summary>Loading files</summary>
          <ul>
            {active.map((model) => (
              <li key={model.id}>{modelFileName(model)}</li>
            ))}
          </ul>
        </details>
      )}
      {!!failed.length && (
        <ul aria-label="Failed model files">
          {failed.map((model) => (
            <li key={model.id}>
              <div className="model-load-failure">
                <strong>{modelFileName(model)}</strong>
                <button
                  type="button"
                  aria-label={`Retry ${modelFileName(model)}`}
                  onClick={() => onRetry(model.id)}
                >
                  Retry
                </button>
              </div>
              <span>{model.error?.replace(/^fetch for ".+" responded with /, '')}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
