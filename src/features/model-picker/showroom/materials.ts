import * as THREE from "three";

/** Shared uniforms let one clock and one selection value drive every material of a display. */
export interface JellyUniforms {
  uTime: { value: number };
  uGlow: { value: number };
}

export function createJellyUniforms(): JellyUniforms {
  return { uTime: { value: 0 }, uGlow: { value: 0 } };
}

/**
 * Translucent jelly. COLOR_0 was baked by assets-src/showroom/qwen_star.py:
 * R = ambient occlusion, G = thickness, B = proximity to the core star.
 * Without transmission (low quality) the same material fakes depth with alpha.
 */
export function createJellyMaterial(uniforms: JellyUniforms, transmission: boolean): THREE.MeshPhysicalMaterial {
  const material = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color("#b08cff"),
    roughness: 0.14,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    ior: 1.34,
    transmission: transmission ? 0.94 : 0,
    thickness: 1.5,
    attenuationColor: new THREE.Color("#8a58f2"),
    attenuationDistance: 1.9,
    iridescence: 0.4,
    iridescenceIOR: 1.25,
    iridescenceThicknessRange: [120, 380],
    specularIntensity: 1,
    envMapIntensity: 1.1,
    transparent: !transmission,
    opacity: transmission ? 1 : 0.86,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uGlow = uniforms.uGlow;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        attribute vec4 color;
        varying vec3 vBaked;
        uniform float uTime;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vBaked = color.rgb;
        // A slow surface breath: thin parts move more than the core.
        float wobble = sin(uTime * 1.4 + position.y * 2.6 + position.x * 1.7);
        transformed += objectNormal * wobble * 0.012 * (1.2 - color.g);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vBaked;
        uniform float uGlow;`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        // Creases read deeper and more saturated, the way a real gel does.
        diffuseColor.rgb *= mix(vec3(0.62, 0.5, 0.92), vec3(1.0), smoothstep(0.1, 0.8, vBaked.r));`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        {
          vec3 viewDirection = normalize(vViewPosition);
          float facing = saturate(dot(normal, viewDirection));
          float rim = pow(1.0 - facing, 3.0);
          float core = pow(vBaked.b, 1.8);
          // Light from the inner star scatters through the belly.
          totalEmissiveRadiance += vec3(1.0, 0.83, 0.98) * core * (0.34 + 0.5 * uGlow);
          totalEmissiveRadiance += vec3(0.62, 0.42, 1.0) * rim * (0.28 + 0.3 * uGlow);
          totalEmissiveRadiance += vec3(0.32, 0.2, 0.62) * (1.0 - vBaked.g) * 0.16;
        }`,
      );
  };
  material.customProgramCacheKey = () => `aa-jelly-${transmission ? "t" : "a"}`;
  return material;
}

/** Thin curved glass. Almost invisible face-on, bright at grazing angles, with real environment reflections. */
export function createGlassMaterial(side: THREE.Side, strength = 1): THREE.MeshPhysicalMaterial {
  const material = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color("#f4fbff"),
    roughness: 0.04,
    metalness: 0,
    transparent: true,
    depthWrite: false,
    side,
    envMapIntensity: 1.6,
    specularIntensity: 1,
    ior: 1.5,
  });
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <opaque_fragment>",
      `{
        float facing = saturate(dot(normal, normalize(vViewPosition)));
        float edge = pow(1.0 - facing, 2.6);
        diffuseColor.a = clamp((0.035 + edge * 0.72 + dot(reflectedLight.directSpecular + reflectedLight.indirectSpecular, vec3(0.33)) * 0.55) * ${strength.toFixed(2)}, 0.0, 0.95);
        // Glass has almost no diffuse body of its own.
        outgoingLight = totalSpecular + vec3(0.92, 0.97, 1.0) * edge * 0.55 + totalEmissiveRadiance;
      }
      #include <opaque_fragment>`,
    );
  };
  material.customProgramCacheKey = () => `aa-glass-${side}-${strength}`;
  return material;
}

/** Lighting baked in Blender: unlit, and exempt from tone mapping so authored whites stay white. */
export function createBakedMaterial(map: THREE.Texture | null, options: { vertexColors?: boolean; side?: THREE.Side } = {}) {
  if (map) {
    map.colorSpace = THREE.SRGBColorSpace;
    map.flipY = false;
    map.anisotropy = 4;
  }
  return new THREE.MeshBasicMaterial({
    map,
    vertexColors: options.vertexColors ?? false,
    toneMapped: false,
    side: options.side ?? THREE.FrontSide,
  });
}

/** Soft radial decal for contact shadows and pools of light. */
export function radialTexture(stops: [number, string][], size = 256): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const context = canvas.getContext("2d");
  if (context) {
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (const [offset, color] of stops) gradient.addColorStop(offset, color);
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
