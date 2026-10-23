import { FlipHorizontal2, ScanLine } from 'lucide-react';
import { useRef } from 'react';
import type { InspectionSettings } from '@/core/types';
import { Button } from './ui/Button';
import './inspection-controls.css';

export function InspectionControls({
  inspection,
  onInspectionChange,
  explosion,
  onExplosionChange,
  canExplode,
  selectedPart,
}: {
  inspection: InspectionSettings | undefined;
  onInspectionChange: (value: InspectionSettings | undefined) => void;
  explosion: number;
  onExplosionChange: (value: number) => void;
  canExplode: boolean;
  selectedPart: boolean;
}) {
  const inspectButton = useRef<HTMLButtonElement>(null);
  return (
    <div className="inspection-controls" aria-label="Inspection tools">
      <div className="inspection-modes" role="group" aria-label="View mode">
        <Button
          variant="ghost"
          aria-label="Reassemble"
          aria-pressed={!inspection && explosion === 0}
          onClick={() => {
            onInspectionChange(undefined);
            onExplosionChange(0);
          }}
        >
          Assembled
        </Button>
        <Button
          ref={inspectButton}
          variant="ghost"
          aria-pressed={!!inspection}
          onClick={() => {
            onExplosionChange(0);
            onInspectionChange(inspection ?? { fadeSurroundings: true, section: null });
          }}
        >
          <ScanLine size={16} /> Inspect
        </Button>
        {canExplode && (
          <Button
            variant="ghost"
            aria-pressed={explosion > 0}
            onClick={() => {
              onInspectionChange(undefined);
              onExplosionChange(1);
            }}
          >
            Exploded
          </Button>
        )}
      </div>
      {inspection ? (
        <div className="inspection-settings">
          <div className="inspection-toggles">
            <label>
              <input
                type="checkbox"
                checked={inspection.fadeSurroundings}
                onChange={(event) =>
                  onInspectionChange({ ...inspection, fadeSurroundings: event.target.checked })
                }
              />
              Fade surroundings
            </label>
            <label>
              <input
                type="checkbox"
                checked={!!inspection.section}
                onChange={(event) =>
                  onInspectionChange({
                    ...inspection,
                    section: event.target.checked
                      ? { axis: 'x', position: 0.5, flipped: false }
                      : null,
                  })
                }
              />
              Cutaway
            </label>
          </div>
          {inspection.section && (
            <>
              <div className="inspection-plane-options">
                <div role="group" aria-label="Section axis" className="inspection-axes">
                  <span>Axis</span>
                  {(['x', 'y', 'z'] as const).map((axis) => (
                    <Button
                      key={axis}
                      variant="ghost"
                      aria-label={`Section axis ${axis.toUpperCase()}`}
                      aria-pressed={inspection.section!.axis === axis}
                      onClick={() =>
                        onInspectionChange({
                          ...inspection,
                          section: { ...inspection.section!, axis },
                        })
                      }
                    >
                      {axis.toUpperCase()}
                    </Button>
                  ))}
                </div>
                <Button
                  variant="ghost"
                  aria-label="Flip cutaway side"
                  aria-pressed={inspection.section.flipped}
                  onClick={() =>
                    onInspectionChange({
                      ...inspection,
                      section: { ...inspection.section!, flipped: !inspection.section!.flipped },
                    })
                  }
                >
                  <FlipHorizontal2 size={16} /> Flip
                </Button>
              </div>
              <label className="inspection-range" htmlFor="section-position">
                <span>Section position</span>
                <output>{Math.round(inspection.section.position * 100)}%</output>
                <input
                  id="section-position"
                  aria-label="Section position"
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={inspection.section.position}
                  onChange={(event) =>
                    onInspectionChange({
                      ...inspection,
                      section: { ...inspection.section!, position: Number(event.target.value) },
                    })
                  }
                />
              </label>
            </>
          )}
          <div className="inspection-footer">
            <p>
              {selectedPart
                ? 'Selected part stays solid and uncut.'
                : 'Select a part to see it through its surroundings.'}
            </p>
            <Button
              variant="ghost"
              onClick={() => {
                onInspectionChange(undefined);
                inspectButton.current?.focus();
              }}
            >
              Done
            </Button>
          </div>
        </div>
      ) : canExplode ? (
        <label className="inspection-range" htmlFor="explosion-range">
          <span>Explosion amount</span>
          <output>{Math.round(explosion * 100)}%</output>
          <input
            id="explosion-range"
            aria-label="Explosion amount"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={explosion}
            onChange={(event) => onExplosionChange(Number(event.target.value))}
          />
        </label>
      ) : null}
    </div>
  );
}
