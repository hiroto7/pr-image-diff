"""public/icon.svg と同じ図柄の PNG アイコンを生成する (依存ライブラリなし)。

Android の PWA インストール (= 共有ターゲットの有効化) と iOS のホーム画面アイコンには PNG が必要。
使い方: python3 scripts/make-icons.py
"""
import struct, zlib, os

SS = 3  # スーパーサンプリング倍率 (アンチエイリアス用)

def in_rrect(x, y, rx, ry, w, h, r):
    if not (rx <= x <= rx + w and ry <= y <= ry + h):
        return False
    cx = min(max(x, rx + r), rx + w - r)
    cy = min(max(y, ry + r), ry + h - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r

# (x, y, w, h, 角丸, (r, g, b), 不透明度) を 512 座標系で、下から順に
def shapes(maskable):
    return [
        (0, 0, 512, 512, 0 if maskable else 96, (0x0D, 0x11, 0x17), 1.0),
        (96, 136, 200, 200, 20, (0xF8, 0x51, 0x49), 1.0),
        (216, 176, 200, 200, 20, (0x3F, 0xB9, 0x50), 0.85),
        (252, 96, 8, 320, 4, (0xFF, 0xFF, 0xFF), 1.0),
    ]

def render(size, maskable):
    n = size * SS
    k = 512 / n
    rows = []
    acc = [[0.0] * 4 for _ in range(size * size)]
    for j in range(n):
        y = (j + 0.5) * k
        for i in range(n):
            x = (i + 0.5) * k
            r = g = b = a = 0.0
            for sx, sy, w, h, rad, col, op in shapes(maskable):
                if in_rrect(x, y, sx, sy, w, h, rad):
                    r = col[0] * op + r * (1 - op)
                    g = col[1] * op + g * (1 - op)
                    b = col[2] * op + b * (1 - op)
                    a = op + a * (1 - op)
            p = acc[(j // SS) * size + i // SS]
            p[0] += r * a; p[1] += g * a; p[2] += b * a; p[3] += a
    for j in range(size):
        row = bytearray([0])
        for i in range(size):
            r, g, b, a = acc[j * size + i]
            row += bytes([round(r / a), round(g / a), round(b / a), round(a / (SS * SS) * 255)] if a else [0, 0, 0, 0])
        rows.append(bytes(row))
    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data))
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(b''.join(rows), 9)) + chunk(b'IEND', b''))

out = os.path.join(os.path.dirname(__file__), '..', 'public')
for name, size, maskable in [('icon-192.png', 192, False), ('icon-512.png', 512, False),
                             ('icon-maskable-512.png', 512, True), ('apple-touch-icon.png', 180, True)]:
    with open(os.path.join(out, name), 'wb') as f:
        f.write(render(size, maskable))
    print(name)
