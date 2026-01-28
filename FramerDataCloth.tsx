
import * as THREE from "three"
import React, { useMemo, useRef, useState, useEffect } from "react"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { OrbitControls } from "@react-three/drei"
import { addPropertyControls, ControlType } from "framer"

/**
 * FRAMER DATA CLOTH
 * 
 * A WebGL-powered data visualization component that maps CSV data
 * to a high-performance cloth simulation.
 * 
 * Features:
 * - GPU-accelerated Vertex Shader simulation (Vertex Displacement)
 * - CSV parsing and interpolation
 * - Reactive to "wind", "turbulence", "color" data columns
 * - Premium aesthetics ("Google Antigravity" style: Silk/Glassmorphism)
 */

// --- SHADERS ---

const vertexShader = `
  varying vec2 vUv;
  varying float vElevation;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  
  uniform float uTime;
  uniform float uWindSpeed;
  uniform float uTurbulence;
  uniform float uDisplacementScale;
  
  // Classic Perlin/Simplex Noise chunk
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
  float snoise(vec3 v) {
    const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
    const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy) );
    vec3 x0 = v - i + dot(i, C.xxx) ;
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min( g.xyz, l.zxy );
    vec3 i2 = max( g.xyz, l.zxy );
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute( permute( permute(
               i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
             + i.y + vec4(0.0, i1.y, i2.y, 1.0 ))
             + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
    float n_ = 0.142857142857;
    vec3  ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_ );
    vec4 x = x_ *ns.x + ns.yyyy;
    vec4 y = y_ *ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4( x.xy, y.xy );
    vec4 b1 = vec4( x.zw, y.zw );
    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
    vec3 p0 = vec3(a0.xy,h.x);
    vec3 p1 = vec3(a0.zw,h.y);
    vec3 p2 = vec3(a1.xy,h.z);
    vec3 p3 = vec3(a1.zw,h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3) ) );
  }

  void main() {
    vUv = uv;
    vec3 pos = position;
    
    // Wind Effect
    float windOffset = uTime * uWindSpeed;
    
    // Noise layers
    float noiseBase = snoise(vec3(pos.x * 0.5 - windOffset, pos.y * 0.5, uTime * 0.2));
    float noiseDetail = snoise(vec3(pos.x * 1.5 - windOffset * 1.2, pos.y * 1.5, uTime * 0.5));
    float totalNoise = noiseBase * 0.7 + noiseDetail * 0.3;
    
    // Displacement
    float displacement = totalNoise * uTurbulence * uDisplacementScale;
    pos.z += displacement;
    
    vElevation = displacement;
    vNormal = normal; 
    
    // World Position for Fragment Shader (Lighting)
    vec4 worldPos = modelMatrix * vec4(pos, 1.0);
    vWorldPosition = worldPos.xyz;

    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`

const fragmentShader = `
  varying vec2 vUv;
  varying float vElevation;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  
  uniform vec3 uColor;
  uniform float uOpacity;
  
  void main() {
    // Advanced Lighting for Silk/Glass effect
    
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    vec3 normal = normalize(vNormal); // Standard normal (smooth), we could perturb it with noise derivative for more detail
    
    // Key Light
    vec3 lightPos = vec3(10.0, 10.0, 10.0);
    vec3 lightDir = normalize(lightPos - vWorldPosition);
    
    // Diffuse
    float diff = max(dot(normal, lightDir), 0.0);
    
    // Specular (Blinn-Phong) - Sharp and glossy
    vec3 halfDir = normalize(lightDir + viewDir);
    float spec = pow(max(dot(normal, halfDir), 0.0), 32.0);
    
    // Fresnel (Rim Light) - Critical for "Glassy/Premium" look
    float fresnel = pow(1.0 - max(dot(viewDir, normal), 0.0), 3.0);
    
    // Base Color gradient based on Wave Height
    float heightFactor = smoothstep(-3.0, 3.0, vElevation);
    vec3 deepColor = uColor * 0.5;
    vec3 peakColor = uColor * 1.2 + vec3(0.1); // Lighter
    vec3 albedo = mix(deepColor, peakColor, heightFactor);
    
    // Compose
    vec3 finalColor = albedo * (0.6 + 0.4 * diff); // Ambient + Diffuse
    finalColor += vec3(1.0) * spec * 0.6; // Strong Specular
    finalColor += vec3(0.5, 0.8, 1.0) * fresnel * 0.5; // Blue-ish Rim
    
    gl_FragColor = vec4(finalColor, uOpacity * (0.9 + 0.1 * fresnel));
    
    // Gamma
    gl_FragColor.rgb = pow(gl_FragColor.rgb, vec3(1.0/2.2));
  }
`

// --- UTILS ---

const parseCSV = (csvStr: string) => {
    try {
        const lines = csvStr.trim().split('\n').filter(l => l.trim().length > 0)
        if (lines.length < 2) return []

        const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
        return lines.slice(1).map(line => {
            // regex to handle quoted strings for description
            // simplistic split for now, assuming no commas in description or simple usage
            // For robustness in Framer, we might want a better CSV parser, but simple split is the existing pattern.
            // Let's stick to split for other fields, but for description we might need care.
            // Actually, let's just use split and assume descriptions don't have commas for this simple version
            // OR use a regex for split.
            const values = line.split(',')
            const row: any = {}
            headers.forEach((h, i) => {
                let val = values[i]?.trim()
                // Handle quoted strings roughly
                if (val && val.startsWith('"') && val.endsWith('"')) {
                    val = val.slice(1, -1)
                }

                if (val && !isNaN(Number(val)) && !h.includes("color") && h !== "description") {
                    row[h] = Number(val)
                } else {
                    row[h] = val
                }
            })
            return row
        })
    } catch (e) {
        console.error("CSV Parse Error", e)
        return []
    }
}

// --- COMPONENTS ---

const ClothSimulation = ({
    data,
    playbackSpeed,
    defaultColor,
    defaultWind,
    defaultTurbulence,
    meshResolution,
    onUpdate
}: any) => {
    const meshRef = useRef<THREE.Mesh>(null)
    const materialRef = useRef<THREE.ShaderMaterial>(null)

    // Has Data?
    const hasData = data && data.length > 0
    const hasWind = hasData && "wind" in data[0]
    const hasTurb = hasData && "turbulence" in data[0]
    const hasColor = hasData && "color" in data[0]

    const uniforms = useMemo(() => ({
        uTime: { value: 0 },
        uWindSpeed: { value: defaultWind },
        uTurbulence: { value: defaultTurbulence },
        uDisplacementScale: { value: 5.0 },
        uColor: { value: new THREE.Color(defaultColor) },
        uOpacity: { value: 1.0 }
    }), [])

    useFrame((state, delta) => {
        if (!materialRef.current) return

        materialRef.current.uniforms.uTime.value += delta

        if (hasData) {
            // Data Interpolation
            const totalRows = data.length
            const t = state.clock.elapsedTime * playbackSpeed

            const idx1 = Math.floor(t) % totalRows
            const idx2 = (idx1 + 1) % totalRows
            const factor = t - Math.floor(t)

            const row1 = data[idx1]
            const row2 = data[idx2]

            // Notify parent
            if (onUpdate) onUpdate(row1)

            if (hasWind) {
                const w1 = Number(row1.wind) || defaultWind
                const w2 = Number(row2.wind) || defaultWind
                const w = THREE.MathUtils.lerp(w1, w2, factor)
                materialRef.current.uniforms.uWindSpeed.value = THREE.MathUtils.lerp(materialRef.current.uniforms.uWindSpeed.value, w * 5.0, 0.1)
            }

            if (hasTurb) {
                const t1 = Number(row1.turbulence) || defaultTurbulence
                const t2 = Number(row2.turbulence) || defaultTurbulence
                const turb = THREE.MathUtils.lerp(t1, t2, factor)
                materialRef.current.uniforms.uTurbulence.value = THREE.MathUtils.lerp(materialRef.current.uniforms.uTurbulence.value, turb * 3.0, 0.1)
            }

            if (hasColor) {
                const c1 = new THREE.Color(row1.color || defaultColor)
                const c2 = new THREE.Color(row2.color || defaultColor)
                const finalC = c1.lerp(c2, factor)
                materialRef.current.uniforms.uColor.value.copy(finalC)
            }
        } else {
            // Fallback
            materialRef.current.uniforms.uColor.value.set(defaultColor)
            materialRef.current.uniforms.uWindSpeed.value = defaultWind * 5.0
            materialRef.current.uniforms.uTurbulence.value = defaultTurbulence * 3.0
        }
    })

    // High-res geometry for cloth
    const geometry = useMemo(() => {
        return new THREE.PlaneGeometry(15, 10, meshResolution, meshResolution)
    }, [meshResolution])

    return (
        <mesh ref={meshRef} geometry={geometry} rotation={[-Math.PI / 4, 0, 0]}>
            <shaderMaterial
                ref={materialRef}
                vertexShader={vertexShader}
                fragmentShader={fragmentShader}
                uniforms={uniforms}
                transparent={true}
                side={THREE.DoubleSide}
            />
        </mesh>
    )
}

// --- MAIN WRAPPER ---

export default function FramerDataCloth(props: any) {
    const parsedData = useMemo(() => {
        if (!props.csvData) return []
        return parseCSV(props.csvData)
    }, [props.csvData])

    const [currentDesc, setCurrentDesc] = useState("")

    return (
        <div style={{
            width: "100%",
            height: "100%",
            backgroundColor: props.backgroundColor,
            position: "relative",
            overflow: "hidden"
        }}>
            <Canvas
                dpr={[1, 2]}
                camera={{ position: [0, 0, 12], fov: 40 }}
                gl={{ antialias: true, alpha: true }}
            >
                <ambientLight intensity={0.5} />
                <directionalLight position={[10, 10, 10]} intensity={1} />

                <ClothSimulation
                    data={parsedData}
                    playbackSpeed={props.playbackSpeed}
                    defaultColor={props.clothColor}
                    defaultWind={props.windStrength}
                    defaultTurbulence={props.turbulence}
                    meshResolution={props.resolution}
                    onUpdate={(row: any) => setCurrentDesc(row.description || "")}
                />

                <OrbitControls makeDefault enableZoom={true} enablePan={true} />
            </Canvas>

            {props.showUI && (
                <div style={{
                    position: 'absolute', bottom: 20, left: 20,
                    color: 'rgba(255,255,255,0.7)',
                    fontFamily: 'Inter, sans-serif', fontSize: 11,
                    pointerEvents: 'none',
                    userSelect: 'none',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    alignItems: 'flex-start'
                }}>
                    <div style={{
                        background: 'rgba(0,0,0,0.3)',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        backdropFilter: 'blur(10px)',
                        display: 'flex', gap: '10px', alignItems: 'center'
                    }}>
                        {parsedData.length > 0 ? (
                            <>
                                <div style={{ width: 8, height: 8, background: '#0f0', borderRadius: '50%' }}></div>
                                <span>Data Source Live: {parsedData.length} records</span>
                            </>
                        ) : (
                            <>
                                <div style={{ width: 8, height: 8, background: '#fa0', borderRadius: '50%' }}></div>
                                <span>Simulating (No CSV)</span>
                            </>
                        )}
                    </div>

                    {currentDesc && (
                        <div style={{
                            background: 'rgba(50, 80, 255, 0.2)',
                            borderLeft: '2px solid #5588ff',
                            padding: '8px 12px',
                            borderRadius: '4px',
                            backdropFilter: 'blur(10px)',
                            maxWidth: '300px'
                        }}>
                            <strong style={{ display: 'block', marginBottom: '2px', color: '#fff' }}>Current Event</strong>
                            <span style={{ color: '#ddd' }}>{currentDesc}</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

// --- DEFAULT PROPS & CONTROLS ---

FramerDataCloth.defaultProps = {
    backgroundColor: "#050505",
    clothColor: "#8855ff",
    windStrength: 0.2,
    turbulence: 1.0,
    resolution: 80,
    playbackSpeed: 1.0,
    showUI: true,
    csvData: `time,wind,turbulence,color,description
0,0.1,0.5,#8855ff,"Init"
1,0.3,0.8,#5588ff,"Wind Up"
2,0.6,1.2,#ff5588,"High Turb"
3,0.2,0.4,#55ff88,"Stable"
4,0.1,0.2,#8855ff,"Calm"`
}

addPropertyControls(FramerDataCloth, {
    csvData: {
        type: ControlType.String,
        title: "CSV Data",
        displayTextArea: true,
        placeholder: "time,wind,turbulence,color..."
    },
    playbackSpeed: {
        type: ControlType.Number,
        title: "Speed",
        min: 0.1, max: 10.0, step: 0.1,
        defaultValue: 1.0
    },
    clothColor: {
        type: ControlType.Color,
        title: "Def. Color",
        defaultValue: "#8855ff"
    },
    windStrength: {
        type: ControlType.Number,
        title: "Def. Wind",
        min: 0, max: 1, step: 0.01,
        defaultValue: 0.2
    },
    turbulence: {
        type: ControlType.Number,
        title: "Def. Turb",
        min: 0, max: 1, step: 0.01,
        defaultValue: 1.0
    },
    resolution: {
        type: ControlType.Number,
        title: "Resolution",
        min: 20, max: 200, step: 10,
        defaultValue: 80
    },
    backgroundColor: {
        type: ControlType.Color,
        title: "Bg Color",
        defaultValue: "#050505"
    },
    showUI: {
        type: ControlType.Boolean,
        title: "Show Stats",
        defaultValue: true
    }
})
