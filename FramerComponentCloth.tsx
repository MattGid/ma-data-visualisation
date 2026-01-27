
import * as THREE from "three"
import React, { useRef, useEffect } from "react"
import { addPropertyControls, ControlType } from "framer"

/**
 * FRAMER CLOTH COMPONENT (VANILLA THREE.JS VERSION)
 * 
 * Reverted to the robust manual render loop to ensure:
 * 1. Exact physics replication of the original "AI" behavior.
 * 2. Reliable rendering in Published mode (no R3F abstraction layer).
 * 3. Proper bundling without script-tag hacks.
 */

// --- PHYSICS CONSTANTS ---
const REST_DISTANCE = 25
const SQRT2 = Math.SQRT2
const DAMPING = 0.97
const MASS = 0.1
const TIMESTEP_SQ = (18 / 1000) ** 2
const ITERATIONS = 3
const DEG2RAD = Math.PI / 180

export default function FramerComponentCloth(props: any) {
    const containerRef = useRef<HTMLDivElement>(null)
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null)

    // Store latest props in a ref to access them inside the animation loop
    // without triggering re-initialization of the scene.
    const propsRef = useRef(props)

    // Update props ref whenever props change
    useEffect(() => {
        // Flatten nested props for internal logic
        const p = { ...props }
        
        // Merge structured groups into the flat `p` object for the simulation
        if (props.appearance) Object.assign(p, props.appearance)
        if (props.physics) Object.assign(p, props.physics)
        if (props.camera) Object.assign(p, props.camera)
        if (props.transform) Object.assign(p, props.transform)

        propsRef.current = p
    }, [props])

    useEffect(() => {
        if (!containerRef.current) return

        // --- 1. SETUP ---
        const container = containerRef.current
        const width = container.clientWidth || 800
        const height = container.clientHeight || 600

        // Scene
        const scene = new THREE.Scene()

        // Camera Group (Rig)
        const cameraRig = new THREE.Group()
        scene.add(cameraRig)

        const camera = new THREE.PerspectiveCamera(45, width / height, 1, 10000)
        camera.position.set(0, -100, 600)
        cameraRig.add(camera)

        // Renderer
        const renderer = new THREE.WebGLRenderer({
            alpha: true,
            antialias: true,
            powerPreference: "high-performance"
        })
        renderer.setPixelRatio(window.devicePixelRatio > 2 ? 2 : window.devicePixelRatio)
        renderer.setSize(width, height)
        renderer.domElement.style.display = "block"
        renderer.domElement.style.width = "100%"
        renderer.domElement.style.height = "100%"

        // Clear container and append
        container.innerHTML = ""
        container.appendChild(renderer.domElement)
        rendererRef.current = renderer

        // Lights
        const ambient = new THREE.AmbientLight(0x666666)
        scene.add(ambient)

        const dirLight = new THREE.DirectionalLight(0xffffff, 1.2)
        dirLight.position.set(200, 500, 200)
        scene.add(dirLight)

        // Mouse Raycasting
        const raycaster = new THREE.Raycaster()
        const mouse = new THREE.Vector2(999, 999) // Start off-screen
        const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
        const hit = new THREE.Vector3()

        // --- 2. INITIALIZE MESH ---
        // We recreate the mesh data only once here for simplicity/performance in this robust version.
        // Dynamic re-meshing on prop change is handled by unmount/remount of this effect.

        const p = propsRef.current
        const resolution = p.resolution || 20
        const meshSize = p.meshSize || 500
        const xSegs = resolution
        const ySegs = resolution
        const restDist = meshSize / xSegs
        const clothW = meshSize
        const clothH = meshSize
        const idx = (u: number, v: number) => u + v * (xSegs + 1)

        // Particles
        const particles: any[] = []
        for (let v = 0; v <= ySegs; v++) {
            for (let u = 0; u <= xSegs; u++) {
                const x = (u / xSegs) * clothW - clothW / 2
                const y = (v / ySegs) * clothH - clothH / 2
                particles.push({
                    x, y, z: 0, px: x, py: y, pz: 0, ox: x, oy: y, oz: 0,
                    fx: 0, fy: 0, fz: 0, pinned: v === ySegs
                })
            }
        }

        // Constraints
        const constraints: any[] = []
        for (let v = 0; v <= ySegs; v++) {
            for (let u = 0; u <= xSegs; u++) {
                if (u < xSegs) constraints.push([idx(u, v), idx(u + 1, v), restDist])
                if (v < ySegs) constraints.push([idx(u, v), idx(u, v + 1), restDist])
                if (u < xSegs && v < ySegs) {
                    constraints.push([idx(u, v), idx(u + 1, v + 1), restDist * SQRT2])
                    constraints.push([idx(u + 1, v), idx(u, v + 1), restDist * SQRT2])
                }
            }
        }

        // Visual Object (Switch based on initial props)
        let visualObject: any
        let visualLinks: any[] = []
        const dummy = new THREE.Object3D()

        if (p.shadingMode === "points") {
            const geo = new THREE.BufferGeometry()
            const pos = new Float32Array(particles.length * 3)
            geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
            visualObject = new THREE.Points(geo, new THREE.PointsMaterial({ color: p.color, size: p.pointSize }))
        } else {
            // Lines / Sticks
            const ls = p.lineStyle || "grid"
            for (let v = 0; v <= ySegs; v++) {
                for (let u = 0; u <= xSegs; u++) {
                    const h = (ls === 'grid' || ls === 'horizontal') && u < xSegs
                    const v_ = (ls === 'grid' || ls === 'vertical') && v < ySegs
                    const d1 = (ls === 'cross' || ls === 'diagonal1') && u < xSegs && v < ySegs
                    const d2 = (ls === 'cross' || ls === 'diagonal2') && u < xSegs && v < ySegs
                    if (h) visualLinks.push([idx(u, v), idx(u + 1, v)])
                    if (v_) visualLinks.push([idx(u, v), idx(u, v + 1)])
                    if (d1) visualLinks.push([idx(u, v), idx(u + 1, v + 1)])
                    if (d2) visualLinks.push([idx(u, v + 1), idx(u + 1, v)])
                }
            }
            const geo = new THREE.CylinderGeometry(0.5, 0.5, 1, 5)
            geo.rotateX(Math.PI / 2)
            const mat = new THREE.MeshStandardMaterial({ color: p.color, roughness: 0.4, metalness: 0.1 })
            visualObject = new THREE.InstancedMesh(geo, mat, visualLinks.length)
            visualObject.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
        }
        scene.add(visualObject)


        // --- 3. EVENT LISTENERS ---
        const onMove = (e: MouseEvent) => {
            const rect = renderer.domElement.getBoundingClientRect()
            mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
            mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
        }

        // Use ResizeObserver for robust sizing in Framer
        const resizeObserver = new ResizeObserver((entries) => {
            for (let entry of entries) {
                const { width, height } = entry.contentRect
                if (width === 0 || height === 0) return
                camera.aspect = width / height
                camera.updateProjectionMatrix()
                renderer.setSize(width, height)
            }
        })
        resizeObserver.observe(container)
        container.addEventListener("mousemove", onMove)

        // --- 4. ANIMATION LOOP ---
        let frameId = 0
        let rotAcc = { x: 0, y: 0, z: 0 }

        const animate = () => {
            const currentProps = propsRef.current

            // A. Camera View
            rotAcc.x += (currentProps.rotationSpeedX || 0) * 0.02
            rotAcc.y += (currentProps.rotationSpeedY || 0) * 0.02
            rotAcc.z += (currentProps.rotationSpeedZ || 0) * 0.02

            cameraRig.rotation.set(
                (currentProps.rotateX || 0) * DEG2RAD + rotAcc.x,
                (currentProps.rotateY || 0) * DEG2RAD + rotAcc.y,
                (currentProps.rotateZ || 0) * DEG2RAD + rotAcc.z
            )

            const cv = currentProps.view
            const dist = 600
            if (cv === 'front') camera.position.set(0, 0, dist)
            else if (cv === 'side') camera.position.set(dist, 0, 0)
            else if (cv === 'top') camera.position.set(0, dist, 10)
            else if (cv === 'isometric') camera.position.set(dist * 0.7, dist * 0.5, dist * 0.7)
            else camera.position.set(0, -100, 600)
            camera.lookAt(0, 0, 0)

            // B. Physics
            const time = performance.now() * 0.0005 * (currentProps.speed === undefined ? 1 : currentProps.speed)
            const grav = -(currentProps.gravity === undefined ? 980 : currentProps.gravity) * MASS
            const wind = (currentProps.windStrength === undefined ? 0.5 : currentProps.windStrength) * 150

            raycaster.setFromCamera(mouse, camera)
            raycaster.ray.intersectPlane(plane, hit)

            // Forces
            particles.forEach(pt => {
                if (pt.pinned) return

                let fx = Math.sin(time + pt.y * 0.02) * Math.sin(time * 0.5 + pt.x * 0.02) * wind
                let fy = grav
                let fz = Math.cos(time + pt.y * 0.02) * wind * 0.67

                // Interaction
                const dx = pt.x - hit.x
                const dy = pt.y - hit.y
                const dz = pt.z - hit.z
                const d2 = dx * dx + dy * dy + dz * dz
                if (d2 < 14400) {
                    const d = Math.sqrt(d2)
                    const f = (120 - d) * 50 / (d || 1)
                    fx += dx * f; fy += dy * f; fz += dz * f
                }

                // Integrate
                const vx = (pt.x - pt.px) * DAMPING
                const vy = (pt.y - pt.py) * DAMPING
                const vz = (pt.z - pt.pz) * DAMPING

                pt.px = pt.x; pt.py = pt.y; pt.pz = pt.z
                pt.x += vx + fx * TIMESTEP_SQ
                pt.y += vy + fy * TIMESTEP_SQ
                pt.z += vz + fz * TIMESTEP_SQ
            })

            // Constraints
            for (let k = 0; k < ITERATIONS; k++) {
                for (let c of constraints) {
                    const [i1, i2, r] = c
                    const p1 = particles[i1]
                    const p2 = particles[i2]
                    const dx = p2.x - p1.x, dy = p2.y - p1.y, dz = p2.z - p1.z
                    const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
                    if (d === 0) continue
                    const diff = (d - r) / d * 0.5
                    const ox = dx * diff, oy = dy * diff, oz = dz * diff
                    if (!p1.pinned) { p1.x += ox; p1.y += oy; p1.z += oz }
                    if (!p2.pinned) { p2.x -= ox; p2.y -= oy; p2.z -= oz }
                }
            }

            // C. Visuals Update
            visualObject.position.set(currentProps.offsetX || 0, currentProps.offsetY || 0, currentProps.offsetZ || 0)

            if (currentProps.shadingMode === "points") {
                const arr = visualObject.geometry.attributes.position.array
                for (let i = 0; i < particles.length; i++) {
                    arr[i * 3] = particles[i].x
                    arr[i * 3 + 1] = particles[i].y
                    arr[i * 3 + 2] = particles[i].z
                }
                visualObject.geometry.attributes.position.needsUpdate = true
                visualObject.material.color.set(currentProps.color)
                visualObject.material.size = currentProps.pointSize || 4
            } else {
                const scale = (currentProps.lineWidth || 1.5) * 0.5
                for (let i = 0; i < visualLinks.length; i++) {
                    const [i1, i2] = visualLinks[i]
                    const p1 = particles[i1]
                    const p2 = particles[i2]

                    const mx = (p1.x + p2.x) * 0.5, my = (p1.y + p2.y) * 0.5, mz = (p1.z + p2.z) * 0.5
                    dummy.position.set(mx, my, mz)
                    dummy.lookAt(p2.x, p2.y, p2.z)
                    const len = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2 + (p2.z - p1.z) ** 2)
                    dummy.scale.set(scale, scale, len)
                    dummy.updateMatrix()
                    visualObject.setMatrixAt(i, dummy.matrix)
                }
                visualObject.instanceMatrix.needsUpdate = true
                visualObject.material.color.set(currentProps.color)
            }

            renderer.render(scene, camera)
            frameId = requestAnimationFrame(animate)
        }
        animate()

        // Cleanup
        return () => {
            cancelAnimationFrame(frameId)
            resizeObserver.disconnect()
            container.removeEventListener("mousemove", onMove)
            if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement)
            renderer.dispose()
        }
    }, [
        props.appearance?.resolution, 
        props.appearance?.shadingMode, 
        props.appearance?.lineStyle, 
        props.appearance?.meshSize
    ]) // Re-run init only on structural changes

    return (
        <div
            ref={containerRef}
            className={props.className}
            style={{
                ...props.style,
                width: "100%",
                height: "100%",
                overflow: "hidden",
                display: "block" // Ensure it takes space
            }}
        />
    )
}

FramerComponentCloth.defaultProps = {
    width: 800,
    height: 600,
    resolution: 20
}

addPropertyControls(FramerComponentCloth, {
    appearance: {
        type: ControlType.Object,
        title: "Appearance",
        controls: {
            shadingMode: {
                type: ControlType.Enum,
                title: "Mode",
                options: ["wireframe", "points"],
                defaultValue: "wireframe"
            },
            color: {
                type: ControlType.Color,
                title: "Color",
                defaultValue: "#8855ff"
            },
            meshSize: {
                type: ControlType.Number,
                title: "Size",
                min: 100, max: 2000,
                defaultValue: 500
            },
            resolution: {
                type: ControlType.Number,
                title: "Resolution",
                min: 5, max: 40,
                defaultValue: 20
            },
            pointSize: {
                type: ControlType.Number,
                title: "Point Size",
                min: 1, max: 20,
                defaultValue: 4,
                hidden: (p) => p.shadingMode !== "points"
            },
            lineStyle: {
                type: ControlType.Enum,
                title: "Topology",
                options: ["grid", "vertical", "horizontal", "diagonal1", "diagonal2", "cross"],
                defaultValue: "grid",
                hidden: (p) => p.shadingMode === "points"
            },
            lineWidth: {
                type: ControlType.Number,
                title: "Line W",
                min: 0.5, max: 10, step: 0.5,
                defaultValue: 1.5,
                hidden: (p) => p.shadingMode === "points"
            },
        }
    },
    physics: {
        type: ControlType.Object,
        title: "Physics",
        controls: {
            speed: {
                type: ControlType.Number,
                title: "Time Scale",
                min: 0, max: 3, step: 0.1, defaultValue: 1
            },
            gravity: {
                type: ControlType.Number,
                title: "Gravity",
                min: 0, max: 2000, step: 10, defaultValue: 980
            },
            windStrength: {
                type: ControlType.Number,
                title: "Wind",
                min: 0, max: 2, step: 0.1, defaultValue: 0.5
            },
        }
    },
    camera: {
        type: ControlType.Object,
        title: "Camera",
        controls: {
            view: {
                type: ControlType.Enum,
                title: "Type",
                options: ["perspective", "front", "isometric", "side", "top"],
                defaultValue: "perspective"
            }
        }
    },
    transform: {
        type: ControlType.Object,
        title: "Transform",
        controls: {
            offsetX: { type: ControlType.Number, title: "Pos X", min: -500, max: 500, defaultValue: 0 },
            offsetY: { type: ControlType.Number, title: "Pos Y", min: -500, max: 500, defaultValue: 0 },
            offsetZ: { type: ControlType.Number, title: "Pos Z", min: -500, max: 500, defaultValue: 0 },
            rotateX: { type: ControlType.Number, title: "Rot X", min: 0, max: 360, defaultValue: 0 },
            rotateY: { type: ControlType.Number, title: "Rot Y", min: 0, max: 360, defaultValue: 0 },
            rotateZ: { type: ControlType.Number, title: "Rot Z", min: 0, max: 360, defaultValue: 0 },
            rotationSpeedX: { type: ControlType.Number, title: "Spin X", min: -2, max: 2, step: 0.1, defaultValue: 0 },
            rotationSpeedY: { type: ControlType.Number, title: "Spin Y", min: -2, max: 2, step: 0.1, defaultValue: 0 },
            rotationSpeedZ: { type: ControlType.Number, title: "Spin Z", min: -2, max: 2, step: 0.1, defaultValue: 0 },
        }
    }
})
