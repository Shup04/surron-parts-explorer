"""Extract editable CAD contours from the supplied flat-part photographs.

This analyzes source pixels; it does not generate or retouch reference artwork.
Requires the original local references, NumPy, SciPy, Pillow and Matplotlib.
The resulting vectors are model inputs, with photographic uncertainty retained.
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from scipy.spatial import ConvexHull
from matplotlib.figure import Figure

ROOT = Path(__file__).resolve().parents[1]
REFERENCES = ROOT/'reference/models/lbx-rear-wheel/references'


def contours(mask):
    figure = Figure()
    result = figure.subplots().contour(mask.astype(float), levels=[.5]).allsegs[0]
    return sorted(result, key=len, reverse=True)


def rdp(points, epsilon):
    if len(points) <= 2:
        return points
    direction = points[-1]-points[0]
    length = np.linalg.norm(direction)
    relative = points-points[0]
    distances = np.abs(direction[0]*relative[:, 1]-direction[1]*relative[:, 0])/length if length else np.linalg.norm(relative, axis=1)
    index = int(distances.argmax())
    if distances[index] <= epsilon:
        return np.array([points[0], points[-1]])
    return np.vstack([rdp(points[:index+1], epsilon)[:-1], rdp(points[index:], epsilon)])


def simplify_closed(points, epsilon=.20):
    if np.linalg.norm(points[0]-points[-1]) < 1e-8:
        points = points[:-1]
    # Split at distant points so the closed-loop endpoints are not coincident.
    mid = np.argmax(np.linalg.norm(points-points[0], axis=1))
    a = rdp(points[:mid+1], epsilon)
    b = rdp(np.vstack([points[mid:], points[:1]]), epsilon)
    return np.round(np.vstack([a[:-1], b[:-1]]), 4).tolist()


def extract(kind, filename):
    rgb = np.asarray(Image.open(REFERENCES/filename).convert('RGB')).astype(float)
    r, g, b = rgb.transpose(2, 0, 1)
    yy, xx = np.indices(r.shape)
    if kind == 'disc':
        mask = (r>90)&(g>85)&(b>65)&(r-g<32)&(g-b<45)&(((xx-334)/230)**2+((yy-255)/233)**2<1)
    else:
        mask = (r>90)&(g>90)&(b>75)&(r<235)&(r-g<24)&(g-b<42)&(((xx-171)/150)**2+((yy-198)/150)**2<1)
    mask = ndi.binary_closing(mask, iterations=1)
    labels, _ = ndi.label(mask)
    counts = np.bincount(labels.ravel()); counts[0] = 0
    mask = labels == counts.argmax()
    holes, _ = ndi.label(ndi.binary_fill_holes(mask)&~mask)
    return mask, holes


def disc():
    mask, holes = extract('disc', 'reference-06.png')
    # Six photographic mounting holes, clockwise from upper-left.
    bolt_labels = [34, 36, 45, 56, 55, 43]
    src = np.array([[np.where(holes==i)[1].mean(), np.where(holes==i)[0].mean()] for i in bolt_labels])
    center = src.mean(0)
    angles = np.radians(102-np.arange(6)*60)
    target = 27*np.c_[np.cos(angles), np.sin(angles)]
    a, b = [], []
    for (x, y), (u, v) in zip(src-center, target):
        a += [[x,y,1,0,0,0,-u*x,-u*y], [0,0,0,x,y,1,-v*x,-v*y]]
        b += [u, v]
    homography = np.r_[np.linalg.lstsq(a, b, rcond=None)[0], 1].reshape(3, 3)
    def transform(points):
        p = np.c_[points-center, np.ones(len(points))]@homography.T
        return p[:, :2]/p[:, 2, None]
    # Fit subpixel boundaries to the silhouette. Raw pixel stair steps are image
    # sampling noise, not machining features, and must not become serrated edges.
    outer = transform(contours(ndi.gaussian_filter(mask.astype(float), 1.0))[0])
    scale = 101.4/np.linalg.norm(outer, axis=1).max()
    openings = []
    for i in range(1, holes.max()+1):
        pixels = np.count_nonzero(holes==i)
        if pixels < 12 or i in bolt_labels:
            continue
        outline = transform(contours(ndi.gaussian_filter((holes==i).astype(float), 1.0))[0])*scale
        kind = 'center' if i == 37 else 'window' if pixels > 1000 else 'vent'
        openings.append({'kind':kind, 'points':simplify_closed(outline, .15)})
    return {'source':'reference-06.png', 'method':'Planar homography fitted to six photographed mounting holes, then scaled to the catalog 202.8 mm outer envelope. Mounting holes themselves use the existing hub coordinates.',
            'photoCenterPx':center.tolist(), 'homography':homography.tolist(), 'envelopeScale':scale,
            'mountFitResidualMm':float(np.linalg.norm(transform(src)-target, axis=1).max()),
            'outer':simplify_closed(outer*scale, .18), 'openings':openings}


def sprocket():
    mask, holes = extract('sprocket', 'reference-05.png')
    # The upper two clean windows avoid dimension labels and the lower-left glare.
    inner = holes == 3
    inner[128:] = False
    outer = holes == 1
    center = np.array([171.0, 192.0])
    mm_per_pixel = 174/295
    def points(region):
        region = ndi.binary_opening(region, iterations=1)
        region = ndi.binary_fill_holes(region)
        p = contours(ndi.gaussian_filter(region.astype(float), .85))[0]
        # Both selected triangular windows are convex. Their convex envelopes
        # remove dimension-line fragments and glare notches from the photograph.
        p = p[ConvexHull(p).vertices]-center
        p[:, 1] *= -1
        p *= mm_per_pixel
        radius = np.linalg.norm(p, axis=1)
        # Retain the 52 mm bore / 68 mm mounting pattern while extending the web
        # toward the larger 48T tooth ring. Never enlarge the mounting interfaces.
        new_radius = radius+np.clip((radius-35)/(87-35), 0, 1)*(99.45-87)
        p *= (new_radius/radius)[:, None]
        return simplify_closed(p, .2)
    return {'source':'reference-05.png', 'method':'Trace one unobscured inner window and one outer window; repeat the paired pattern five times. Radial extension adapts the pictured 42T web to the selected 48T envelope, keeping hub interfaces fixed.',
            'photoCenterPx':center.tolist(), 'photoMmPerPixel':mm_per_pixel,
            'innerTemplate':points(inner), 'outerTemplate':points(outer), 'repeats':5}


if __name__ == '__main__':
    data = {'version':1, 'disc':disc(), 'sprocket':sprocket()}
    (ROOT/'data/models/rear-wheel-contours.json').write_text(json.dumps(data, separators=(',', ':'))+'\n')
    print(json.dumps({'discOpenings':{k:sum(p['kind']==k for p in data['disc']['openings']) for k in ['center','window','vent']}, 'sprocketWindows':10}))
