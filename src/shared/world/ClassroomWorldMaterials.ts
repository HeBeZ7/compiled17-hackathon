import * as THREE from "three";

/**
 * Static room materials carry their full lighting in the Cycles lightmap. This keeps
 * only the environment reflection from the runtime IBL and ignores real-time lights,
 * so the lights that shade the teacher never add on top of the bake.
 */
export function applyBakedLighting(material: THREE.MeshStandardMaterial): void {
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <lights_fragment_begin>",
        `#include <lights_fragment_begin>
irradiance = vec3(0.0);
reflectedLight.directDiffuse = vec3(0.0);`,
      )
      .replace(
        "#include <lights_fragment_maps>",
        `#include <lights_fragment_maps>
iblIrradiance = vec3(0.0);`,
      );
  };
  material.customProgramCacheKey = () => "aa-baked-room";
}

/** Fur reads as plush through sheen, the runtime stand-in for the Cycles sheen layer. */
export function furSheen(source: THREE.MeshStandardMaterial): THREE.MeshPhysicalMaterial {
  const physical = new THREE.MeshPhysicalMaterial();
  THREE.MeshStandardMaterial.prototype.copy.call(physical, source);
  physical.sheen = 0.9;
  physical.sheenRoughness = 0.65;
  physical.sheenColor = new THREE.Color("#efe4ff");
  physical.roughness = 0.92;
  physical.metalness = 0;
  physical.toneMapped = false;
  return physical;
}
