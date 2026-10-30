#!/usr/bin/env python3
"""
Prépare les cartes des lunes embarquées dans public/textures/moons/ à partir
des images sources (voir scripts/moons/fetch-moon-texture-sources.sh et
docs/RESSOURCES.md).

Usage :
    python3 scripts/moons/prepare_moon_textures.py [dossier_sources] [dossier_sortie]
    (défauts : .moon-texture-sources et public/textures/moons)

Prérequis : Python 3.9+, Pillow, NumPy.

Traitements (déterministes) :
- toutes les cartes sont ramenées à la convention des planètes du projet :
  projection cylindrique simple, longitude 0° au centre, longitudes est
  croissantes vers la droite. Les cartes centrées sur 180° sont décalées d'une
  demi-largeur. L'orientation de chaque carte a été vérifiée sur des repères
  de la nomenclature UAI (tableau dans docs/RESSOURCES.md) ;
- les zones sans données (noir uniforme dans les sources : nord des lunes
  d'Uranus et de Triton, lacunes de Callisto, d'Europe et de Titan ; gris
  clair uniforme pour Déimos) sont remplies par la teinte moyenne de la
  surface connue, sans inventer de relief ;
- Déimos : les marches de luminosité entre les tuiles de la mosaïque source
  sont compensées par des rampes douces (aucun détail ajouté ni déplacé) ;
- Titan : la carte d'albédo de surface (Cassini, proche infrarouge) est
  teintée en orange et atténuée, car une brume épaisse masque la surface en
  lumière visible ;
- redimensionnement (1024 × 512, 2048 × 1024 pour la Lune), JPEG.
"""

from __future__ import annotations

import hashlib
import sys
from pathlib import Path

import numpy as np
from PIL import Image

# Fichier source → (identifiant de la lune, centre de la carte en degrés de longitude est, empreinte SHA-256).
SOURCES = {
    "sss_moon.jpg": ("moon", 0, "2764ba6535ea0481a062846ee033cc7a909dae05b31a8fd13f3e98f3a7fd92bd"),
    "nasa3d_phobos.jpg": ("phobos", 0, "8ec807b353eb28f44b5aa24b8a887935ee5563f5b63bde2430a9988220f71463"),
    "nasa3d_deimos.jpg": ("deimos", 0, "204e89cc7dc128e9fa6ae5f14cc23dc7917a4a8ccab9feff1a9544d22b354dce"),
    "io-2k.jpg": ("io", 0, "2f65d8ee2716ceeff427492906dae8919cddb0e4c336663648e497d1938272f3"),
    "europa-2k.jpg": ("europa", 180, "3a1b17784e98621f558155e7b4c8dae99a89f6c33053bbe900ee681bf1ce4f59"),
    "ganymede-2k.jpg": ("ganymede", 180, "ef92f57c9ff9701b7808c8344cf66b53356855067bb021af06828dff6b0cdd47"),
    "callisto-2k.jpg": ("callisto", 180, "ad67975a89acec5bd0e5d8d2b392b4c6d062e4119b7d6320cdfa6c3852f0f420"),
    "mimas-4k.jpg": ("mimas", 0, "f2d62eaa50c7864e303a13434738a7bc6db0e133f1f4b163c2506979800c1116"),
    "enceladus-4k.jpg": ("enceladus", 180, "00c6af6394f8ac0c3ef89341c6c5bc898945585fdf2361cb22e80ae01c6ad12c"),
    "tethys-4k.jpg": ("tethys", 180, "6b5dc1434b704b272a90ed04db820538ffca8edb0ee20c68932cc49a01d60dc1"),
    "dione-4k.jpg": ("dione", 180, "859312eac528e0411427e89309ebab2612122048c9485727bfe3e4c009865d7a"),
    "rhea-4k.jpg": ("rhea", 180, "f5bca905a538530a92618aa6d1f8b588e5e03e3eda59b183dfaad3f04470248d"),
    "titan-4k.jpg": ("titan", 180, "5e07703e5116fa3796c8261143e4952311c13d4fc868e2933117e94c22c03bb1"),
    "iapetus-4k.jpg": ("iapetus", 180, "9b00db76dff8ad5c680ef5fbee4b6a04d4d4a307376897ce0731f4bb8f62c05e"),
    "nasa3d_miranda.jpg": ("miranda", 0, "844b2deb88b8dbc93142bf5b85036ce7dd45db131e6251b4e6a95e179ae44c81"),
    "nasa3d_ariel.jpg": ("ariel", 0, "fc0f8a59b5c29e44e4a3409e452f0427f5b53b8c9b41c89dc35d28babaae5cee"),
    "nasa3d_umbriel.jpg": ("umbriel", 0, "f1378bc2880bb0d4ddad50815083987aab38c9aae630cbd65465c6773495e511"),
    "nasa3d_titania.jpg": ("titania", 0, "087425752c8f5090965f5a4fac7d50a4c450563edd50b807bbc1d45ebeedd312"),
    "nasa3d_oberon.jpg": ("oberon", 0, "ed29842e1b1fb96ee9626a62d4ee7bbf53756997ef33b1edda2dbead43383460"),
    "triton-4k.jpg": ("triton", 0, "da0cf6ea939e9f8b88f53b79d4e05a0643b79f2d266dd421bc5494c0929f3e6e"),
}

JPEG = dict(quality=88, optimize=True, progressive=False, subsampling=2)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def box_mean(a: np.ndarray, radius: int) -> np.ndarray:
    """Moyenne glissante (fenêtre carrée), bords répétés horizontalement (longitude) et prolongés verticalement."""
    padded = np.pad(a, ((radius, radius), (0, 0)), mode="edge")
    padded = np.concatenate([padded[:, -radius:], padded, padded[:, :radius]], axis=1)
    c = np.cumsum(np.cumsum(padded, axis=0), axis=1)
    c = np.pad(c, ((1, 0), (1, 0)))
    k = 2 * radius + 1
    s = c[k:, k:] - c[:-k, k:] - c[k:, :-k] + c[:-k, :-k]
    return s / (k * k)


def fill_region(rgb: np.ndarray, region: np.ndarray) -> tuple[np.ndarray, float]:
    """Remplit une zone sans données par la teinte moyenne de la surface connue (sans relief), avec un fondu de quelques pixels."""
    if not region.any():
        return rgb, 0.0
    scale = rgb.shape[1] / 1024
    # Élargissement de quelques pixels : la bordure de la lacune (artefacts JPEG, estompage) lui appartient.
    region = box_mean(region.astype(np.float64), max(2, int(8 * scale))) > 0
    mask = box_mean(region.astype(np.float64), max(2, int(3 * scale)))
    known = ~region
    mean = rgb[known].reshape(-1, 3).mean(axis=0)
    out = rgb * (1 - mask[..., None]) + mean[None, None, :] * mask[..., None]
    return out, float(region.mean())


def fill_unknown(rgb: np.ndarray) -> tuple[np.ndarray, float]:
    """Remplit les grandes zones noires (non photographiées) par la teinte moyenne de la surface connue."""
    black = (rgb.max(axis=2) < 10).astype(np.float64)
    # Seules les zones noires étendues sont des lacunes (pas les ombres de cratères).
    scale = rgb.shape[1] / 1024
    region = box_mean(black, max(2, int(6 * scale))) > 0.9
    return fill_region(rgb, region)


# Déimos (carte en relief ombré de l'USGS d'après Viking, 1440 × 720) : mosaïque de tuiles dont les raccords forment
# des marches de luminosité (mesurées aussi sur le fond uniforme, donc sans rapport avec le relief) :
# lignes 160 et 560 sur toute la largeur, colonnes 280 et 680 entre ces deux lignes.
DEIMOS_SEAM_ROWS = (160, 560)
DEIMOS_SEAM_COLUMNS = (280, 680)


def smooth1d(v: np.ndarray, radius: int, wrap: bool) -> np.ndarray:
    """Moyenne glissante le long du premier axe (périodique en longitude, bords prolongés sinon)."""
    padded = np.pad(v, ((radius, radius), (0, 0)), mode="wrap" if wrap else "edge")
    c = np.cumsum(np.pad(padded, ((1, 0), (0, 0))), axis=0)
    return (c[2 * radius + 1 :] - c[: -2 * radius - 1]) / (2 * radius + 1)


def level_seam(rgb: np.ndarray, row: int, wrap: bool = True, radius: int = 30, half: int = 24) -> np.ndarray:
    """Supprime une marche de luminosité entre tuiles (raccord à la ligne « row ») par une rampe douce de part et d'autre.

    La marche est mesurée colonne par colonne (3 lignes de chaque côté), lissée le long du raccord (fenêtre de
    2 × radius + 1 pixels, pour ne retenir que l'écart entre tuiles et non le relief), puis répartie pour moitié
    sur chaque tuile en s'estompant sur « half » lignes. Aucun détail n'est ajouté ni déplacé.
    """
    out = rgb.copy()
    step = smooth1d(rgb[row : row + 3].mean(axis=0) - rgb[row - 3 : row].mean(axis=0), radius, wrap)
    for k in range(half):
        w = 0.5 * (1 - k / half)
        out[row + k] -= w * step
        out[row - 1 - k] += w * step
    # Le raccord lui-même est parfois un liseré d'une ligne : remplacé par la moyenne de ses voisines.
    out[row] = 0.5 * (out[row - 1] + out[row + 1])
    return out


def deimos_repair(rgb: np.ndarray) -> np.ndarray:
    """Raccords de tuiles et liserés de bord de la carte de Déimos (défauts de la mosaïque source)."""
    out = rgb.copy()
    top, bottom = DEIMOS_SEAM_ROWS
    for col in DEIMOS_SEAM_COLUMNS:
        band = out[top:bottom].transpose(1, 0, 2)
        # Raccords verticaux plus courts (400 lignes) et plus variables : fenêtre de lissage de 31 pixels.
        out[top:bottom] = level_seam(band, col, wrap=False, radius=15).transpose(1, 0, 2)
    for row in DEIMOS_SEAM_ROWS:
        out = level_seam(out, row)
    # Liseré sombre de la dernière colonne (méridien 180°) et de la dernière ligne (pôle Sud) : valeur des voisines.
    out[:, -1] = 0.5 * (out[:, -2] + out[:, 0])
    out[-1] = out[-2]
    return out


def large_components(region: np.ndarray, min_fraction: float) -> np.ndarray:
    """Ne garde que les composantes connexes (4-voisinage, longitude périodique) couvrant au moins min_fraction de la carte."""
    h, w = region.shape
    seen = np.zeros_like(region)
    keep = np.zeros_like(region)
    for y0, x0 in zip(*np.nonzero(region)):
        if seen[y0, x0]:
            continue
        seen[y0, x0] = True
        stack = [(y0, x0)]
        pixels = []
        while stack:
            y, x = stack.pop()
            pixels.append((y, x))
            for ny, nx in ((y - 1, x), (y + 1, x), (y, (x - 1) % w), (y, (x + 1) % w)):
                if 0 <= ny < h and region[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    stack.append((ny, nx))
        if len(pixels) >= min_fraction * h * w:
            ys, xs = zip(*pixels)
            keep[list(ys), list(xs)] = True
    return keep


def deimos_unmapped(rgb: np.ndarray) -> np.ndarray:
    """Zone non cartographiée de la carte de Déimos : fond gris clair uniforme (niveau ≈ 190, contre ≈ 120 pour la
    surface dessinée), sans aucune texture. Les petits trous (trait de graduation, chiffres) sont rebouchés."""
    lum = rgb.mean(axis=2)
    mean = box_mean(lum, 6)
    sd = np.sqrt(np.maximum(box_mean(lum * lum, 6) - mean * mean, 0))
    region = (mean > 170) & (sd < 3)
    # Fermeture morphologique (dilatation puis érosion de 4 pixels) : graduations et chiffres du fond inclus.
    region = box_mean(region.astype(np.float64), 4) > 0
    region = box_mean((~region).astype(np.float64), 4) == 0
    # Seules les grandes étendues sont du fond : de petites pentes claires et lisses du relief dessiné sont écartées.
    return large_components(region, 0.005)


def clean_edges(rgb: np.ndarray) -> np.ndarray:
    """Remplace les colonnes noires des bords gauche et droit (liseré de certaines sources) par la plus proche colonne valide."""
    out = rgb.copy()
    dark = out.mean(axis=(0, 2)) < 12
    w = out.shape[1]
    band = w // 64
    left_dark = np.nonzero(dark[:band])[0]
    right_dark = np.nonzero(dark[w - band :])[0]
    left = int(left_dark.max()) + 1 if left_dark.size else 0
    right = w - band + int(right_dark.min()) - 1 if right_dark.size else w - 1
    out[:, :left] = out[:, left : left + 1]
    out[:, right + 1 :] = out[:, right : right + 1]
    return out


def titan_haze(rgb: np.ndarray) -> np.ndarray:
    lum = rgb.mean(axis=2)
    norm = np.clip((lum - lum.mean()) / (3 * lum.std() + 1e-6), -1, 1)
    base = np.array([214.0, 152.0, 78.0])
    return base[None, None, :] * (0.86 + 0.14 * norm[..., None])


def main() -> None:
    src = Path(sys.argv[1] if len(sys.argv) > 1 else ".moon-texture-sources")
    out = Path(sys.argv[2] if len(sys.argv) > 2 else "public/textures/moons")
    out.mkdir(parents=True, exist_ok=True)
    for name, (moon, centre, digest) in SOURCES.items():
        path = src / name
        if not path.exists():
            sys.exit(f"Source manquante : {path} (lancez scripts/moons/fetch-moon-texture-sources.sh)")
        actual = sha256(path)
        if actual != digest:
            sys.exit(f"Empreinte inattendue pour {name} : {actual}")
        rgb = np.asarray(Image.open(path).convert("RGB"), dtype=np.float64)
        rgb = clean_edges(rgb)
        if centre == 180:
            rgb = np.roll(rgb, rgb.shape[1] // 2, axis=1)
        if moon == "deimos":
            rgb = deimos_repair(rgb)
            rgb, filled = fill_region(rgb, deimos_unmapped(rgb))
        else:
            rgb, filled = fill_unknown(rgb)
        if moon == "titan":
            rgb = titan_haze(rgb)
        size = (2048, 1024) if moon == "moon" else (1024, 512)
        img = Image.fromarray(np.clip(rgb + 0.5, 0, 255).astype(np.uint8), "RGB").resize(size, Image.LANCZOS)
        img.save(out / f"{moon}.jpg", **JPEG)
        print(f"{moon:10s} ← {name:20s} centre {centre:3d}°  lacunes remplies : {filled * 100:5.1f} %")


if __name__ == "__main__":
    main()
