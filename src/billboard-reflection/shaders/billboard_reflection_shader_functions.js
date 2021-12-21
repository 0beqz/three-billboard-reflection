import { mip_map_level, srgb_to_rgb_approx, unrollLoops } from "./ShaderHelpers"

// varying variables
const billboardVarying = /* glsl */`
varying vec3 vPosition;
varying vec3 cameraDirection;
`

// uniforms required for the fragment shader
const billboardFragmentUniforms = /* glsl */`
uniform sampler2D billboardTextures[BILLBOARD_TEXTURE_COUNT];

struct BillboardReflection {
  mat4 matrixWorld;
  float rayFalloff;
  vec3 color;
  float opacity;
};

uniform BillboardReflection billboardReflections[BILLBOARD_COUNT];
`

// vertex shader code to assign values to the varying variables
const billboardVertexCode = /* glsl */`
vPosition = (modelMatrix * vec4(position, 1.)).xyz;
cameraDirection = vPosition - cameraPosition;
`

// billboard reflection algorithm source: https://kola.opus.hbz-nrw.de/opus45-kola/frontdoor/deliver/index/docId/908/file/BA_GuidoSchmidt.pdf

// intersect triangle function
const intersectTriangleFunction = /* glsl */`
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
`

// compute reflection for single billboard
const computeBillboardReflectionFunction = /* glsl */`
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

  // check if the reflecting billboard's distance is higher than the current lowest distance of an opaque billboard
  if(shortestOpaqueBillboardDistance <= uvt.z){
    // return no reflection
    return reflectClr;
  }

  // check if the reflected ray hit a billboard
  if(uvt.x > 0. && uvt.x < 1. &&    uvt.y > 0. && uvt.y < 1.){
    if(uvt.z <= 0.001){
      return reflectClr;
    }

    // get the reflected color
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

    // make the ray's intensity fall off by distance to prevent artifacts (e.g. reflection visible behind wall)
    if(rayFalloff != 0.){
      float rayToCameraDistance = distance(cameraPosition, wPos);

      reflectedBillboardClr.a *= min(1., 1. / (rayToCameraDistance * rayFalloff));
    }
    
    if(reflectedBillboardClr.a == 1.){
      shortestOpaqueBillboardDistance = uvt.z;
    }

    // final reflected color
    reflectClr = vec4(
      srgb_to_rgb_approx(reflectedBillboardClr.rgb) * color, 1.
    )
    * reflectedBillboardClr.a * (1. - roughnessValue * roughnessValue);
  }

  return reflectClr;
}
`

// compute reflections for all billboards
const computeAllBillboardReflectionsFunction = /* glsl */`
vec4 computeAllBillboardReflections(vec3 wPos, vec3 wReflectVec, float roughnessValue, float envMapIntensity){
      vec4 reflectClr = vec4(0.);
      
      roughnessValue = clamp(roughnessValue, 0., 1.);

      // inout parameter of the billboardReflection function to take care of overlapping opaque billboards
      float shortestOpaqueBillboardDistance = 3.402823466e+38; // FLT_MAX

      vec4 currentBillboardReflectClr;

      // go through each billboard
      #pragma unroll_loop_start
      for(int i = 0; i < BILLBOARD_COUNT; i++){

        // skip hidden billboards
        if(billboardReflections[i].opacity != 0.){
          currentBillboardReflectClr = computeBillboardReflection(
            wPos, wReflectVec, shortestOpaqueBillboardDistance, roughnessValue,
            billboardReflections[i].matrixWorld, billboardTextures[i], billboardReflections[i].color, billboardReflections[i].rayFalloff,
            billboardReflections[i].opacity
          );

          // blend the reflected colors, if the current billboard was opaque, then reflectClr is equal to currentBillboardReflectClr
          reflectClr = mix(reflectClr, currentBillboardReflectClr, currentBillboardReflectClr.a);
        }
        
      }
      #pragma unroll_loop_end

      return reflectClr * envMapIntensity;
    }
`

// modified lights_fragment_maps shader to add billboard reflections along with indirect environment irradiance
const billboard_lights_fragment_maps = /* glsl */`
#if defined( RE_IndirectDiffuse )
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel= texture2D( lightMap, vUv2 );
		vec3 lightMapIrradiance = lightMapTexelToLinear( lightMapTexel ).rgb * lightMapIntensity;
		#ifndef PHYSICALLY_CORRECT_LIGHTS
			lightMapIrradiance *= PI; // factor of PI should not be present; included here to prevent breakage
		#endif
		irradiance += lightMapIrradiance;
	#endif
	#if defined( USE_ENVMAP ) && defined( STANDARD ) && defined( ENVMAP_TYPE_CUBE_UV )
		iblIrradiance += getLightProbeIndirectIrradiance( /*lightProbe,*/ geometry, maxMipLevel );
	#endif
#endif
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
  vec3 indirectRadiance = getLightProbeIndirectRadiance( /*specularLightProbe,*/ geometry.viewDir, geometry.normal, material.specularRoughness, maxMipLevel );

  vec3 worldNormal = inverseTransformDirection( geometry.normal, viewMatrix );
  
  vec3 reflectVec = reflect(cameraDirection, worldNormal);
  vec4 billboardClr = computeAllBillboardReflections(vPosition, reflectVec, roughnessFactor, envMapIntensity);

  radiance = mix(indirectRadiance, billboardClr.rgb, billboardClr.a);

	#ifdef CLEARCOAT
		clearcoatRadiance += getLightProbeIndirectRadiance( /*specularLightProbe,*/ geometry.viewDir, geometry.clearcoatNormal, material.clearcoatRoughness, maxMipLevel );
	#endif
#else
  vec3 worldNormal = inverseTransformDirection( geometry.normal, viewMatrix );
  
  vec3 reflectVec = reflect(cameraDirection, worldNormal);
  vec4 billboardClr = computeAllBillboardReflections(vPosition, reflectVec, roughnessFactor, 1.);

  radiance = billboardClr.rgb;
#endif
`

// functions for creating shaders

const createBillboardFragmentUniforms = (billboardCount, billboardTextureCount) => {
  return billboardFragmentUniforms
    .replace(/BILLBOARD_COUNT/g, billboardCount)
    .replace(/BILLBOARD_TEXTURE_COUNT/g, billboardTextureCount)
}

// main billboard reflections function, needs to be created through a function as the count of the billboards needs to be known before the billboard loop will be unrolled
const createBillboardReflectionsFunctions = billboardCount => unrollLoops(
  computeBillboardReflectionFunction +
  computeAllBillboardReflectionsFunction.replace(/BILLBOARD_COUNT/g, billboardCount)
)

export { billboardVarying, billboardVertexCode, billboard_lights_fragment_maps, createBillboardFragmentUniforms, createBillboardReflectionsFunctions }