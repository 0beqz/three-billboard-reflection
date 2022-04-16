import React, { useRef, Suspense, useEffect } from 'react'
import { Canvas, useFrame, useLoader, useThree, extend } from '@react-three/fiber'
import { EffectComposer, Bloom, SMAA } from '@react-three/postprocessing'
import { EdgeDetectionMode } from 'postprocessing'
import { Environment, Stats } from "@react-three/drei"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader"
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader'
import { folder, useControls } from "leva"
import { DoubleSide, LinearFilter, MeshBasicMaterial, Vector2, PMREMGenerator } from "three"
import BillboardReflection from "../billboard-reflection/BillboardReflection"

extend({ OrbitControls })

function Controls() {
  const controls = useRef()
  const { camera, gl, scene } = useThree()
  camera.position.y = 3
  scene.background = scene.environment

  useFrame(() => {
    controls.current.update()
  })

  return <orbitControls ref={controls} args={[camera, gl.domElement]} enablePan={false} enableDamping dampingFactor={0.1} rotateSpeed={0.25} />
}

function Part() {
  const { nodes } = useLoader(GLTFLoader, "/billboard_low.glb")

  const billboard = useRef()
  const billboard2 = useRef()
  const ground = useRef()

  const billboardReflection = new BillboardReflection()
  billboardReflection.roughnessBlur = true

  useFrame(() => {
    const speed = 1300

    billboard.current.rotation.x = -Math.PI / 2 + Math.sin(Date.now() / speed) * 0.5
    billboard.current.rotation.z = Math.PI

    billboard.current.position.x = Math.cos(Date.now() / speed)
    billboard.current.position.y = Math.abs(Math.sin(Date.now() / speed)) * 0.5 + 1.95
    billboard.current.position.z = Math.cos(Date.now() / speed) - 2

    // second billboard
    billboard2.current.rotation.y += 0.003
    billboard2.current.rotation.y %= 2 * Math.PI
    billboard2.current.position.set(2.25, 1.7, 2.5)
  })

  const { scene, gl } = useThree()

  let renderTarget
  const pmremGenerator = new PMREMGenerator(gl)
  pmremGenerator.compileEquirectangularShader()

  // setup controls
  const [{ roughness, metalness, envMapIntensity, normalScale, color }, set] = useControls(() => {
    return {
    ground: folder({
      roughness: {
        value: nodes.ground.material.roughnessMap ? 3 : 0.1,
        min: 0,
        max: nodes.ground.material.roughnessMap ? 6 : 1,
        step: 0.1
      },
      metalness: {
        value: 1,
        min: 0,
        max: 1,
        step: 0.1
      },
      envMapIntensity: {
        value: 1,
        min: 0,
        max: 1,
        step: 0.1
      },
      normalScale: {
        value: 0.1,
        min: 0,
        max: 1,
        step: 0.05
      },
      color: "#eee",
      roughnessMap: {
        value: true,
        onChange(value){
          if(!nodes.ground.material._roughnessMap){
            nodes.ground.material._roughnessMap = nodes.ground.material.roughnessMap
          }

          nodes.ground.material.roughnessMap = value ? nodes.ground.material._roughnessMap : null
          nodes.ground.material.needsUpdate = true

          set({ roughness: nodes.ground.material.roughnessMap ? 3 : 0.1 })
        }
      },
      "sky envMap": {
        value: false,
        onChange(value) {
          if (!scene.background) return

          const imageName = value ? "blue_sky" : "garden"

          new RGBELoader().load("/" + imageName + ".hdr", tex => {
            if (renderTarget) renderTarget.dispose()

            renderTarget = pmremGenerator.fromEquirectangular(tex)

            const envMap = renderTarget.texture
            envMap.minFilter = LinearFilter

            scene.background = envMap
            scene.environment = envMap

            tex.dispose()
          })
        }
      }
    }),
    colorPatternBillboard: folder({
      visible: {
        value: true,
        onChange(value) {
          if (billboard.current) billboard.current.visible = value
        }
      },
      opacity: {
        value: 1,
        min: 0,
        max: 1,
        step: 0.1,
        onChange(value) {
          if (billboard.current) billboard.current.material.opacity = value
        }
      },
      reflection: {
        value: true,
        onChange(value) {
          if (billboard.current._reflection) billboard.current._reflection.visible = value
        }
      },
      color2: {
        label: "color",
        value: "#ffffff",
        onChange(value) {
          if (billboard.current) billboard.current.material.color.setStyle(value)
        },
      },
      rayFalloff: {
        value: 0,
        min: 0,
        max: 0.4,
        step: 0.01,
        onChange(value) {
          if (billboard.current._reflection) billboard.current._reflection.rayFalloff = value
        }
      }
    }),
    threejsBillboard: folder({
      visible2: {
        label: "visible",
        value: true,
        onChange(value) {
          if (billboard2.current) billboard2.current.visible = value
        }
      },
      opacity2: {
        label: "opacity",
        value: 1,
        min: 0,
        max: 1,
        step: 0.1,
        onChange(value) {
          if (billboard2.current) billboard2.current.material.opacity = value
        }
      },
      reflection2: {
        label: "reflection",
        value: true,
        onChange(value) {
          if (billboard2.current._reflection) billboard2.current._reflection.visible = value
        }
      },
      reflectionColorMultiplier2: {
        label: "reflectionColorMultiplier",
        value: 1.25,
        min: 0,
        max: 3,
        step: 0.125,
        onChange(value) {
          if (billboard2.current._reflection) billboard2.current._reflection.reflectionColorMultiplier = value
        },
      },
      rayFalloff2: {
        label: "rayFalloff",
        value: 0,
        min: 0,
        max: 0.4,
        step: 0.01,
        onChange(value) {
          if (billboard2.current._reflection) billboard2.current._reflection.rayFalloff = value
        }
      }
    }, { collapsed: true }),
  }
})

  useEffect(() => {
    billboard.current._reflection = billboardReflection.create(billboard.current, { reflectionColorMultiplier: 1.25 })
    billboard2.current._reflection = billboardReflection.create(billboard2.current, { reflectionColorMultiplier: 1.25 })

    ground.current.material.onBeforeCompile = shader => billboardReflection.enableReflection(shader)

    const billboardMaterial = new MeshBasicMaterial({
      map: nodes.billboard.material.map,
      side: DoubleSide,
      transparent: true,
      depthWrite: false
    })
  
    const billboard2Material = new MeshBasicMaterial({
      map: nodes.billboard2.material.map,
      side: DoubleSide,
      transparent: true,
      depthWrite: false
    })

    nodes.billboard.material = billboardMaterial
    nodes.billboard2.material = billboard2Material
  }, [])

  nodes.ground.material.roughness = roughness
  nodes.ground.material.metalness = metalness
  nodes.ground.material.envMapIntensity = envMapIntensity
  nodes.ground.material.normalScale = new Vector2(normalScale, normalScale)
  nodes.ground.material.color.setStyle(color)

  return (
    <object3D rotation={[0, Math.PI / 2, 0]}>
      <mesh ref={billboard} {...nodes.billboard} scale={[2, 2, 2]} dispose={null} />
      <mesh ref={billboard2} {...nodes.billboard2} dispose={null} />
      <mesh ref={ground} {...nodes.ground} dispose={null} />
    </object3D>
  )
}

export default function App() {
  return (
    <>
      <Canvas>
        <Stats />
        <pointLight position={[20, 20, 20]} intensity={0.5} />
        <Suspense fallback={null}>
          <Part />
          <Controls />
          <Environment files={"garden.hdr"} path={"/"} />
          <EffectComposer multisampling={0}>
            <Bloom intensity={0.3} luminanceThreshold={0.475} width={1024}></Bloom>
            <SMAA edgeDetectionMode={EdgeDetectionMode.DEPTH} />
          </EffectComposer>
        </Suspense>
      </Canvas>
    </>
  )
}
