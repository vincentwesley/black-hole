# Converts NASA SVS "Deep Star Maps 2020" Milky Way background (galactic, no bright stars,
# https://svs.gsfc.nasa.gov/4851, file milkyway_2020_4k_gal.exr: 4096x2048 half-float, ZIP
# compression) into a 2048x1024 sRGB JPEG for the sky. Credit: NASA/Goddard Space Flight Center
# Scientific Visualization Studio; Gaia DR2: ESA/Gaia/DPAC.
#
# Usage: python3 -I scripts/build-milkyway.py <milkyway_2020_4k_gal.exr> public/data/milkyway.jpg
# Needs numpy and Pillow (dev-only; the site ships just the JPEG).
import struct
import sys
import zlib

import numpy as np
from PIL import Image


def read_header(buf):
    if buf[:4] != b"\x76\x2f\x31\x01":
        raise SystemExit("not an OpenEXR file")
    p, attrs = 8, {}
    while buf[p] != 0:
        e = buf.index(b"\0", p); name = buf[p:e].decode(); p = e + 1
        e = buf.index(b"\0", p); p = e + 1  # attribute type, unused
        size = struct.unpack_from("<i", buf, p)[0]; p += 4
        attrs[name] = buf[p:p + size]; p += size
    return attrs, p + 1


def channels(raw):
    out, q = [], 0
    while raw[q] != 0:
        e = raw.index(b"\0", q); name = raw[q:e].decode(); q = e + 1
        ptype = struct.unpack_from("<i", raw, q)[0]; q += 16
        out.append((name, ptype))
    return out


def main(src, dst):
    buf = open(src, "rb").read()
    attrs, p = read_header(buf)
    if attrs["compression"][0] != 3:
        raise SystemExit("expected ZIP compression")
    chans = channels(attrs["channels"])
    if any(t != 1 for _, t in chans):
        raise SystemExit("expected HALF channels")
    x0, y0, x1, y1 = struct.unpack("<4i", attrs["dataWindow"])
    w, h = x1 - x0 + 1, y1 - y0 + 1
    lines_per_chunk = 16
    n_chunks = (h + lines_per_chunk - 1) // lines_per_chunk
    offsets = struct.unpack_from(f"<{n_chunks}Q", buf, p)
    img = np.zeros((h, w, len(chans)), np.float32)
    for off in offsets:
        y, size = struct.unpack_from("<ii", buf, off)
        rows = min(lines_per_chunk, h - (y - y0))
        packed = buf[off + 8:off + 8 + size]
        if size == rows * len(chans) * w * 2:
            inter = np.frombuffer(packed, np.uint8)  # stored raw: compression would not have helped
        else:
            data = np.frombuffer(zlib.decompress(packed), np.uint8).astype(np.int32)
            # OpenEXR ZIP: undo the byte delta predictor, then re-interleave the two halves.
            data = _undo_predictor(data)
            half = (len(data) + 1) // 2
            inter = np.empty(len(data), np.uint8)
            inter[0::2] = data[:half]
            inter[1::2] = data[half:]
        px = inter.view("<f2").reshape(rows, len(chans), w).astype(np.float32)
        img[y - y0:y - y0 + rows] = px.transpose(0, 2, 1)
    order = [n for n, _ in chans]
    rgb = np.stack([img[..., order.index(c)] for c in "RGB"], -1)
    rgb = np.maximum(rgb, 0)
    # 2x2 box downsample in linear light, then normalise so the brightest 0.05% sits at 1. The app
    # calibrates that percentile to 20.5 V mag/arcsec² (MILKY_WAY_SCALE in src/sky/stars.ts), so keep
    # the percentile in step with it when regenerating from another SVS file.
    rgb = rgb.reshape(h // 2, 2, w // 2, 2, 3).mean((1, 3))
    scale = np.percentile(rgb.max(-1), 99.95)
    rgb = np.clip(rgb / scale, 0, 1)
    srgb = np.where(rgb <= 0.0031308, rgb * 12.92, 1.055 * np.power(rgb, 1 / 2.4) - 0.055)
    Image.fromarray((srgb * 255 + 0.5).astype(np.uint8), "RGB").save(dst, quality=88, optimize=True, progressive=True)
    print(f"{w}x{h} -> {w // 2}x{h // 2}, linear scale 1/{scale:.4g} -> {dst}")


def _undo_predictor(d):
    # Each byte is stored as (value - previous + 128) mod 256; a running sum undoes it.
    out = np.empty_like(d)
    out[0] = d[0]
    out[1:] = (d[0] + np.cumsum(d[1:] - 128)) & 0xFF
    return out.astype(np.uint8)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("usage: build-milkyway.py <in.exr> <out.jpg>")
    main(sys.argv[1], sys.argv[2])
