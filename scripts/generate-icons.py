"""Author the code-native LingForge monogram as PNG/ICO using Python's stdlib.

No downloaded artwork or runtime dependency. Run only to regenerate committed
assets after changing the monogram. Coordinates match public/favicon.svg.
"""

from pathlib import Path
import struct
import zlib

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src-tauri" / "icons"


def rounded_square(x, y, inset, radius):
    low, high = inset, 64 - inset
    if not (low <= x <= high and low <= y <= high):
        return False
    cx = min(max(x, low + radius), high - radius)
    cy = min(max(y, low + radius), high - radius)
    return (x - cx) ** 2 + (y - cy) ** 2 <= radius**2


def color_at(x, y):
    if not rounded_square(x, y, 0, 12):
        return (0, 0, 0, 0)
    if not rounded_square(x, y, 2, 10):
        return (83, 33, 38, 255)
    if (
        (20.5 <= x <= 23.5 and 14.5 <= y <= 49.5)
        or (20.5 <= x <= 46.5 and 46.5 <= y <= 49.5)
        or (20.5 <= x <= 40.5 and 30.5 <= y <= 33.5)
        or (30.5 <= x <= 46.5 and 14.5 <= y <= 17.5)
    ):
        return (240, 79, 86, 255)
    return (16, 16, 17, 255)


def chunk(kind, data):
    return (
        struct.pack(">I", len(data))
        + kind
        + data
        + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)
    )


def png(size):
    rows = bytearray()
    for y in range(size):
        rows.append(0)
        for x in range(size):
            samples = [
                color_at((x + dx) * 64 / size, (y + dy) * 64 / size)
                for dy in (0.25, 0.75)
                for dx in (0.25, 0.75)
            ]
            rows.extend(round(sum(sample[c] for sample in samples) / 4) for c in range(4))
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(bytes(rows), 9))
        + chunk(b"IEND", b"")
    )


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    images = [(size, png(size)) for size in (32, 128, 256)]
    for (size, data), name in zip(images, ("32x32.png", "128x128.png", "128x128@2x.png")):
        (OUT / name).write_bytes(data)
    offset = 6 + 16 * len(images)
    directory = bytearray(struct.pack("<HHH", 0, 1, len(images)))
    for size, data in images:
        directory.extend(struct.pack("<BBBBHHII", size % 256, size % 256, 0, 0, 1, 32, len(data), offset))
        offset += len(data)
    (OUT / "icon.ico").write_bytes(bytes(directory) + b"".join(data for _, data in images))


if __name__ == "__main__":
    main()
