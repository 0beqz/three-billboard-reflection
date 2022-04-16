(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory(require('three')) :
  typeof define === 'function' && define.amd ? define(['three'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, global.BillboardReflection = factory(global.THREE));
})(this, (function (THREE) { 'use strict';

  function _interopNamespace(e) {
    if (e && e.__esModule) return e;
    var n = Object.create(null);
    if (e) {
      Object.keys(e).forEach(function (k) {
        if (k !== 'default') {
          var d = Object.getOwnPropertyDescriptor(e, k);
          Object.defineProperty(n, k, d.get ? d : {
            enumerable: true,
            get: function () { return e[k]; }
          });
        }
      });
    }
    n["default"] = e;
    return Object.freeze(n);
  }

  var THREE__namespace = /*#__PURE__*/_interopNamespace(THREE);

  function _classPrivateFieldGet(receiver, privateMap) {
    var descriptor = _classExtractFieldDescriptor(receiver, privateMap, "get");

    return _classApplyDescriptorGet(receiver, descriptor);
  }

  function _classExtractFieldDescriptor(receiver, privateMap, action) {
    if (!privateMap.has(receiver)) {
      throw new TypeError("attempted to " + action + " private field on non-instance");
    }

    return privateMap.get(receiver);
  }

  function _classApplyDescriptorGet(receiver, descriptor) {
    if (descriptor.get) {
      return descriptor.get.call(receiver);
    }

    return descriptor.value;
  }

  function _checkPrivateRedeclaration(obj, privateCollection) {
    if (privateCollection.has(obj)) {
      throw new TypeError("Cannot initialize the same private elements twice on an object");
    }
  }

  function _classPrivateFieldInitSpec(obj, privateMap, value) {
    _checkPrivateRedeclaration(obj, privateMap);

    privateMap.set(obj, value);
  }

  const unrollLoopPattern = /#pragma unroll_loop_start\s+for\s*\(\s*int\s+i\s*=\s*(\d+)\s*;\s*i\s*<\s*(\d+)\s*;\s*i\s*\+\+\s*\)\s*{([\s\S]+?)}\s+#pragma unroll_loop_end/g;

  function loopReplacer(match, start, end, snippet) {
    let string = '';

    for (let i = parseInt(start); i < parseInt(end); i++) {
      string += snippet.replace(/\[\s*i\s*\]/g, '[ ' + i + ' ]').replace(/UNROLLED_LOOP_INDEX/g, i);
    }

    return string;
  }

  function unrollLoops(string) {
    return string.replace(unrollLoopPattern, loopReplacer);
  }
  const mip_map_level = `
float mip_map_level(in vec2 texture_coordinate){
  vec2  dx_vtc = dFdx(texture_coordinate);
  vec2  dy_vtc = dFdy(texture_coordinate);
  
  float delta_max_sqr = max(dot(dx_vtc, dx_vtc), dot(dy_vtc, dy_vtc));
  return 0.5 * log2(delta_max_sqr);
}`;
  const srgb_to_rgb_approx = `
const float SRGB_INVERSE_GAMMA = 2.2;
vec3 srgb_to_rgb_approx(vec3 srgb) {
    return pow(srgb, vec3(SRGB_INVERSE_GAMMA));
}`;

  const billboardVarying = `varying vec3 vPosition;
varying vec3 cameraDirection;
`;
  const billboardFragmentUniforms = `
uniform sampler2D billboardTextures[BILLBOARD_TEXTURE_COUNT];
struct BillboardReflection {
  mat4 matrixWorld;
  float rayFalloff;
  vec3 color;
  float opacity;
};
uniform BillboardReflection billboardReflections[BILLBOARD_COUNT];
`;
  const billboardVertexCode = `
vPosition = (modelMatrix * vec4(position, 1.)).xyz;
cameraDirection = vPosition - cameraPosition;
`;
  const intersectTriangleFunction = `
vec3 intersectTriangle(vec3 rayOrig, vec3 rayDir, vec3 vector0, vec3 vector1, vec3 vector2){
      float u, v, t;
      vec3 e0, e1;
      float det, invDet;
      e0 = vector1 - vector0;
      e1 = vector2 - vector0;
      vec3 pVec = cross(rayDir, e1);
      det = dot(e0, pVec);
      invDet = 1. / det;
      vec3 tVec = rayOrig - vector0;
      u = dot(tVec, pVec) * invDet;
      vec3 qVec = cross(tVec, e0);
      v = dot(rayDir, qVec) * invDet;
      t = dot(e1, qVec) * invDet;
      return vec3(u, v, t);
    }
`;
  const computeBillboardReflectionFunction = `
${mip_map_level}
${srgb_to_rgb_approx}
${intersectTriangleFunction}
vec4 computeBillboardReflection(vec3 wPos, vec3 wReflectVec, inout float shortestOpaqueBillboardDistance, float roughnessValue,
  mat4 matrixWorld, sampler2D tBillboard, vec3 color, float rayFalloff, float opacity){
  
  vec4 reflectClr = vec4(0);
  
  vec3 vector0 = vec3( 1.,  0.,  1.);
  vec3 vector1 = vec3(-1.,  0., -1.);
  vec3 vector2 = vec3(-1.,  0.,  1.);
  vector0 = (matrixWorld * vec4(vector0, 1.)).xyz;
  vector1 = (matrixWorld * vec4(vector1, 1.)).xyz;
  vector2 = (matrixWorld * vec4(vector2, 1.)).xyz;
  vec3 uvt = intersectTriangle(wPos, wReflectVec, vector2, vector0, vector1);
  if(shortestOpaqueBillboardDistance <= uvt.z){
    return reflectClr;
  }
  if(uvt.x > 0. && uvt.x < 1.   &&    uvt.y > 0. && uvt.y < 1.){
    if(uvt.z <= 0.001){
      return reflectClr;
    }
    #ifdef REFLECTION_ROUGHNESS_BLUR
      ivec2 texSize = textureSize(tBillboard, 0);
      float mip = mip_map_level(uvt.xy * float(texSize));
      float pixels = float(max(texSize.x, texSize.y));
      pixels *= pixels;
      float scale = log2(pixels) * REFLECTION_ROUGHNESS_MAP_BLUR_INTENSITY;
      vec4 reflectedBillboardClr = textureLod(tBillboard, uvt.xy, max(mip, roughnessValue * scale));
    #else
      vec4 reflectedBillboardClr = texture(tBillboard, uvt.xy);
    #endif
    
    if(opacity != 1.){
      reflectedBillboardClr.a *= sqrt(opacity);
    }
    if(rayFalloff != 0.){
      float rayToCameraDistance = distance(cameraPosition, wPos);
      reflectedBillboardClr.a *= min(1., 1. / (rayToCameraDistance * rayFalloff));
    }
    
    if(reflectedBillboardClr.a == 1.){
      shortestOpaqueBillboardDistance = uvt.z;
    }
    reflectClr = vec4(reflectedBillboardClr.rgb * color, 1.) * reflectedBillboardClr.a * (1. - roughnessValue * roughnessValue);
  }
  return reflectClr;
}
`;
  const computeAllBillboardReflectionsFunction = `
vec4 computeAllBillboardReflections(vec3 wPos, vec3 wReflectVec, float roughnessValue, float envMapIntensity){
      vec4 reflectClr = vec4(0.);
      
      roughnessValue = clamp(roughnessValue, 0., 1.);
      float shortestOpaqueBillboardDistance = 3.402823466e+38;
      vec4 currentBillboardReflectClr;
      #pragma unroll_loop_start
      for(int i = 0; i < BILLBOARD_COUNT; i++){
        if(billboardReflections[i].opacity != 0.){
          currentBillboardReflectClr = computeBillboardReflection(
            wPos, wReflectVec, shortestOpaqueBillboardDistance, roughnessValue,
            billboardReflections[i].matrixWorld, billboardTextures[i], billboardReflections[i].color, billboardReflections[i].rayFalloff,
            billboardReflections[i].opacity
          );
          reflectClr = mix(reflectClr, currentBillboardReflectClr, currentBillboardReflectClr.a);
        }
        
      }
      #pragma unroll_loop_end
      return reflectClr * envMapIntensity;
    }
`;
  const billboard_lights_fragment_maps = `
#include <lights_fragment_maps>
vec3 billboardWorldNormal = inverseTransformDirection( geometry.normal, viewMatrix );
vec3 billboardReflectVec = reflect(cameraDirection, billboardWorldNormal);
vec4 billboardClr = computeAllBillboardReflections(vPosition, billboardReflectVec, material.roughness, 1.);
#ifdef USE_ENVMAP
  billboardClr.rgb *= envMapIntensity;
#endif
radiance = mix(radiance, billboardClr.rgb, billboardClr.a);`;

  const createBillboardFragmentUniforms = (billboardCount, billboardTextureCount) => {
    return billboardFragmentUniforms.replace(/BILLBOARD_COUNT/g, billboardCount).replace(/BILLBOARD_TEXTURE_COUNT/g, billboardTextureCount);
  };

  const createBillboardReflectionsFunctions = billboardCount => unrollLoops(computeBillboardReflectionFunction + computeAllBillboardReflectionsFunction.replace(/BILLBOARD_COUNT/g, billboardCount));

  var _billboards = /*#__PURE__*/new WeakMap();

  class BillboardReflection {
    constructor() {
      _classPrivateFieldInitSpec(this, _billboards, {
        writable: true,
        value: []
      });
    }

    create(mesh, options = {}) {
      let billboard = this.createFromTextureAndMatrix(mesh.material.map, mesh.matrixWorld, options);

      if (typeof options.opacity === "undefined") {
        Object.defineProperty(billboard, "opacity", {
          get() {
            return mesh.visible && mesh.material.visible && billboard.visible ? mesh.material.opacity : 0;
          }

        });
      } else {
        let opacity = billboard.opacity;
        Object.defineProperty(billboard, "opacity", {
          set(value) {
            opacity = value;
          },

          get() {
            return billboard.visible ? opacity : 0;
          }

        });
      }

      if (typeof options.color === "undefined") {
        Object.defineProperty(billboard, "color", {
          get() {
            return mesh.material.color;
          }

        });
      }

      return billboard;
    }

    createFromTextureAndMatrix(texture, matrixWorld, {
      rayFalloff = 0,
      color = new THREE__namespace.Color(),
      opacity = 1,
      visible = true
    } = {}) {
      const billboard = {
        texture,
        matrixWorld,
        rayFalloff,
        color,
        opacity,
        visible
      };

      _classPrivateFieldGet(this, _billboards).push(billboard);

      return billboard;
    }

    enableReflection(shader, {
      roughnessMapBlur = true,
      roughnessMapBlurIntensity = 0.85,
      roughness = undefined,
      envMapIntensity = undefined
    } = {}) {
      const billboardCount = _classPrivateFieldGet(this, _billboards).length;

      if (billboardCount === 0) return;

      const allBillboardTextures = _classPrivateFieldGet(this, _billboards).map(billboard => billboard.texture);

      const billboardTextures = Array.from(new Set(allBillboardTextures));
      const billboardTextureCount = billboardTextures.length;

      const billboardTexturesIndices = _classPrivateFieldGet(this, _billboards).map(billboard => billboardTextures.indexOf(billboard.texture));

      let billboardReflectionsFunctions = createBillboardReflectionsFunctions(billboardCount);

      for (let i = 0; i < billboardCount; i++) {
        billboardReflectionsFunctions = billboardReflectionsFunctions.replace(new RegExp("billboardTextures\\[\\s" + i + "\\s\\]", "g"), "billboardTextures[ " + billboardTexturesIndices[i] + " ]");
      }

      shader.defines = shader.defines || {};
      shader.defines.REFLECTION_ROUGHNESS_BLUR = roughnessMapBlur && shader.roughnessMap;
      shader.defines.REFLECTION_ROUGHNESS_MAP_BLUR_INTENSITY = roughnessMapBlurIntensity.toFixed(5);
      shader.uniforms.billboardTextures = {
        value: billboardTextures
      };
      shader.uniforms.billboardReflections = {
        value: Array.from(_classPrivateFieldGet(this, _billboards))
      };
      shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\n" + billboardVarying).replace("#include <project_vertex>", "#include <project_vertex>\n" + billboardVertexCode);
      let lights_fragment_maps = typeof roughness === "number" ? billboard_lights_fragment_maps.replace(/roughnessFactor/g, roughness.toFixed(5)) : billboard_lights_fragment_maps;

      if (typeof envMapIntensity === "number") {
        lights_fragment_maps = lights_fragment_maps.replace(/envMapIntensity/g, envMapIntensity.toFixed(5));
      }

      shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\n" + billboardVarying + "\n" + createBillboardFragmentUniforms(billboardCount, billboardTextureCount)).replace("#include <bsdfs>", "#include <bsdfs>\n" + billboardReflectionsFunctions).replace("#include <lights_fragment_maps>", lights_fragment_maps);
    }

  }

  return BillboardReflection;

}));
