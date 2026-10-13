import * as THREE from 'three';
import type { Explosion } from '@/core/types';

/** Deliberately synthetic geometry. No shape or dimension is a mechanical claim. */
export function createDemoScene(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'demonstration-motorcycle';
  const materials = {
    tire: new THREE.MeshStandardMaterial({ color: '#181c1f', roughness: 0.92 }),
    dark: new THREE.MeshStandardMaterial({ color: '#282e34', metalness: 0.65, roughness: 0.35 }),
    black: new THREE.MeshStandardMaterial({ color: '#101619', metalness: 0.35, roughness: 0.45 }),
    alloy: new THREE.MeshStandardMaterial({ color: '#a5b0b8', metalness: 0.8, roughness: 0.3 }),
    steel: new THREE.MeshStandardMaterial({ color: '#616e76', metalness: 0.86, roughness: 0.24 }),
    accent: new THREE.MeshStandardMaterial({ color: '#cae8b2', metalness: 0.3, roughness: 0.4 }),
    seal: new THREE.MeshStandardMaterial({ color: '#315968', metalness: 0.25, roughness: 0.55 }),
  };
  const cache = new Map<string, THREE.BufferGeometry>();
  const geometry = (key: string, make: () => THREE.BufferGeometry) => {
    if (!cache.has(key)) cache.set(key, make());
    return cache.get(key)!;
  };
  function group(
    id: string,
    parent: THREE.Object3D = root,
    position: [number, number, number] = [0, 0, 0],
    explosion?: Explosion,
  ) {
    const g = new THREE.Group();
    g.name = id;
    g.userData.partId = id;
    if (explosion) g.userData.explosion = explosion;
    g.position.set(...position);
    parent.add(g);
    return g;
  }
  function mesh(
    parent: THREE.Object3D,
    geo: THREE.BufferGeometry,
    mat: keyof typeof materials,
    p: [number, number, number] = [0, 0, 0],
  ) {
    const m = new THREE.Mesh(geo, materials[mat]);
    m.position.set(...p);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  function box(
    parent: THREE.Object3D,
    size: [number, number, number],
    p: [number, number, number],
    mat: keyof typeof materials = 'dark',
    angle = 0,
  ) {
    const b = mesh(
      parent,
      geometry(`box:${size}`, () => new THREE.BoxGeometry(...size)),
      mat,
      p,
    );
    b.rotation.z = angle;
    return b;
  }
  function cylinder(
    parent: THREE.Object3D,
    radius: number,
    length: number,
    p: [number, number, number],
    mat: keyof typeof materials = 'alloy',
    segments = 24,
  ) {
    const m = mesh(
      parent,
      geometry(
        `cylinder:${radius}:${length}:${segments}`,
        () => new THREE.CylinderGeometry(radius, radius, length, segments),
      ),
      mat,
      p,
    );
    m.rotation.x = Math.PI / 2;
    return m;
  }
  function ring(
    parent: THREE.Object3D,
    radius: number,
    tube: number,
    p: [number, number, number],
    mat: keyof typeof materials = 'alloy',
  ) {
    return mesh(
      parent,
      geometry(`ring:${radius}:${tube}`, () => new THREE.TorusGeometry(radius, tube, 8, 48)),
      mat,
      p,
    );
  }
  function rod(
    parent: THREE.Object3D,
    a: [number, number, number],
    b: [number, number, number],
    radius: number,
    mat: keyof typeof materials = 'dark',
  ) {
    const av = new THREE.Vector3(...a),
      bv = new THREE.Vector3(...b),
      direction = bv.clone().sub(av);
    const m = mesh(
      parent,
      geometry(
        `rod:${radius}:${direction.length().toFixed(6)}`,
        () => new THREE.CylinderGeometry(radius, radius, direction.length(), 12),
      ),
      mat,
    );
    m.position.copy(av).add(bv).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    return m;
  }
  function wheel(id: string, x: number, radius: number) {
    const g = group(id, root, [x, radius + 0.025, 0]);
    ring(g, radius - 0.038, 0.044, [0, 0, 0], 'tire');
    ring(g, radius - 0.09, 0.015, [0, 0, 0.034], 'alloy');
    ring(g, radius - 0.09, 0.015, [0, 0, -0.034], 'alloy');
    cylinder(g, 0.045, 0.15, [0, 0, 0], 'dark');
    for (let i = 0; i < 28; i++) {
      const a = (i * Math.PI * 2) / 28;
      const r = radius - 0.095;
      rod(
        g,
        [0.037 * Math.cos(a + 0.6), 0.037 * Math.sin(a + 0.6), i % 2 ? 0.05 : -0.05],
        [r * Math.cos(a), r * Math.sin(a), i % 2 ? 0.033 : -0.033],
        0.0025,
        'steel',
      );
    }
    // Instanced tread blocks share geometry and material while retaining wheel selection.
    const treadGeometry = geometry('tread', () => new THREE.BoxGeometry(0.029, 0.012, 0.077));
    const tread = new THREE.InstancedMesh(treadGeometry, materials.tire, 42);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 42; i++) {
      const a = (i * Math.PI * 2) / 42;
      dummy.position.set(Math.cos(a) * (radius + 0.002), Math.sin(a) * (radius + 0.002), 0);
      dummy.rotation.z = a - Math.PI / 2;
      dummy.updateMatrix();
      tread.setMatrixAt(i, dummy.matrix);
    }
    tread.castShadow = true;
    g.add(tread);
    return g;
  }
  wheel('front-wheel', 0.79, 0.34);
  wheel('rear-wheel', -0.77, 0.325);
  const frame = group('frame');
  for (const z of [-0.087, 0.087]) {
    rod(frame, [-0.25, 0.47, z], [0.24, 1.03, z], 0.033);
    rod(frame, [0.24, 1.03, z], [0.36, 0.87, z], 0.035);
    rod(frame, [0.36, 0.87, z], [0.18, 0.44, z], 0.035);
    rod(frame, [0.18, 0.44, z], [-0.25, 0.47, z], 0.035);
    rod(frame, [-0.23, 0.48, z], [-0.43, 0.91, z], 0.027);
    rod(frame, [-0.43, 0.91, z], [0.24, 1.03, z], 0.025);
    rod(frame, [-0.42, 0.91, z], [-0.69, 0.87, z], 0.019);
  }
  const battery = group('battery');
  box(battery, [0.3, 0.42, 0.18], [0.065, 0.713, 0], 'black', -0.33);
  box(battery, [0.026, 0.24, 0.185], [0.075, 0.75, 0], 'accent', -0.33);
  const body = group('body');
  box(body, [0.62, 0.069, 0.19], [-0.29, 0.98, 0], 'black', 0.075);
  box(body, [0.39, 0.035, 0.15], [-0.62, 0.95, 0], 'dark', -0.17);
  box(body, [0.38, 0.025, 0.13], [0.74, 0.78, 0], 'dark', -0.04);
  box(body, [0.18, 0.15, 0.09], [0.485, 1.03, 0], 'dark', 0.24);
  box(body, [0.014, 0.055, 0.07], [0.593, 1.055, 0], 'accent', 0.24);
  const fork = group('front-suspension');
  for (const z of [-0.08, 0.08]) {
    rod(fork, [0.79, 0.365, z], [0.59, 0.84, z], 0.024, 'alloy');
    rod(fork, [0.59, 0.84, z], [0.39, 1.16, z], 0.032, 'dark');
  }
  rod(fork, [0.42, 1.1, -0.13], [0.42, 1.1, 0.13], 0.025, 'dark');
  const swingarm = group('swingarm');
  for (const z of [-0.09, 0.09]) {
    rod(swingarm, [-0.19, 0.52, z], [-0.77, 0.35, z], 0.036);
    rod(swingarm, [-0.26, 0.42, z], [-0.77, 0.35, z], 0.025);
  }
  const suspension = group('rear-suspension');
  rod(suspension, [-0.32, 0.55, 0], [-0.22, 0.89, 0], 0.038, 'alloy');
  for (let i = 0; i < 8; i++) {
    const r = ring(suspension, 0.046, 0.006, [-0.32 + i * 0.012, 0.585 + i * 0.033, 0], 'accent');
    r.rotation.x = Math.PI / 2;
    r.rotation.y = -0.3;
  }
  const controls = group('controls');
  rod(controls, [0.4, 1.14, 0], [0.39, 1.25, 0], 0.022);
  rod(controls, [0.39, 1.25, -0.3], [0.39, 1.25, 0.3], 0.012, 'alloy');
  for (const z of [-0.26, 0.26]) {
    const grip = cylinder(controls, 0.021, 0.1, [0.39, 1.25, z], 'black');
    grip.rotation.x = Math.PI / 2;
    box(controls, [0.07, 0.017, 0.11], [0.435, 1.25, z], 'steel', 0.15);
  }
  const brakes = group('brakes');
  for (const [x, y, z] of [
    [0.79, 0.365, 0.095],
    [-0.77, 0.35, -0.095],
  ]) {
    ring(brakes, 0.098, 0.014, [x, y, z], 'steel');
    cylinder(brakes, 0.03, 0.008, [x, y, z], 'alloy');
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      rod(
        brakes,
        [x + Math.cos(a) * 0.03, y + Math.sin(a) * 0.03, z],
        [x + Math.cos(a) * 0.09, y + Math.sin(a) * 0.09, z],
        0.006,
        'steel',
      );
    }
    box(brakes, [0.055, 0.09, 0.045], [x - 0.08, y + 0.065, z], 'dark');
  }
  const drive = group('drivetrain');
  const motor = group('motor', drive, [-0.075, 0.443, 0]);
  cylinder(motor, 0.111, 0.205, [0, 0, 0], 'black');
  for (let i = 0; i < 6; i++) ring(motor, 0.106, 0.005, [0, 0, -0.09 + i * 0.036], 'steel');
  cylinder(motor, 0.04, 0.018, [0, 0, 0.12], 'alloy');
  // The chain is one lightweight line loop, represented within the drivetrain assembly.
  const chainCurve = new THREE.CatmullRomCurve3(
    [
      new THREE.Vector3(-0.77, 0.43, 0.128),
      new THREE.Vector3(-0.21, 0.585, 0.128),
      new THREE.Vector3(-0.15, 0.54, 0.128),
      new THREE.Vector3(-0.21, 0.475, 0.128),
      new THREE.Vector3(-0.77, 0.27, 0.128),
      new THREE.Vector3(-0.85, 0.35, 0.128),
    ],
    true,
  );
  mesh(drive, new THREE.TubeGeometry(chainCurve, 64, 0.009, 6, true), 'steel');
  const jack = group('jackshaft', drive, [-0.24, 0.545, 0]);
  const axial = (direction: number, distance: number): Explosion => ({
    direction: [0, 0, direction],
    distance,
    duration: 0.8,
    easing: 'cubic',
    verification: 'demonstration',
  });
  const shaft = group('shaft', jack, [0, 0, 0], axial(1, 0));
  cylinder(shaft, 0.023, 0.255, [0, 0, 0], 'alloy');
  cylinder(shaft, 0.027, 0.08, [0, 0, 0], 'steel');
  for (const [id, z, sign] of [
    ['bearing-left', -0.067, -1],
    ['bearing-right', 0.067, 1],
  ] as const) {
    const bearing = group(id, jack, [0, 0, z], axial(sign, 0.12));
    ring(bearing, 0.041, 0.014, [0, 0, 0], 'alloy');
    ring(bearing, 0.041, 0.009, [0, 0, 0.011], 'seal');
    ring(bearing, 0.041, 0.009, [0, 0, -0.011], 'seal');
  }
  for (const [id, z, sign] of [
    ['spacer-left', -0.096, -1],
    ['spacer-right', 0.096, 1],
  ] as const) {
    const spacer = group(id, jack, [0, 0, z], axial(sign, 0.22));
    ring(spacer, 0.027, 0.007, [0, 0, 0], 'steel');
  }
  const sprocket = group('sprocket', jack, [0, 0, 0.126], axial(1, 0.33));
  ring(sprocket, 0.07, 0.012, [0, 0, 0], 'dark');
  ring(sprocket, 0.026, 0.008, [0, 0, 0], 'alloy');
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    rod(
      sprocket,
      [0.028 * Math.cos(a), 0.028 * Math.sin(a), 0],
      [0.064 * Math.cos(a), 0.064 * Math.sin(a), 0],
      0.008,
      'dark',
    );
  }
  for (let i = 0; i < 24; i++) {
    const a = (i * Math.PI) / 12;
    const tooth = box(
      sprocket,
      [0.013, 0.017, 0.012],
      [0.084 * Math.cos(a), 0.084 * Math.sin(a), 0],
      'steel',
    );
    tooth.rotation.z = a - Math.PI / 2;
  }
  const clips = group('retaining-clips', jack, [0, 0, -0.127], axial(-1, 0.32));
  mesh(clips, new THREE.TorusGeometry(0.025, 0.003, 6, 32, Math.PI * 1.8), 'black');
  const bolts = group('jackshaft-fasteners', jack, [0, 0, 0.15], axial(1, 0.45));
  cylinder(bolts, 0.013, 0.027, [0, 0, 0], 'alloy', 6);
  root.updateMatrixWorld(true);
  return root;
}
