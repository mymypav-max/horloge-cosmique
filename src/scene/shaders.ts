/**
 * Shaders GLSL (syntaxe GLSL ES 1.0, compatible WebGL 1 et WebGL 2 : Three.js
 * adapte automatiquement le code pour WebGL 2).
 *
 * Gestion des couleurs : les textures sont échantillonnées « brutes » (sRGB),
 * converties en linéaire dans le shader (γ = 2,2), éclairées, puis
 * reconverties en sRGB. Ce choix explicite donne le même rendu en WebGL 1 et 2.
 *
 * Éclairage : la direction du Soleil (uniforme sunDir, repère de la scène) est
 * calculée par le modèle astronomique. Elle ne dépend jamais de la caméra.
 */

const COMMON = /* glsl */ `
vec3 toLinear(vec3 c) { return pow(c, vec3(2.2)); }
vec3 toSRGB(vec3 c) { return pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2)); }
`;

export const SURFACE_VERTEX = /* glsl */ `
varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vPosW;
void main() {
  vUv = uv;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vPosW = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

/** Planète générique : réflexion diffuse (Lambert) avec terminateur légèrement adouci. */
export const PLANET_FRAGMENT = /* glsl */ `
uniform sampler2D map;
uniform vec3 sunDir;
uniform vec3 fallbackColor;
uniform float hasMap;
uniform float ambient;
uniform vec3 rimColor;
uniform float rimStrength;
uniform float opacity;
varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vPosW;
${COMMON}
void main() {
  vec3 N = normalize(vNormalW);
  vec3 V = normalize(cameraPosition - vPosW);
  float ndl = dot(N, sunDir);
  vec3 albedo = hasMap > 0.5 ? toLinear(texture2D(map, vUv).rgb) : toLinear(fallbackColor);
  // Terminateur adouci (enroulement de 0,06) : évite un bord trop dur.
  float diffuse = clamp((ndl + 0.06) / 1.06, 0.0, 1.0);
  vec3 color = albedo * (ambient + 1.25 * diffuse);
  float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  color += rimColor * fresnel * rimStrength * smoothstep(-0.2, 0.5, ndl);
  gl_FragColor = vec4(toSRGB(color), opacity);
}
`;

/**
 * Terre : jour / nuit calculés à partir de la direction réelle du Soleil.
 * - dayMap : surface (Blue Marble) ;
 * - dataMap : R = nuages, G = océans, B = lumières nocturnes.
 * Le terminateur est le lieu où dot(N, sunDir) = 0 ; une bande de ±6°
 * (crépuscule civil) adoucit la transition. Les lumières des villes ne
 * s'allument qu'au-delà du terminateur et n'éclairent jamais le côté jour.
 */
export const EARTH_FRAGMENT = /* glsl */ `
uniform sampler2D dayMap;
uniform sampler2D dataMap;
uniform vec3 sunDir;
uniform float cloudsOn;
uniform float lightsStrength;
uniform float opacity;
varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vPosW;
${COMMON}
void main() {
  vec3 N = normalize(vNormalW);
  vec3 V = normalize(cameraPosition - vPosW);
  float ndl = dot(N, sunDir);

  vec3 data = texture2D(dataMap, vUv).rgb;
  float clouds = data.r * cloudsOn;
  float ocean = data.g;
  float lights = data.b;

  vec3 day = toLinear(texture2D(dayMap, vUv).rgb);
  // Océans légèrement bleuis pour rester lisibles sur un téléviseur.
  day = mix(day, day * vec3(0.85, 1.0, 1.3) + vec3(0.002, 0.008, 0.03), ocean);

  float diffuse = clamp(ndl, 0.0, 1.0);
  // 1 = plein jour, 0 = nuit ; transition sur ±6° autour du terminateur.
  float dayMask = smoothstep(-0.105, 0.105, ndl);
  // Lumière rasante adoucie près du terminateur.
  float light = max(diffuse, dayMask * 0.06);

  vec3 surface = day * light * 1.35;

  // Reflet du Soleil sur les océans (absent sous les nuages).
  vec3 H = normalize(sunDir + V);
  float spec = pow(max(dot(N, H), 0.0), 70.0) * ocean * (1.0 - clouds) * smoothstep(0.0, 0.2, ndl);
  surface += vec3(1.0, 0.92, 0.8) * spec * 0.55;

  // Nuages éclairés par le Soleil.
  vec3 cloudColor = vec3(1.0) * light * 1.3;
  surface = mix(surface, cloudColor, clouds * 0.92);

  // Teinte orangée dans la bande crépusculaire.
  float twilight = smoothstep(-0.12, 0.0, ndl) * (1.0 - smoothstep(0.0, 0.16, ndl));
  surface += vec3(0.20, 0.07, 0.02) * twilight * 0.06;

  // Côté nuit : faible lueur pour deviner les continents, et lumières urbaines.
  float night = 1.0 - smoothstep(-0.14, 0.02, ndl);
  surface += day * 0.010 * night + vec3(0.6, 0.65, 0.75) * clouds * 0.008 * night;
  vec3 cityColor = vec3(1.0, 0.70, 0.36);
  surface += cityColor * pow(lights, 1.3) * lightsStrength * night * (1.0 - 0.75 * clouds);

  // Diffusion atmosphérique au limbe, côté éclairé.
  float fresnel = pow(1.0 - max(dot(N, V), 0.0), 2.6);
  surface += vec3(0.25, 0.5, 1.0) * fresnel * smoothstep(-0.25, 0.45, ndl) * 0.45;

  gl_FragColor = vec4(toSRGB(surface), opacity);
}
`;

/**
 * Halo atmosphérique : coque légèrement plus grande que la planète, faces
 * arrière, mélange additif. Sur ces faces, −dot(N, V) vaut 0 au bord extérieur
 * de la coque et limbDot au niveau du limbe de la planète : le halo est le plus
 * intense contre la planète et s'estompe vers l'espace.
 */
export const ATMOSPHERE_FRAGMENT = /* glsl */ `
uniform vec3 sunDir;
uniform vec3 glowColor;
uniform float intensity;
uniform float limbDot;
uniform float opacity;
varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vPosW;
void main() {
  vec3 N = normalize(vNormalW);
  vec3 V = normalize(cameraPosition - vPosW);
  float t = clamp(-dot(N, V) / limbDot, 0.0, 1.0);
  float glow = t * t * t * smoothstep(-0.3, 0.45, dot(N, sunDir));
  gl_FragColor = vec4(glowColor * glow * intensity * opacity, 1.0);
}
`;

/** Soleil : texture émissive avec assombrissement centre-bord. */
export const SUN_FRAGMENT = /* glsl */ `
uniform sampler2D map;
uniform float hasMap;
uniform float opacity;
varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vPosW;
${COMMON}
void main() {
  vec3 N = normalize(vNormalW);
  vec3 V = normalize(cameraPosition - vPosW);
  float mu = max(dot(N, V), 0.0);
  vec3 tex = hasMap > 0.5 ? toLinear(texture2D(map, vUv).rgb) : vec3(1.0, 0.6, 0.2);
  float limb = 1.0 - 0.55 * (1.0 - mu);
  vec3 color = (tex * 1.25 + vec3(0.35, 0.22, 0.05)) * limb;
  gl_FragColor = vec4(toSRGB(color), opacity);
}
`;

export const RING_VERTEX = /* glsl */ `
attribute float radial;
varying float vRadial;
varying vec3 vPosW;
void main() {
  vRadial = radial;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vPosW = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

/** Anneaux de Saturne, avec l'ombre de la planète calculée analytiquement. */
export const RING_FRAGMENT = /* glsl */ `
uniform sampler2D ringMap;
uniform float hasMap;
uniform vec3 sunDir;
uniform vec3 planetCenter;
uniform float planetRadius;
uniform vec3 ringNormal;
uniform float opacity;
varying float vRadial;
varying vec3 vPosW;
${COMMON}
void main() {
  vec4 tex = hasMap > 0.5 ? texture2D(ringMap, vec2(vRadial, 0.5)) : vec4(0.8, 0.75, 0.6, 0.6);
  vec3 rel = vPosW - planetCenter;
  float along = dot(rel, sunDir);
  float dist = length(rel - along * sunDir);
  float shadow = along < 0.0 ? smoothstep(planetRadius * 0.96, planetRadius * 1.04, dist) : 1.0;
  float lit = 0.35 + 0.85 * abs(dot(ringNormal, sunDir));
  vec3 color = toLinear(tex.rgb) * lit * (0.08 + 0.92 * shadow) * 1.2;
  gl_FragColor = vec4(toSRGB(color), tex.a * 0.95 * opacity);
}
`;

export const STAR_VERTEX = /* glsl */ `
attribute float size;
attribute vec3 color;
uniform float pixelRatio;
uniform float brightness;
varying vec3 vColor;
void main() {
  vColor = color * brightness;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * pixelRatio;
  gl_Position = projectionMatrix * mv;
}
`;

export const STAR_FRAGMENT = /* glsl */ `
varying vec3 vColor;
void main() {
  vec2 d = gl_PointCoord - vec2(0.5);
  float r = length(d) * 2.0;
  float a = 1.0 - smoothstep(0.25, 1.0, r);
  gl_FragColor = vec4(vColor * a, 1.0);
}
`;
