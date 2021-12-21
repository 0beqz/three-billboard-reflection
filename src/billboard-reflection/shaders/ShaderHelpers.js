// workaround to also unroll loops in onBeforeCompile

// from THREE.WebGLProgram
const unrollLoopPattern = /#pragma unroll_loop_start\s+for\s*\(\s*int\s+i\s*=\s*(\d+)\s*;\s*i\s*<\s*(\d+)\s*;\s*i\s*\+\+\s*\)\s*{([\s\S]+?)}\s+#pragma unroll_loop_end/g;

// from THREE.WebGLProgram
function loopReplacer(match, start, end, snippet) {

    let string = ''

    for (let i = parseInt(start); i < parseInt(end); i++) {

        string += snippet
            .replace(/\[\s*i\s*\]/g, '[ ' + i + ' ]')
            .replace(/UNROLLED_LOOP_INDEX/g, i)

    }

    return string

}

export function unrollLoops(string) {

    return string
        .replace(unrollLoopPattern, loopReplacer)

}

export const mip_map_level = /* glsl */`
// source: https://stackoverflow.com/a/24390149/7626841
float mip_map_level(in vec2 texture_coordinate){
  vec2  dx_vtc = dFdx(texture_coordinate);
  vec2  dy_vtc = dFdy(texture_coordinate);
  
  float delta_max_sqr = max(dot(dx_vtc, dx_vtc), dot(dy_vtc, dy_vtc));

  return 0.5 * log2(delta_max_sqr);
}`

// source: https://github.com/tobspr/GLSL-Color-Spaces/blob/master/ColorSpaces.inc.glsl#L81
// Converts a srgb color to a rgb color (approximated, but fast)
export const srgb_to_rgb_approx = /* glsl */`
const float SRGB_INVERSE_GAMMA = 2.2;

vec3 srgb_to_rgb_approx(vec3 srgb) {
    return pow(srgb, vec3(SRGB_INVERSE_GAMMA));
}`