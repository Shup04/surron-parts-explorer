import type { ImportPreflight } from './preflight';

export function ImportPreflightReport({ report }: { report: ImportPreflight }) {
  const number = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 6 });
  return (
    <div className="editor-preflight" aria-label="Import preflight report">
      <dl>
        <dt>Loaded geometry</dt>
        <dd>
          {number(report.objects)} objects · {number(report.meshes)} meshes ·{' '}
          {number(report.triangles)} triangles
        </dd>
        <dt>Hierarchy</dt>
        <dd>
          {report.roots} top-level objects · {report.depth} levels. Inspect branches in Scene
          objects.
        </dd>
        <dt>Names</dt>
        <dd>
          {report.namedObjectsChecked} checked · {report.unnamed} unnamed · {report.duplicateNamed}{' '}
          duplicate-named
        </dd>
        <dt>Bounds (X × Y × Z)</dt>
        <dd>
          <code>
            {report.dimensions
              ? `${report.dimensions.map((value) => Number(value.toPrecision(6))).join(' × ')} m`
              : 'Unavailable'}
          </code>
        </dd>
        <dt>Individual mapping</dt>
        <dd>
          {report.mappableMeshes} of {report.meshes} mesh objects have unique mapping keys.
        </dd>
        <dt>Effective scale factors</dt>
        <dd>
          <code>
            {report.scaleRange
              ? report.scaleRange.map((value) => Number(value.toPrecision(6))).join(' – ')
              : 'Unavailable'}
          </code>{' '}
          (absolute, including parents)
        </dd>
      </dl>
      <p>
        As imported, before explosion. Counts exclude the scene container; triangles include
        instances. A multi-material object may create several loaded meshes.
      </p>
      <p>
        Metres, Y up. Verify a known measurement; bounds do not confirm fitment or physical
        accuracy. Pivot checks cover distant static-mesh origins only; assembly axes require manual
        review.
      </p>
    </div>
  );
}
