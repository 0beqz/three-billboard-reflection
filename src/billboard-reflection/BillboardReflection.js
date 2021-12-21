import * as THREE from "three"
import { billboardVarying, createBillboardFragmentUniforms, billboardVertexCode, createBillboardReflectionsFunctions, billboard_lights_fragment_maps }
    from "./shaders/billboard_reflection_shader_functions"

export default class BillboardReflection {
    #billboards = []

    /**
     * Adds a new reflection for the given mesh
     * @param {*} mesh mesh that will be reflected
     * @param {*} [options] settings to tweak the reflection
     * @returns reflection options object
     */
    create(mesh, options = {}) {
        let billboard = this.createFromTextureAndMatrix(mesh.material.map, mesh.matrixWorld, options)

        // if no opacity was specified, always use the underlying mesh's opacity (0 in case the mesh or its material is not visible)
        if (typeof options.opacity === "undefined") {
            Object.defineProperty(billboard, "opacity", {
                get() {
                    return (mesh.visible && mesh.material.visible && billboard.visible) ? mesh.material.opacity : 0
                }
            })
        } else {
            let opacity = billboard.opacity

            Object.defineProperty(billboard, "opacity", {
                set(value) {
                    opacity = value
                },
                get() {
                    return billboard.visible ? opacity : 0
                }
            })
        }

        if (typeof options.color === "undefined") {
            Object.defineProperty(billboard, "color", {
                get() {
                    return mesh.material.color
                }
            })
        }

        return billboard
    }

    /**
     * 
     * @param {*} texture texture of the reflection
     * @param {*} matrixWorld matrixWorld of the billboard
     * @param {*} [options] settings to tweak the reflection
     * @returns reflection options object
     */
    createFromTextureAndMatrix(texture, matrixWorld, { rayFalloff = 0, color = new THREE.Color(), opacity = 1, visible = true } = {}) {
        const billboard = {
            texture,
            matrixWorld,
            rayFalloff,
            color,
            opacity,
            visible
        }

        this.#billboards.push(billboard)

        return billboard
    }

    /**
     * Enables billboard reflections for a given shader
     * @param {*} shader shader of the given material, usually acquired through THREE.Material.onBeforeCompile
     * @param {*} [options] settings to tweak the reflection
     * which results in better results for more contrasty roughness maps
     */
    enableReflection(shader, { roughnessMapBlur = true, roughnessMapBlurIntensity = 0.85, roughness = undefined, envMapIntensity = undefined } = {}) {
        const billboardCount = this.#billboards.length

        if (billboardCount === 0) return

        const allBillboardTextures = this.#billboards.map(billboard => billboard.texture)
        const billboardTextures = Array.from(new Set(allBillboardTextures))
        const billboardTextureCount = billboardTextures.length
        const billboardTexturesIndices = this.#billboards.map(billboard => billboardTextures.indexOf(billboard.texture))

        let billboardReflectionsFunctions = createBillboardReflectionsFunctions(billboardCount)

        // textures are stored in a seperate array that can have a smaller size than the billboard count
        // due to multiple billboards using the same texture for example
        // replace the incrementing texture indices in the shader with their actual index in the billboardTextures array uniform
        for (let i = 0; i < billboardCount; i++) {
            billboardReflectionsFunctions = billboardReflectionsFunctions
                .replace(new RegExp("billboardTextures\\[\\s" + i + "\\s\\]", "g"), "billboardTextures[ " + billboardTexturesIndices[i] + " ]")
        }

        // defines
        // enable reflection blur only if not toggled off and when the shader has a roughness map
        shader.defines.REFLECTION_ROUGHNESS_BLUR = roughnessMapBlur && shader.roughnessMap
        shader.defines.REFLECTION_ROUGHNESS_MAP_BLUR_INTENSITY = roughnessMapBlurIntensity.toFixed(5)

        // uniforms
        shader.uniforms.billboardTextures = { value: billboardTextures }
        shader.uniforms.billboardReflections = { value: Array.from(this.#billboards) }

        // vertex shader
        shader.vertexShader = shader.vertexShader
            .replace(
                "#include <common>",
                "#include <common>\n" + billboardVarying
            )
            .replace(
                "#include <project_vertex>",
                "#include <project_vertex>\n" + billboardVertexCode
            )

        // fragment shader
        let lights_fragment_maps = typeof roughness === "number" ?
            billboard_lights_fragment_maps.replace(/roughnessFactor/g, roughness.toFixed(5))
            :
            billboard_lights_fragment_maps

        if (typeof envMapIntensity === "number") {
            lights_fragment_maps = lights_fragment_maps.replace(/envMapIntensity/g, envMapIntensity.toFixed(5))
        }

        shader.fragmentShader = shader.fragmentShader
            .replace(
                "#include <common>",
                "#include <common>\n" + billboardVarying + "\n" + createBillboardFragmentUniforms(billboardCount, billboardTextureCount)
            )
            .replace(
                "#include <bsdfs>",
                "#include <bsdfs>\n" + billboardReflectionsFunctions
            )
            .replace(
                "#include <lights_fragment_maps>",
                lights_fragment_maps
            )
    }
}