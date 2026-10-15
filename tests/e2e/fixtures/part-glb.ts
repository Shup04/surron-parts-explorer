import { BoxGeometry } from 'three';

/** A seat-shaped fixture with an unrelated mesh to detect overly broad Seat scoping. */
export function seatGlb(includeOther = true, scale = 1) {
  const geometry = new BoxGeometry(0.5, 0.07, 0.18).toNonIndexed();
  const positions = geometry.getAttribute('position').array as Float32Array;
  const document = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: includeOther ? [0, 1] : [0] }],
    nodes: [
      { name: 'seat', mesh: 0, scale: [scale, scale, scale] },
      { name: 'other-bodywork', mesh: 0, translation: [0.8, 0, 0] },
    ],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    buffers: [{ byteLength: positions.byteLength }],
    bufferViews: [{ buffer: 0, byteLength: positions.byteLength }],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: positions.length / 3,
        type: 'VEC3',
        min: [-0.25, -0.035, -0.09],
        max: [0.25, 0.035, 0.09],
      },
    ],
  };
  const json = Buffer.from(JSON.stringify(document));
  const padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 0x20);
  json.copy(padded);
  const result = Buffer.alloc(28 + padded.length + positions.byteLength);
  result.writeUInt32LE(0x46546c67, 0);
  result.writeUInt32LE(2, 4);
  result.writeUInt32LE(result.length, 8);
  result.writeUInt32LE(padded.length, 12);
  result.writeUInt32LE(0x4e4f534a, 16);
  padded.copy(result, 20);
  result.writeUInt32LE(positions.byteLength, 20 + padded.length);
  result.writeUInt32LE(0x004e4942, 24 + padded.length);
  Buffer.from(positions.buffer).copy(result, 28 + padded.length);
  geometry.dispose();
  return result;
}
