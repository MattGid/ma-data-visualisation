import React, { useState, useEffect, useRef } from "react"
import { addPropertyControls, ControlType } from "framer"

// --- CONSTANTS ---
const REST_DISTANCE = 25
const SQRT2 = Math.SQRT2
const DAMPING = 0.97
const MASS = 0.1
const TIMESTEP_SQ = (18 / 1000) ** 2
const ITERATIONS = 3

// --- TYPES ---
interface Particle {
    x: number, y: number, z: number,
    px: number, py: number, pz: number,
    ox: number, oy: number, oz: number,
    fx: number, fy: number, fz: number,
    pinned: boolean
}

// --- LOADER ---
const useThree = () => {
    const [loaded, setLoaded] = useState(false)
    useEffect(() => {
        if ((window as any).THREE) {
            setLoaded(true)
            return
        }
        const script = document.createElement("script")
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"
        script.async = true
        script.onload = () => setLoaded(true)
        document.head.appendChild(script)
    }, [])
    return loaded
}

// --- MAIN COMPONENT ---
function FramerComponentCloth(props: any) {
    // Flatten nested props for easier use
    const {
        appearance = {
            shadingMode: "wireframe",
            color: "#8855ff",
            resolution: 20,
            pointSize: 4,
            lineStyle: "grid",
            lineWidth: 1.5,
            meshSize: 500,
        },
        physics = {
            windStrength: 0.5,
            gravity: 980,
            speed: 1,
        },
        view = {
            cameraView: "perspective",
            offsetX: 0, offsetY: 0, offsetZ: 0,
            rotateX: 0, rotateY: 0, rotateZ: 0,
            rotationSpeedX: 0, rotationSpeedY: 0, rotationSpeedZ: 0
        }
    } = props

    // Internal params mapping
    const shadingMode = appearance.shadingMode
    const color = appearance.color
    const resolution = appearance.resolution
    const pointSize = appearance.pointSize
    const lineStyle = appearance.lineStyle
    const lineWidth = appearance.lineWidth
    const meshSize = appearance.meshSize || 500

    const windStrength = physics.windStrength
    const gravity = physics.gravity
    const speed = physics.speed

    const cameraView = view.cameraView
    const offsetX = view.offsetX
    const offsetY = view.offsetY
    const offsetZ = view.offsetZ
    const rotateX = view.rotateX
    const rotateY = view.rotateY
    const rotateZ = view.rotateZ
    const rotationSpeedX = view.rotationSpeedX
    const rotationSpeedY = view.rotationSpeedY
    const rotationSpeedZ = view.rotationSpeedZ

    const containerRef = useRef<HTMLDivElement>(null)
    const threeLoaded = useThree()
    const sceneRef = useRef<any>(null)
    // Store flattened params for animate loop
    const paramsRef = useRef({
        shadingMode, color, resolution, pointSize, lineStyle, lineWidth, meshSize,
        windStrength, gravity, speed,
        view: cameraView, offsetX, offsetY, offsetZ,
        rotateX, rotateY, rotateZ, rotationSpeedX, rotationSpeedY, rotationSpeedZ
    })

    // Update params immediately
    useEffect(() => {
        paramsRef.current = {
            shadingMode, color, resolution, pointSize, lineStyle, lineWidth, meshSize,
            windStrength, gravity, speed,
            view: cameraView, offsetX, offsetY, offsetZ,
            rotateX, rotateY, rotateZ, rotationSpeedX, rotationSpeedY, rotationSpeedZ
        }
    }, [appearance, physics, view])

    useEffect(() => {
        if (!threeLoaded || !containerRef.current) return
        const THREE = (window as any).THREE
        const container = containerRef.current
        const width = container.clientWidth
        const height = container.clientHeight

        // Scene
        const scene = new THREE.Scene()
        const cameraRig = new THREE.Group()
        scene.add(cameraRig)

        const camera = new THREE.PerspectiveCamera(45, width / height, 1, 10000)
        camera.position.set(0, -100, 600)
        cameraRig.add(camera)

        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
        renderer.setSize(width, height)
        container.appendChild(renderer.domElement)

        // Lights
        scene.add(new THREE.AmbientLight(0x666666))
        const dL = new THREE.DirectionalLight(0xffffff, 1.2)
        dL.position.set(200, 500, 200)
        scene.add(dL)

        // Objects
        const xSegs = Math.max(2, resolution)
        const ySegs = Math.max(2, resolution)
        const restDist = meshSize / xSegs
        const idx = (u: number, v: number) => u + v * (xSegs + 1)
        const clothW = meshSize
        const clothH = meshSize

        // Particles
        const particles: Particle[] = []
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

        // Mesh
        let clothObject: any
        let visualLinks: any[] = []
        let dummy = new THREE.Object3D()

        if (shadingMode === "points") {
            const geo = new THREE.BufferGeometry()
            const pos = new Float32Array(particles.length * 3)
            geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
            const mat = new THREE.PointsMaterial({ color: color, size: pointSize })
            clothObject = new THREE.Points(geo, mat)
        } else {
            // Lines
            for (let v = 0; v <= ySegs; v++) {
                for (let u = 0; u <= xSegs; u++) {
                    const ls = lineStyle
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
            const mat = new THREE.MeshStandardMaterial({ color: color, roughness: 0.4, metalness: 0.1 })
            clothObject = new THREE.InstancedMesh(geo, mat, visualLinks.length)
            clothObject.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
        }
        scene.add(clothObject)

        // Mouse
        const raycaster = new THREE.Raycaster()
        const mouse = new THREE.Vector2(999, 999)
        const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)

        const onMove = (e: MouseEvent) => {
            const rect = renderer.domElement.getBoundingClientRect()
            mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
            mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
        }
        window.addEventListener("mousemove", onMove)

        const resize = () => {
            const w = container.clientWidth
            const h = container.clientHeight
            renderer.setSize(w, h)
            camera.aspect = w / h
            camera.updateProjectionMatrix()
        }
        window.addEventListener("resize", resize)

        // Loop
        let frameId = 0
        let rotAcc = { x: 0, y: 0, z: 0 }

        const animate = () => {
            const p = paramsRef.current

            // Camera
            rotAcc.x += (p.rotationSpeedX || 0) * 0.02
            rotAcc.y += (p.rotationSpeedY || 0) * 0.02
            rotAcc.z += (p.rotationSpeedZ || 0) * 0.02
            const deg = Math.PI / 180
            cameraRig.rotation.set((p.rotateX || 0) * deg + rotAcc.x, (p.rotateY || 0) * deg + rotAcc.y, (p.rotateZ || 0) * deg + rotAcc.z)

            // View Points
            const dist = 600
            if (p.view === 'front') camera.position.set(0, 0, dist)
            else if (p.view === 'side') camera.position.set(dist, 0, 0)
            else if (p.view === 'top') camera.position.set(0, dist, 10)
            else if (p.view === 'isometric') camera.position.set(dist * 0.7, dist * 0.5, dist * 0.7)
            else camera.position.set(0, -100, 600)
            camera.lookAt(0, 0, 0)

            // Physics
            const time = performance.now() * 0.0005 * (p.speed || 1)
            const grav = -(p.gravity || 980) * MASS
            const wind = (p.windStrength || 0.5) * 150

            raycaster.setFromCamera(mouse, camera)
            const hit = new THREE.Vector3()
            raycaster.ray.intersectPlane(plane, hit) // Assume always hits z=0 plane

            particles.forEach(pt => {
                if (pt.pinned) return
                // Forces
                let fx = Math.sin(time + pt.y * 0.02) * Math.sin(time * 0.5 + pt.x * 0.02) * wind
                let fy = grav
                let fz = Math.cos(time + pt.y * 0.02) * wind * 0.67

                // Mouse
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
                const nx = pt.x + vx + fx * TIMESTEP_SQ
                const ny = pt.y + vy + fy * TIMESTEP_SQ
                const nz = pt.z + vz + fz * TIMESTEP_SQ

                pt.px = pt.x; pt.py = pt.y; pt.pz = pt.z
                pt.x = nx; pt.y = ny; pt.z = nz
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

            // Visuals
            clothObject.position.set(p.offsetX || 0, p.offsetY || 0, p.offsetZ || 0)
            if (p.shadingMode === "points") {
                const arr = clothObject.geometry.attributes.position.array
                for (let i = 0; i < particles.length; i++) {
                    arr[i * 3] = particles[i].x
                    arr[i * 3 + 1] = particles[i].y
                    arr[i * 3 + 2] = particles[i].z
                }
                clothObject.geometry.attributes.position.needsUpdate = true
                clothObject.material.color.set(p.color)
                clothObject.material.size = p.pointSize
            } else {
                const scale = (p.lineWidth || 1.5) * 0.5
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
                    clothObject.setMatrixAt(i, dummy.matrix)
                }
                clothObject.instanceMatrix.needsUpdate = true
                clothObject.material.color.set(p.color)
            }

            renderer.render(scene, camera)
            frameId = requestAnimationFrame(animate)
        }
        animate()

        return () => {
            cancelAnimationFrame(frameId)
            window.removeEventListener("mousemove", onMove)
            window.removeEventListener("resize", resize)
            if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement)
            renderer.dispose()
        }
    }, [threeLoaded, resolution, shadingMode, lineStyle, meshSize]) // Rebuild on these props

    return (
        <div
            ref={containerRef}
            className={props.className}
            style={{
                ...props.style,
                width: props.width ?? "100%",
                height: props.height ?? "100%",
                position: "relative",
                overflow: "hidden"
            }}
        >
            {!threeLoaded && <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", color: "#888", fontSize: 12 }}>Loading...</div>}
        </div>
    )
}

addPropertyControls(FramerComponentCloth, {
    appearance: {
        type: ControlType.Object,
        title: "Appearance",
        controls: {
            shadingMode: { type: ControlType.Enum, title: "Mode", options: ["wireframe", "points"], defaultValue: "wireframe" },
            color: { type: ControlType.Color, title: "Color", defaultValue: "#8855ff" },
            resolution: { type: ControlType.Number, title: "Resolution", min: 5, max: 40, defaultValue: 20 },
            pointSize: { type: ControlType.Number, title: "Pt Size", min: 1, max: 20, defaultValue: 4, hidden: (p) => p.shadingMode !== "points" },
            meshSize: { type: ControlType.Number, title: "Size", min: 100, max: 2000, defaultValue: 500 },
            lineStyle: { type: ControlType.Enum, title: "Topology", options: ["grid", "vertical", "horizontal", "diagonal1", "diagonal2", "cross"], defaultValue: "grid", hidden: (p) => p.shadingMode === "points" },
            lineWidth: { type: ControlType.Number, title: "Line W", min: 0.5, max: 10, step: 0.5, defaultValue: 1.5, hidden: (p) => p.shadingMode === "points" },
        }
    },
    physics: {
        type: ControlType.Object,
        title: "Physics",
        controls: {
            windStrength: { type: ControlType.Number, title: "Wind", min: 0, max: 2, step: 0.1, defaultValue: 0.5 },
            gravity: { type: ControlType.Number, title: "Gravity", min: 0, max: 2000, step: 10, defaultValue: 980 },
            speed: { type: ControlType.Number, title: "Speed", min: 0, max: 3, step: 0.1, defaultValue: 1 },
        }
    },
    view: {
        type: ControlType.Object,
        title: "View & Transform",
        controls: {
            cameraView: { type: ControlType.Enum, title: "Camera", options: ["perspective", "front", "isometric", "side", "top"], defaultValue: "perspective" },
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

FramerComponentCloth.defaultProps = {
    width: 800,
    height: 600,
}

export default FramerComponentCloth
