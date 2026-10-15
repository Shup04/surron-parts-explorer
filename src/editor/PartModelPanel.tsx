import { Upload, Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { NavigationModel, NavigationNode } from '@/navigation/model';
import type { EditorProject } from './storage';

function uploadChoices(nodes: NavigationNode[]): NavigationNode[] {
  return nodes.flatMap((node) =>
    node.kind === 'service' || node.kind === 'installed'
      ? []
      : [node, ...uploadChoices(node.children)],
  );
}

export function PartModelPanel({
  project,
  navigation,
  roleId,
  onRoleChange,
  onUpload,
  onAssignExisting,
  busy,
}: {
  project: EditorProject;
  navigation: NavigationModel;
  roleId: string;
  onRoleChange: (id: string) => void;
  onUpload: () => void;
  onAssignExisting: () => void;
  busy: boolean;
}) {
  const existingImport = !!project.assetFileName && !project.partModels;
  const role = navigation.byId.get(roleId);
  const replacing = project.partModels?.some((model) => model.id === roleId);
  return (
    <aside className="editor-part-panel" aria-label="Add part models">
      <div>
        <h2>Add a part</h2>
        <p>Choose where it belongs, then import its GLB. The model is assigned automatically.</p>
      </div>
      <label>
        1. Choose the bike part
        <select
          value={roleId}
          onChange={(event) => onRoleChange(event.target.value)}
          disabled={busy}
        >
          <option value="">Choose a part…</option>
          {navigation.roots.map((system) => (
            <optgroup key={system.id} label={system.name}>
              {uploadChoices([system]).map((node) => (
                <option key={node.id} value={node.id}>
                  {node.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <div>
        <h3>2. Add the model</h3>
        {existingImport ? (
          <div className="editor-existing-import">
            <strong>{project.assetFileName}</strong>
            <p>This file is already imported. Choose its bike part above to finish adding it.</p>
            <Button variant="primary" disabled={!role || busy} onClick={onAssignExisting}>
              Use this model{role ? ` for ${role.name}` : ''}
            </Button>
          </div>
        ) : (
          <>
            <Button variant="primary" disabled={!role || busy} onClick={onUpload}>
              <Upload size={16} /> {replacing ? 'Replace' : 'Import'} {role?.name ?? 'part'} GLB
            </Button>
            <p className="editor-part-hint">
              Other parts stay in the workspace. Positions are kept as exported.
            </p>
          </>
        )}
      </div>
      <div>
        <h3>3. Save & preview</h3>
        <p>
          Use the button above to save the bike and open the explorer. You can add more parts
          anytime.
        </p>
      </div>
      <section className="editor-added-parts" aria-label="Added parts">
        <h2>
          Your parts <span>{project.partModels?.length ?? 0}</span>
        </h2>
        {project.partModels?.length ? (
          <ul>
            {project.partModels.map((model) => (
              <li key={model.id}>
                <Check size={16} aria-hidden="true" />
                <button
                  onClick={() => onRoleChange(model.id)}
                  aria-label={`Choose ${navigation.byId.get(model.id)?.name ?? model.id}`}
                >
                  <strong>{navigation.byId.get(model.id)?.name ?? model.id}</strong>
                  <small>{model.originalName}</small>
                </button>
                <span>Assigned</span>
              </li>
            ))}
          </ul>
        ) : (
          <p>No parts added yet.</p>
        )}
      </section>
      <p className="editor-part-hint">
        Saved in this browser. Keep your original GLB files as a backup.
      </p>
    </aside>
  );
}
