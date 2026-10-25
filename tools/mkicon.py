"""生成 PWA 图标（纯标准库写 PNG，不依赖 Pillow）"""
import math
import struct
import zlib

BRAND = (55, 138, 221)
WHITE = (255, 255, 255)


def write_png(path, w, h, pixels):
    raw = b''
    for row in pixels:
        raw += b'\x00' + bytes(v for px in row for v in px)

    def chunk(tag, data):
        return (struct.pack('>I', len(data)) + tag + data +
                struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff))

    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))  # 8bit RGBA
    png += chunk(b'IDAT', zlib.compress(raw, 9))
    png += chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(png)


def in_rounded_rect(x, y, size, radius):
    if x < 0 or y < 0 or x > size or y > size:
        return False
    cx = min(max(x, radius), size - radius)
    cy = min(max(y, radius), size - radius)
    return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2 + 1e-9


def dist_to_segment(px, py, ax, ay, bx, by):
    vx, vy = bx - ax, by - ay
    wx, wy = px - ax, py - ay
    t = max(0.0, min(1.0, (wx * vx + wy * vy) / (vx * vx + vy * vy)))
    dx, dy = px - (ax + t * vx), py - (ay + t * vy)
    return math.hypot(dx, dy)


def render(size, maskable=False):
    ss = 2  # 超采样
    s = size * ss
    radius = 0.0 if maskable else 0.22 * s
    scale = 0.62 if maskable else 0.78
    cx, cy = 0.40 * s, 0.40 * s
    r = 0.26 * s * scale
    lw = 0.085 * s * scale
    hx0, hy0 = cx + r * 0.72, cy + r * 0.72
    hx1, hy1 = cx + r * 1.65, cy + r * 1.65

    rows = []
    for y in range(size):
        row = []
        for x in range(size):
            acc_r = acc_g = acc_b = acc_a = 0
            for sy in range(ss):
                for sx in range(ss):
                    px = x * ss + sx + 0.5
                    py = y * ss + sy + 0.5
                    if not in_rounded_rect(px, py, s, radius):
                        continue
                    d_circle = abs(math.hypot(px - cx, py - cy) - r)
                    d_hand = dist_to_segment(px, py, hx0, hy0, hx1, hy1) - lw / 2
                    d = min(d_circle, d_hand)
                    if d < 0:
                        col = WHITE
                    else:
                        col = BRAND
                    acc_r += col[0]
                    acc_g += col[1]
                    acc_b += col[2]
                    acc_a += 255
            n = ss * ss
            if acc_a == 0:
                row.append((0, 0, 0, 0))
            else:
                a = acc_a // n
                # 以不透明样本数做颜色平均
                cnt = n if a == 255 else max(1, acc_a // 255)
                row.append((acc_r // cnt, acc_g // cnt, acc_b // cnt, a))
        rows.append(row)
    return rows


def main():
    base = 'E:/workbuddy code/kadian/assets/icons/'
    write_png(base + 'icon-192.png', 192, 192, render(192))
    write_png(base + 'icon-512.png', 512, 512, render(512))
    write_png(base + 'icon-maskable-512.png', 512, 512, render(512, maskable=True))
    print('icons written')


if __name__ == '__main__':
    main()
