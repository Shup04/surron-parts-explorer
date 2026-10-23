/** Mechanical data is nullable: unknown must never be inferred from demo geometry. */
export type Vec3 = [number, number, number];
export type Verification =
  | 'unknown'
  | 'demonstration'
  | 'source-confirmed'
  | 'mechanically-verified';
export interface SourceReference {
  document: string;
  page?: string;
  diagram?: string;
  item?: string;
  url?: string;
  notes?: string;
}
export interface Part {
  id: string;
  name: string;
  description: string;
  kind: 'motorcycle' | 'assembly' | 'component';
  parentId: string | null;
  oemNumber: string | null;
  genericDesignation: string | null;
  quantity: number | null;
  material: string | null;
  specifications: Record<string, string>;
  dimensions: { label: string; value: number; unit: 'mm' | 'cm' | 'm' | 'deg' }[];
  compatibility: { model: string; years: number[]; verification: Verification }[];
  sources: SourceReference[];
  verification: Verification;
  images: { url: string; alt: string }[];
  alternatives: {
    id: string;
    relation: 'confirmed-interchangeable' | 'similar-specification' | 'unverified';
    notes: string;
  }[];
  crossReferences: string[];
}
export interface Catalog {
  version: 1;
  motorcycleId: string;
  parts: Part[];
}
export interface Explosion {
  direction: Vec3;
  distance: number;
  duration?: number;
  easing?: 'linear' | 'smooth' | 'cubic';
  verification: Verification;
}
/** A closed child assembly moves as one unit until its own view is opened. */
export interface ExplosionGroup {
  id: string;
  partIds: string[];
  anchorPartId: string;
}
export interface ObjectMapping {
  objectKey: string;
  partId: string;
  explosion?: Explosion;
}
export interface AssetDefinition {
  id: string;
  url: string;
  assemblyId: string;
  unit: 'm';
  upAxis: 'Y';
  label: string;
  models?: { id: string; url: string }[];
}
export interface MappingConfig {
  version: 1;
  assetId: string;
  units: 'm';
  upAxis: 'Y';
  mappings: ObjectMapping[];
  camera?: { position: Vec3; target: Vec3 };
}
export interface SceneObjectInfo {
  key: string;
  name: string;
  parentKey: string | null;
  mesh: boolean;
  position: Vec3;
}
export interface ViewerDiagnostics {
  meshes: number;
  triangles: number;
  drawCalls: number;
  geometries: number;
  textures: number;
}
export interface ViewerProps {
  catalog: Catalog;
  assemblyId: string;
  /** Explicit catalog IDs represented by a curated view, across source assemblies. */
  scopePartIds?: string[];
  explosionGroups?: ExplosionGroup[];
  selectedId: string | null;
  hoveredId?: string | null;
  explosion: number;
  hiddenIds: string[];
  isolatedId: string | null;
  resetToken: number;
  onSelect: (partId: string) => void;
  onHover?: (partId: string | null) => void;
  onDiagnostics?: (diagnostics: ViewerDiagnostics) => void;
  mapping?: MappingConfig;
  asset?: AssetDefinition;
}
