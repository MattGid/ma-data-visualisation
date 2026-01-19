import React, { useState, useEffect, useRef, useCallback } from "react"
import { addPropertyControls, ControlType } from "framer"

// =============================================================================
// CLOTH HERO - Optimized Framer Component
// Ready to copy-paste into Framer Code Editor
// =============================================================================

// --- PHYSICS CONSTANTS ---
const DAMPING = 0.97
const MASS = 0.1
const INV_MASS = 1 / MASS
const REST_DISTANCE = 25
const ITERATIONS = 3
const TIMESTEP_SQ = (18 / 1000) ** 2
const SQRT2 = Math.SQRT2

// --- THREE.JS LOADER HOOK ---
const useThree = (): boolean => {
    const [loaded, setLoaded] = useState<boolean>(
        typeof window !== "undefined" && !!(window as any).THREE
    )

    useEffect(() => {
        if (loaded) return

        const script = document.createElement("script")
        script.src =
            "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"
        script.async = true
        script.onload = () => setLoaded(true)
        script.onerror = () => console.error("Failed to load Three.js")
        document.head.appendChild(script)

        return () => {
            if (script.parentNode) script.parentNode.removeChild(script)
        }
    }, [loaded])

    return loaded
}

// --- TYPES ---
interface Particle {
    x: number
    y: number
    z: number
    px: number
    py: number
    pz: number
    ox: number
    oy: number
    oz: number
    fx: number
    fy: number
    fz: number
    pinned: boolean
}

interface ClothHeroProps {
    color?: string
    shadingMode?: "wireframe" | "points"
    lineStyle?:
    | "grid"
    | "vertical"
    | "horizontal"
    | "diagonal1"
    | "diagonal2"
    | "cross"
    view?: "perspective" | "front" | "isometric" | "side" | "top"
    windStrength?: number
    gravity?: number
    speed?: number
    resolution?: number
    rotationSpeedX?: number
    rotationSpeedY?: number
    rotationSpeedZ?: number
    pointSize?: number
    lineWidth?: number
    offsetX?: number
    offsetY?: number
    offsetZ?: number
    rotateX?: number
    rotateY?: number
    rotateZ?: number
    backgroundMode?: "solid" | "gradient"
    backgroundColor?: string
    gradientStart?: string
    gradientEnd?: string
    gradientAngle?: number
}

// --- MAIN COMPONENT ---
export function ClothHero({
    color = "#8855ff",
    shadingMode = "wireframe",
    lineStyle = "grid",
    view = "perspective",
    windStrength = 0.5,
    gravity = 980,
    speed = 1,
    resolution = 20,
    rotationSpeedX = 0,
    rotationSpeedY = 0,
    rotationSpeedZ = 0,
    pointSize = 4,
    lineWidth = 1.5,
    offsetX = 0,
    offsetY = 0,
    offsetZ = 0,
    rotateX = 0,
    rotateY = 0,
    rotateZ = 0,
    backgroundMode = "gradient",
    backgroundColor = "#ffffff",
    gradientStart = "#f0f0f0",
    gradientEnd = "#e0e0e0",
    gradientAngle = 180,
}: ClothHeroProps): JSX.Element {
    const mountRef = useRef<HTMLDivElement>(null)
    const threeLoaded = useThree()

    // Store mutable params in ref to avoid re-creating scene
    const paramsRef = useRef({
        windStrength,
        gravity,
        speed,
        rotationSpeedX,
        rotationSpeedY,
        rotationSpeedZ,
        lineWidth,
        rotateX,
        rotateY,
        rotateZ,
    })

    // Update params ref when props change
    useEffect(() => {
        paramsRef.current = {
            windStrength,
            gravity,
            speed,
            rotationSpeedX,
            rotationSpeedY,
            rotationSpeedZ,
            lineWidth,
            rotateX,
            rotateY,
            rotateZ,
        }
    }, [
        windStrength,
        gravity,
        speed,
        rotationSpeedX,
        rotationSpeedY,
        rotationSpeedZ,
        lineWidth,
        rotateX,
        rotateY,
        rotateZ,
    ])

    // Scene references
    const sceneRef = useRef<{
        particles: Particle[]
        constraints: [number, number, number][]
        clothObject: any
        visualLinks: [number, number][]
        dummyObj: any
        scene: any
        camera: any
        cameraRig: any
        renderer: any
        mouseX: number
        mouseY: number
        raycaster: any
        intersectPlane: any
        intersectPoint: any
        tempVec: any
        accumulatedRotation: { x: number; y: number; z: number }
    } | null>(null)

    // --- INITIALIZATION EFFECT ---
    useEffect(() => {
        if (!threeLoaded || !mountRef.current) return

        const THREE = (window as any).THREE
        const container = mountRef.current
        const width = container.clientWidth || 400
        const height = container.clientHeight || 400

        // --- SCENE SETUP ---
        const scene = new THREE.Scene()
        const cameraRig = new THREE.Group()
        scene.add(cameraRig)

        const camera = new THREE.PerspectiveCamera(45, width / height, 1, 10000)
        camera.position.set(0, 0, 600)
        cameraRig.add(camera)

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
        renderer.setSize(width, height)
        container.appendChild(renderer.domElement)

        // --- LIGHTING ---
        scene.add(new THREE.AmbientLight(0x666666))

        const dirLight = new THREE.DirectionalLight(0xffffff, 1.2)
        dirLight.position.set(200, 500, 200)
        scene.add(dirLight)

        const blueLight = new THREE.PointLight(0x0044ff, 0.5)
        blueLight.position.set(-200, -100, 100)
        scene.add(blueLight)

        // --- CLOTH GEOMETRY ---
        const xSegs = resolution
        const ySegs = resolution
        const idx = (u: number, v: number) => u + v * (xSegs + 1)
        const clothWidth = REST_DISTANCE * xSegs
        const clothHeight = REST_DISTANCE * ySegs

        let clothObject: any
        const visualLinks: [number, number][] = []
        const dummyObj = new THREE.Object3D()

        if (shadingMode === "points") {
            const geometry = new THREE.PlaneGeometry(
                clothWidth,
                clothHeight,
                xSegs,
                ySegs
            )
            const material = new THREE.PointsMaterial({
                color,
                size: pointSize,
                sizeAttenuation: false,
            })
            clothObject = new THREE.Points(geometry, material)
            scene.add(clothObject)
        } else {
            // Build visual links based on line style
            for (let v = 0; v <= ySegs; v++) {
                for (let u = 0; u <= xSegs; u++) {
                    const includeHorizontal =
                        lineStyle === "grid" || lineStyle === "horizontal"
                    const includeVertical =
                        lineStyle === "grid" || lineStyle === "vertical"
                    const includeDiag1 =
                        lineStyle === "diagonal1" || lineStyle === "cross"
                    const includeDiag2 =
                        lineStyle === "diagonal2" || lineStyle === "cross"

                    if (includeHorizontal && u < xSegs) {
                        visualLinks.push([idx(u, v), idx(u + 1, v)])
                    }
                    if (includeVertical && v < ySegs) {
                        visualLinks.push([idx(u, v), idx(u, v + 1)])
                    }
                    if (includeDiag1 && u < xSegs && v < ySegs) {
                        visualLinks.push([idx(u, v), idx(u + 1, v + 1)])
                    }
                    if (includeDiag2 && u < xSegs && v < ySegs) {
                        visualLinks.push([idx(u, v + 1), idx(u + 1, v)])
                    }
                }
            }

            const geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 5)
            geometry.rotateX(Math.PI / 2)
            const material = new THREE.MeshBasicMaterial({ color })
            clothObject = new THREE.InstancedMesh(
                geometry,
                material,
                visualLinks.length
            )
            clothObject.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
            scene.add(clothObject)
        }

        // --- PHYSICS PARTICLES ---
        const particles: Particle[] = []
        const constraints: [number, number, number][] = []

        for (let v = 0; v <= ySegs; v++) {
            for (let u = 0; u <= xSegs; u++) {
                const x = (u / xSegs) * clothWidth - clothWidth / 2
                const y = (v / ySegs) * clothHeight - clothHeight / 2
                particles.push({
                    x,
                    y,
                    z: 0,
                    px: x,
                    py: y,
                    pz: 0,
                    ox: x,
                    oy: y,
                    oz: 0,
                    fx: 0,
                    fy: 0,
                    fz: 0,
                    pinned: v === ySegs,
                })
            }
        }

        // Build constraints
        for (let v = 0; v <= ySegs; v++) {
            for (let u = 0; u <= xSegs; u++) {
                if (u < xSegs) {
                    constraints.push([idx(u, v), idx(u + 1, v), REST_DISTANCE])
                }
                if (v < ySegs) {
                    constraints.push([idx(u, v), idx(u, v + 1), REST_DISTANCE])
                }
                if (u < xSegs && v < ySegs) {
                    constraints.push([
                        idx(u, v),
                        idx(u + 1, v + 1),
                        REST_DISTANCE * SQRT2,
                    ])
                    constraints.push([
                        idx(u + 1, v),
                        idx(u, v + 1),
                        REST_DISTANCE * SQRT2,
                    ])
                }
            }
        }

        // Pre-allocate reusable objects for physics calculations
        const raycaster = new THREE.Raycaster()
        const intersectPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
        const intersectPoint = new THREE.Vector3()
        const tempVec = new THREE.Vector3()

        sceneRef.current = {
            particles,
            constraints,
            clothObject,
            visualLinks,
            dummyObj,
            scene,
            camera,
            cameraRig,
            renderer,
            mouseX: 0,
            mouseY: 0,
            raycaster,
            intersectPlane,
            intersectPoint,
            tempVec,
            accumulatedRotation: { x: 0, y: 0, z: 0 },
        }

        // --- EVENT HANDLERS ---
        const onMouseMove = (e: MouseEvent) => {
            if (!sceneRef.current) return
            const rect = renderer.domElement.getBoundingClientRect()
            sceneRef.current.mouseX =
                ((e.clientX - rect.left) / rect.width) * 2 - 1
            sceneRef.current.mouseY =
                -((e.clientY - rect.top) / rect.height) * 2 + 1
        }
        window.addEventListener("mousemove", onMouseMove, { passive: true })

        // --- SIMULATION FUNCTION ---
        const simulate = () => {
            const s = sceneRef.current
            if (!s) return

            const params = paramsRef.current
            const { particles, constraints, camera, cameraRig, raycaster } = s

            // Apply rotation (Static + Animation)
            const { accumulatedRotation } = s
            accumulatedRotation.x += params.rotationSpeedX * 0.02
            accumulatedRotation.y += params.rotationSpeedY * 0.02
            accumulatedRotation.z += params.rotationSpeedZ * 0.02

            const degToRad = (deg: number) => (deg * Math.PI) / 180
            cameraRig.rotation.x =
                degToRad(params.rotateX) + accumulatedRotation.x
            cameraRig.rotation.y =
                degToRad(params.rotateY) + accumulatedRotation.y
            cameraRig.rotation.z =
                degToRad(params.rotateZ) + accumulatedRotation.z

            const time = performance.now() * 0.0005 * params.speed
            const gravityForce = -params.gravity * MASS
            const windMult = params.windStrength * 150

            // Raycast for mouse interaction
            s.tempVec.set(s.mouseX, s.mouseY, 0)
            raycaster.setFromCamera(s.tempVec, camera)
            raycaster.ray.intersectPlane(s.intersectPlane, s.intersectPoint)

            const hasIntersect = s.intersectPoint !== null
            const ix = hasIntersect ? s.intersectPoint.x : 0
            const iy = hasIntersect ? s.intersectPoint.y : 0
            const iz = hasIntersect ? s.intersectPoint.z : 0

            // Apply forces
            for (let i = 0; i < particles.length; i++) {
                const p = particles[i]
                if (p.pinned) continue

                // Gravity
                p.fy = gravityForce

                // Wind
                const windX =
                    Math.sin(time + p.y * 0.02) *
                    Math.sin(time * 0.5 + p.x * 0.02)
                const windZ = Math.cos(time + p.y * 0.02)
                p.fx = windX * windMult
                p.fz = windZ * windMult * 0.67

                // Mouse repulsion
                if (hasIntersect) {
                    const dx = p.x - ix
                    const dy = p.y - iy
                    const dz = p.z - iz
                    const distSq = dx * dx + dy * dy + dz * dz
                    const radius = 120
                    if (distSq < radius * radius) {
                        const dist = Math.sqrt(distSq)
                        const force = (radius - dist) * 50
                        const invDist = 1 / (dist || 1)
                        p.fx += dx * invDist * force
                        p.fy += dy * invDist * force
                        p.fz += dz * invDist * force
                    }
                }
            }

            // Verlet integration
            for (let i = 0; i < particles.length; i++) {
                const p = particles[i]
                if (p.pinned) continue

                const vx = (p.x - p.px) * DAMPING
                const vy = (p.y - p.py) * DAMPING
                const vz = (p.z - p.pz) * DAMPING

                const nx = p.x + vx + p.fx * TIMESTEP_SQ
                const ny = p.y + vy + p.fy * TIMESTEP_SQ
                const nz = p.z + vz + p.fz * TIMESTEP_SQ

                p.px = p.x
                p.py = p.y
                p.pz = p.z
                p.x = nx
                p.y = ny
                p.z = nz
                p.fx = 0
                p.fy = 0
                p.fz = 0
            }

            // Constraint solving
            for (let iter = 0; iter < ITERATIONS; iter++) {
                for (let c = 0; c < constraints.length; c++) {
                    const [i1, i2, restLen] = constraints[c]
                    const p1 = particles[i1]
                    const p2 = particles[i2]

                    const dx = p2.x - p1.x
                    const dy = p2.y - p1.y
                    const dz = p2.z - p1.z
                    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
                    if (dist === 0) continue

                    const factor = ((dist - restLen) / dist) * 0.5
                    const cx = dx * factor
                    const cy = dy * factor
                    const cz = dz * factor

                    if (!p1.pinned) {
                        p1.x += cx
                        p1.y += cy
                        p1.z += cz
                    }
                    if (!p2.pinned) {
                        p2.x -= cx
                        p2.y -= cy
                        p2.z -= cz
                    }
                }
            }
        }

        // --- RENDER LOOP ---
        let animationFrameId: number

        const animate = () => {
            simulate()

            const s = sceneRef.current
            if (!s) return

            const { particles, clothObject, visualLinks, dummyObj, renderer, scene, camera } = s
            const params = paramsRef.current

            if (shadingMode === "points") {
                const positions = clothObject.geometry.attributes.position.array
                for (let i = 0; i < particles.length; i++) {
                    const p = particles[i]
                    positions[i * 3] = p.x
                    positions[i * 3 + 1] = p.y
                    positions[i * 3 + 2] = p.z
                }
                clothObject.geometry.attributes.position.needsUpdate = true
            } else {
                const scaleFactor = params.lineWidth * 0.5
                for (let i = 0; i < visualLinks.length; i++) {
                    const [idx1, idx2] = visualLinks[i]
                    const p1 = particles[idx1]
                    const p2 = particles[idx2]

                    // Position at midpoint
                    dummyObj.position.set(
                        (p1.x + p2.x) * 0.5,
                        (p1.y + p2.y) * 0.5,
                        (p1.z + p2.z) * 0.5
                    )

                    // Look at end point
                    s.tempVec.set(p2.x, p2.y, p2.z)
                    dummyObj.lookAt(s.tempVec)

                    // Scale to distance
                    const dx = p2.x - p1.x
                    const dy = p2.y - p1.y
                    const dz = p2.z - p1.z
                    const len = Math.sqrt(dx * dx + dy * dy + dz * dz)
                    dummyObj.scale.set(scaleFactor, scaleFactor, len)

                    dummyObj.updateMatrix()
                    clothObject.setMatrixAt(i, dummyObj.matrix)
                }
                clothObject.instanceMatrix.needsUpdate = true
            }

            renderer.render(scene, camera)
            animationFrameId = requestAnimationFrame(animate)
        }

        animate()

        // --- RESIZE HANDLER ---
        const handleResize = () => {
            if (!container || !sceneRef.current) return
            const w = container.clientWidth || 400
            const h = container.clientHeight || 400
            sceneRef.current.renderer.setSize(w, h)
            sceneRef.current.camera.aspect = w / h
            sceneRef.current.camera.updateProjectionMatrix()
        }
        window.addEventListener("resize", handleResize)

        // ResizeObserver for container size changes
        const resizeObserver = new ResizeObserver(handleResize)
        resizeObserver.observe(container)

        // --- CLEANUP ---
        return () => {
            cancelAnimationFrame(animationFrameId)
            window.removeEventListener("mousemove", onMouseMove)
            window.removeEventListener("resize", handleResize)
            resizeObserver.disconnect()

            if (container && renderer.domElement.parentNode === container) {
                container.removeChild(renderer.domElement)
            }

            clothObject?.geometry?.dispose()
            clothObject?.material?.dispose()
            renderer.dispose()
            sceneRef.current = null
        }
    }, [threeLoaded, resolution, shadingMode, lineStyle])

    // --- CAMERA VIEW EFFECT ---
    useEffect(() => {
        if (!sceneRef.current?.camera) return
        const { camera, cameraRig } = sceneRef.current
        cameraRig.rotation.set(0, 0, 0)
        const dist = 600

        switch (view) {
            case "front":
                camera.position.set(0, 0, dist)
                break
            case "isometric":
                camera.position.set(dist * 0.7, dist * 0.5, dist * 0.7)
                break
            case "side":
                camera.position.set(dist, 0, 0)
                break
            case "top":
                camera.position.set(0, dist, 10)
                break
            case "perspective":
            default:
                camera.position.set(0, -100, 600)
                break
        }
        camera.lookAt(0, 0, 0)
    }, [view, threeLoaded, shadingMode, lineStyle, resolution])

    // --- MATERIAL UPDATE EFFECT ---
    useEffect(() => {
        if (!sceneRef.current?.clothObject) return
        const { clothObject } = sceneRef.current

        clothObject.material.color.set(color)
        if (shadingMode === "points") {
            clothObject.material.size = pointSize
        }
        clothObject.material.needsUpdate = true
    }, [color, shadingMode, pointSize])

    // --- OFFSET UPDATE EFFECT ---
    useEffect(() => {
        if (!sceneRef.current?.clothObject) return
        sceneRef.current.clothObject.position.set(offsetX, offsetY, offsetZ)
    }, [offsetX, offsetY, offsetZ])

    // --- BACKGROUND STYLE ---
    const backgroundStyle =
        backgroundMode === "solid"
            ? { backgroundColor }
            : {
                background: `linear-gradient(${gradientAngle}deg, ${gradientStart}, ${gradientEnd})`,
            }

    return (
        <div
            ref={mountRef}
            style={{
                width: "100%",
                height: "100%",
                overflow: "hidden",
                position: "relative",
                ...backgroundStyle,
            }}
        >
            {!threeLoaded && (
                <div
                    style={{
                        position: "absolute",
                        top: "50%",
                        left: "50%",
                        transform: "translate(-50%, -50%)",
                        color: "#999",
                        fontFamily: "system-ui, sans-serif",
                        fontSize: "14px",
                    }}
                >
                    Loading...
                </div>
            )}
        </div>
    )
}

// =============================================================================
// FRAMER PROPERTY CONTROLS
// =============================================================================

addPropertyControls(ClothHero, {
    // --- Appearance ---
    color: {
        type: ControlType.Color,
        title: "Color",
        defaultValue: "#8855ff",
    },
    shadingMode: {
        type: ControlType.Enum,
        title: "Mode",
        options: ["wireframe", "points"],
        optionTitles: ["Wireframe", "Points"],
        defaultValue: "wireframe",
    },
    lineStyle: {
        type: ControlType.Enum,
        title: "Topology",
        options: [
            "grid",
            "vertical",
            "horizontal",
            "diagonal1",
            "diagonal2",
            "cross",
        ],
        optionTitles: [
            "Grid",
            "Vertical",
            "Horizontal",
            "Diagonal ↘",
            "Diagonal ↙",
            "Cross",
        ],
        defaultValue: "grid",
        hidden: (props) => props.shadingMode === "points",
    },
    pointSize: {
        type: ControlType.Number,
        title: "Point Size",
        min: 1,
        max: 20,
        step: 1,
        defaultValue: 4,
        hidden: (props) => props.shadingMode !== "points",
    },
    lineWidth: {
        type: ControlType.Number,
        title: "Thickness",
        min: 0.5,
        max: 10,
        step: 0.5,
        defaultValue: 1.5,
        hidden: (props) => props.shadingMode === "points",
    },
    resolution: {
        type: ControlType.Number,
        title: "Resolution",
        min: 5,
        max: 40,
        step: 1,
        defaultValue: 20,
    },

    // --- View ---
    view: {
        type: ControlType.Enum,
        title: "View",
        options: ["perspective", "front", "isometric", "side", "top"],
        optionTitles: ["Perspective", "Front", "Isometric", "Side", "Top"],
        defaultValue: "perspective",
    },

    // --- Offset ---
    offsetX: {
        type: ControlType.Number,
        title: "Offset X",
        min: -500,
        max: 500,
        step: 10,
        defaultValue: 0,
    },
    offsetY: {
        type: ControlType.Number,
        title: "Offset Y",
        min: -500,
        max: 500,
        step: 10,
        defaultValue: 0,
    },
    offsetZ: {
        type: ControlType.Number,
        title: "Offset Z",
        min: -500,
        max: 500,
        step: 10,
        defaultValue: 0,
    },

    // --- Physics ---
    windStrength: {
        type: ControlType.Number,
        title: "Wind",
        min: 0,
        max: 2,
        step: 0.1,
        defaultValue: 0.5,
    },
    gravity: {
        type: ControlType.Number,
        title: "Gravity",
        min: 0,
        max: 2000,
        step: 10,
        defaultValue: 980,
    },
    speed: {
        type: ControlType.Number,
        title: "Speed",
        min: 0,
        max: 3,
        step: 0.1,
        defaultValue: 1,
    },

    // --- Rotation ---
    rotateX: {
        type: ControlType.Number,
        title: "Rotate X",
        min: 0,
        max: 360,
        unit: "°",
        defaultValue: 0,
    },
    rotateY: {
        type: ControlType.Number,
        title: "Rotate Y",
        min: 0,
        max: 360,
        unit: "°",
        defaultValue: 0,
    },
    rotateZ: {
        type: ControlType.Number,
        title: "Rotate Z",
        min: 0,
        max: 360,
        unit: "°",
        defaultValue: 0,
    },

    // --- Auto Rotate ---
    rotationSpeedX: {
        type: ControlType.Number,
        title: "Speed X",
        min: -2,
        max: 2,
        step: 0.1,
        defaultValue: 0,
    },
    rotationSpeedY: {
        type: ControlType.Number,
        title: "Speed Y",
        min: -2,
        max: 2,
        step: 0.1,
        defaultValue: 0,
    },
    rotationSpeedZ: {
        type: ControlType.Number,
        title: "Speed Z",
        min: -2,
        max: 2,
        step: 0.1,
        defaultValue: 0,
    },

    // --- Background ---
    backgroundMode: {
        type: ControlType.Enum,
        title: "BG Mode",
        options: ["solid", "gradient"],
        optionTitles: ["Solid", "Gradient"],
        defaultValue: "gradient",
    },
    backgroundColor: {
        type: ControlType.Color,
        title: "BG Color",
        defaultValue: "#ffffff",
        hidden: (props) => props.backgroundMode !== "solid",
    },
    gradientStart: {
        type: ControlType.Color,
        title: "Gradient Start",
        defaultValue: "#f0f0f0",
        hidden: (props) => props.backgroundMode !== "gradient",
    },
    gradientEnd: {
        type: ControlType.Color,
        title: "Gradient End",
        defaultValue: "#e0e0e0",
        hidden: (props) => props.backgroundMode !== "gradient",
    },
    gradientAngle: {
        type: ControlType.Number,
        title: "Gradient Angle",
        min: 0,
        max: 360,
        step: 1,
        defaultValue: 180,
        hidden: (props) => props.backgroundMode !== "gradient",
    },
})

export default ClothHero
