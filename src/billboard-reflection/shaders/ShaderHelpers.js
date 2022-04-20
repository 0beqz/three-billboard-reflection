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