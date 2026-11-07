import numpy as np
from PIL import Image

rng = np.random.default_rng(11)
N = 2048


def periodic_noise(n, sx, sy):
    f = np.fft.fft2(rng.normal(size=(n, n)))
    fy = np.fft.fftfreq(n)[:, None] * n / sy
    fx = np.fft.fftfreq(n)[None, :] * n / sx
    out = np.fft.ifft2(f * np.exp(-(fx**2 + fy**2) / 2)).real
    return (out - out.mean()) / out.std()


warp = periodic_noise(N, 3, 40)
fine = periodic_noise(N, 2, 350)
pores = periodic_noise(N, 10, 90)
broad = periodic_noise(N, 3, 6)

planks = 5
ph = N / planks
y = np.arange(N)[:, None]
plank_id = (y[:, 0] * planks // N).astype(int)
tone = rng.uniform(-0.1, 0.1, planks)[plank_id][:, None]
shift = rng.uniform(0, 6.28, planks)[plank_id][:, None]

v = (y % ph) / ph
rings = np.sin((v * 16 + warp * 1.5 + shift) * 2.2)
h = 0.55 + 0.17 * rings + 0.13 * fine + 0.1 * broad + tone
h = h - 0.16 * np.clip(pores - 1.6, 0, 2)

seam = np.minimum(y % ph, ph - (y % ph)) < 3
h = np.where(seam, 0.12, h)
h = np.clip(h, 0, 1)

dark = np.array([46, 26, 16])
mid = np.array([104, 62, 37])
light = np.array([146, 93, 56])
t = h[..., None]
rgb = np.where(t < 0.5, dark + (mid - dark) * (t * 2), mid + (light - mid) * (t * 2 - 1))
Image.fromarray(rgb.astype(np.uint8)).save('public/tex/wood.jpg', quality=82, optimize=True)


def normal_from(b, strength):
    dx = np.roll(b, -1, 1) - np.roll(b, 1, 1)
    dy = np.roll(b, -1, 0) - np.roll(b, 1, 0)
    nz = np.full_like(b, strength)
    ln = np.sqrt(dx**2 + dy**2 + nz**2)
    return ((np.stack([-dx / ln, dy / ln, nz / ln], -1) * 0.5 + 0.5) * 255).astype(np.uint8)


bump = 0.8 * fine + 0.4 * np.clip(pores, -3, 3) - np.where(seam, 5, 0)
Image.fromarray(normal_from(bump, 3.0)).resize((1024, 1024), Image.LANCZOS).save('public/tex/wood_n.jpg', quality=78, optimize=True)

M = 256
lx = np.arange(M)[None, :]
ly = np.arange(M)[:, None]
weave = np.sin(lx / M * 6.283 * 48) * np.sin(ly / M * 6.283 * 48)
Image.fromarray(normal_from(weave * 0.8 + periodic_noise(M, 1, 1) * 0.5, 3.2)).save('public/tex/linen_n.jpg', quality=85)
