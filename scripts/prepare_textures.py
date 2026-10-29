#!/usr/bin/env python3
"""
Prépare les textures embarquées dans public/textures/ à partir des images
sources (voir scripts/fetch-texture-sources.sh et docs/RESSOURCES.md).

Usage :
    python3 scripts/prepare_textures.py [dossier_sources] [dossier_sortie]
    (défauts : .texture-sources et public/textures)

Prérequis : Python 3.9+, Pillow, NumPy (pip install pillow numpy).

Le traitement est déterministe : mêmes sources → mêmes textures.
Les empreintes SHA-256 des sources attendues sont vérifiées.
"""

from __future__ import annotations

import hashlib
import sys
from pathlib import Path

import numpy as np
from PIL import Image

SOURCES_SHA256 = {
    "earth_color_4096x2048.jpg": "caf453cbb16a8b420acdecdb17abe327ff75384eb6cea46cd9a34c6f2bec4dd1",
    "earth_clouds_4096x2048.jpg": "25075d5d20afba82c0293e7d3f5eca03820d7a0d796e76863b2ca14a3b350d35",
    "earth_landocean_4050x2025.png": "224f4a244085dc97b6593cccd7e3f6591fa2b7b0628f886a11c42acfa1e4f3fa",
    "dnb_land_ocean_ice_2012.png": "c1893c1a97634f9d9dc45a62f83916c77cae742d5128551f8d7c4e4f5296ed36",
    "sss_mercury.jpg": "5a5c80607f643496bac9a631e71957def35ed788895f18b678ac849c2b38e48a",
    "sss_venus_atmosphere.jpg": "225012ad4911730605c4e189ca2a3bf674fce50cc48aab4102b936b47d6991ac",
    "sss_mars.jpg": "88d631422f4184dfd8f5afb6429637bea5a59bb1e78fd676512c86b56480be18",
    "sss_jupiter.jpg": "b0f04d005350252636b0e3396fc592548cbd9e9126b269d32d5c6abd4b0e4f2b",
    "sss_saturn.jpg": "54a900ca9bf7ab62e70f862852759abdf342e6d6436a95a2fe9ebdb6bcd3bbac",
    "sss_saturn_ring_alpha.png": "4b0644b2f3ef259fd0bfaedd9dc52f9e7d9738f65f50363e8c4dd19f650d7334",
    "sss_uranus.jpg": "d15239d46f82d3ea13d2b260b5b29b2a382f42f2916dae0694d0387b1204a09d",
    "sss_neptune.jpg": "cb42ea82709741d28b0af44d8b283cbc6dbd0c521a7f0e1e1e010ade00977df6",
    "sss_sun.jpg": "ff0f076ba65e03b5ab518451bc96699325be38e3ccbdd5869ee1c00f3a0c8816",
}

# JPEG sans sous-échantillonnage de la chrominance pour la texture de données
# (canaux indépendants), sous-échantillonnage standard pour les couleurs.
JPEG_COLOR = dict(quality=86, optimize=True, progressive=False, subsampling=2)
JPEG_DATA = dict(quality=90, optimize=True, progressive=False, subsampling=0)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def check_sources(src: Path) -> None:
    missing = [name for name in SOURCES_SHA256 if not (src / name).exists()]
    if missing:
        sys.exit(f"Sources manquantes dans {src} : {', '.join(missing)}\n"
                 "Lancez d'abord scripts/fetch-texture-sources.sh")
    for name, digest in SOURCES_SHA256.items():
        actual = sha256(src / name)
        if actual != digest:
            sys.exit(f"Empreinte inattendue pour {name} : {actual}")


def resize(img: Image.Image, size: tuple[int, int]) -> Image.Image:
    return img.resize(size, Image.LANCZOS) if img.size != size else img


def to_unit(img: Image.Image, size: tuple[int, int]) -> np.ndarray:
    """Image en niveaux de gris redimensionnée, valeurs dans [0, 1]."""
    return np.asarray(resize(img.convert("L"), size), dtype=np.float32) / 255.0


def earth(src: Path, out: Path) -> None:
    day = Image.open(src / "earth_color_4096x2048.jpg").convert("RGB")
    resize(day, (4096, 2048)).save(out / "earth-day-4096.jpg", **JPEG_COLOR)
    resize(day, (2048, 1024)).save(out / "earth-day-2048.jpg", **JPEG_COLOR)

    size = (2048, 1024)
    # R : nuages. Les zones claires du composite de nuages sont proches de 0 ;
    # une courbe douce supprime le faible relief résiduel et sature les nuages.
    clouds = to_unit(Image.open(src / "earth_clouds_4096x2048.jpg"), size)
    clouds = np.clip((clouds - 0.04) / 0.82, 0.0, 1.0) ** 1.15

    # G : masque océans (1 = eau), utilisé pour le reflet du Soleil.
    ocean = to_unit(Image.open(src / "earth_landocean_4050x2025.png"), size)

    # B : lumières nocturnes extraites du Black Marble 2012. Le fond bleu
    # (océans, terres, glaces) est éliminé : seuls les éclairages chauds
    # (rouge > bleu) subsistent.
    dnb = np.asarray(resize(Image.open(src / "dnb_land_ocean_ice_2012.png").convert("RGB"), size), dtype=np.float32)
    lights = np.clip((dnb[..., 0] - 0.35 * dnb[..., 2] - 4.0) / 170.0, 0.0, 1.0)

    data = np.stack([clouds, ocean, lights], axis=-1)
    Image.fromarray((data * 255.0 + 0.5).astype(np.uint8), "RGB").save(out / "earth-data-2048.jpg", **JPEG_DATA)


def planets(src: Path, out: Path) -> None:
    mapping = {
        "sss_mercury.jpg": "mercury.jpg",
        "sss_venus_atmosphere.jpg": "venus.jpg",
        "sss_mars.jpg": "mars.jpg",
        "sss_jupiter.jpg": "jupiter.jpg",
        "sss_saturn.jpg": "saturn.jpg",
        "sss_uranus.jpg": "uranus.jpg",
        "sss_neptune.jpg": "neptune.jpg",
        "sss_sun.jpg": "sun.jpg",
    }
    for source, target in mapping.items():
        img = Image.open(src / source).convert("RGB")
        resize(img, (1024, 512)).save(out / target, **JPEG_COLOR)

    # Anneaux de Saturne : profil radial (bord intérieur → bord extérieur).
    # Les lignes de l'image source sont quasi identiques : on les moyenne.
    ring = np.asarray(Image.open(src / "sss_saturn_ring_alpha.png").convert("RGBA"), dtype=np.float32)
    profile = ring.mean(axis=0, keepdims=True)
    profile = np.repeat(profile, 4, axis=0)
    img = Image.fromarray((profile + 0.5).astype(np.uint8), "RGBA")
    resize(img, (1024, 4)).save(out / "saturn-ring.png", optimize=True)


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else root / ".texture-sources"
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else root / "public" / "textures"
    check_sources(src)
    out.mkdir(parents=True, exist_ok=True)
    earth(src, out)
    planets(src, out)
    for f in sorted(out.iterdir()):
        print(f"{f.name:24s} {f.stat().st_size / 1024:8.0f} Kio")


if __name__ == "__main__":
    main()
