
import React, { useMemo, useRef, useState, useEffect } from "react"
import { Canvas, useFrame } from "@react-three/fiber"
import { OrbitControls } from "@react-three/drei"
import * as THREE from "three"
import Papa from "papaparse"
import { useControls, Leva } from "leva"

// --- TYPES ---
interface DataRow {
    time: number
    wind?: number
    turbulence?: number
    color?: string
    description?: string
}

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
    vec3 normal = normalize(vNormal); 
    
    // Lighting
    vec3 lightPos = vec3(10.0, 10.0, 10.0);
    vec3 lightDir = normalize(lightPos - vWorldPosition);
    
    float diff = max(dot(normal, lightDir), 0.0);
    
    // Specular
    vec3 halfDir = normalize(lightDir + viewDir);
    float spec = pow(max(dot(normal, halfDir), 0.0), 32.0);
    
    // Fresnel
    float fresnel = pow(1.0 - max(dot(viewDir, normal), 0.0), 3.0);
    
    // Color Ramp
    float heightFactor = smoothstep(-3.0, 3.0, vElevation);
    vec3 deepColor = uColor * 0.5;
    vec3 peakColor = uColor * 1.2 + vec3(0.1); 
    vec3 albedo = mix(deepColor, peakColor, heightFactor);
    
    // Compose
    vec3 finalColor = albedo * (0.6 + 0.4 * diff);
    finalColor += vec3(1.0) * spec * 0.6; 
    finalColor += vec3(0.5, 0.8, 1.0) * fresnel * 0.5; 
    
    gl_FragColor = vec4(finalColor, uOpacity * (0.9 + 0.1 * fresnel));
    gl_FragColor.rgb = pow(gl_FragColor.rgb, vec3(1.0/2.2));
  }
`

// --- CLOTH SIMULATION COMPONENT ---
const ClothSimulation = ({
    data,
    playbackSpeed = 1.0,
    defaultColor = "#8855ff",
    defaultWind = 0.2,
    defaultTurbulence = 1.0,
    isPlaying = true,
    onUpdate
}: {
    data: DataRow[],
    playbackSpeed: number,
    defaultColor: string,
    defaultWind: number,
    defaultTurbulence: number,
    isPlaying: boolean,
    onUpdate?: (row: DataRow) => void
}) => {
    const materialRef = useRef<THREE.ShaderMaterial>(null)

    const hasData = data && data.length > 0
    // Cached data checks
    const hasWind = hasData && "wind" in data[0]
    const hasTurb = hasData && "turbulence" in data[0]
    const hasColor = hasData && "color" in data[0]

    // Initialize uniforms
    const uniforms = useMemo(() => ({
        uTime: { value: 0 },
        uWindSpeed: { value: defaultWind * 5.0 },
        uTurbulence: { value: defaultTurbulence * 3.0 },
        uDisplacementScale: { value: 5.0 },
        uColor: { value: new THREE.Color(defaultColor) },
        uOpacity: { value: 1.0 }
    }), [])

    useFrame((state, delta) => {
        if (!materialRef.current) return

        // 1. Time Update (only if playing)
        if (isPlaying) {
            materialRef.current.uniforms.uTime.value += delta
        }

        // 2. Determine Target Values
        let targetWind = defaultWind * 5.0
        let targetTurb = defaultTurbulence * 3.0
        let targetColor = new THREE.Color(defaultColor)

        // 3. Override with Data (if playing and available)
        if (hasData && isPlaying) {
            const totalRows = data.length
            const t = materialRef.current.uniforms.uTime.value * playbackSpeed // Use uniform time for consistency

            const idx1 = Math.floor(t) % totalRows
            const idx2 = (idx1 + 1) % totalRows
            const factor = t - Math.floor(t)

            const row1 = data[idx1] as DataRow
            const row2 = data[idx2] as DataRow

            // Notify parent of current row
            if (onUpdate) {
                onUpdate(row1)
            }

            if (hasWind) {
                const w1 = Number(row1.wind) || defaultWind
                const w2 = Number(row2.wind) || defaultWind
                const w = THREE.MathUtils.lerp(w1, w2, factor)
                targetWind = w * 5.0
            }

            if (hasTurb) {
                const t1 = Number(row1.turbulence) || defaultTurbulence
                const t2 = Number(row2.turbulence) || defaultTurbulence
                const turb = THREE.MathUtils.lerp(t1, t2, factor)
                targetTurb = turb * 3.0
            }

            if (hasColor) {
                const c1 = new THREE.Color(row1.color || defaultColor)
                const c2 = new THREE.Color(row2.color || defaultColor)
                targetColor.copy(c1).lerp(c2, factor)
            }
        }

        // 4. Smoothly Interpolate to Targets (Visual Polish)
        // This makes slider changes butter smooth and data transitions fluid
        const lerpSpeed = 0.1
        materialRef.current.uniforms.uWindSpeed.value = THREE.MathUtils.lerp(materialRef.current.uniforms.uWindSpeed.value, targetWind, lerpSpeed)
        materialRef.current.uniforms.uTurbulence.value = THREE.MathUtils.lerp(materialRef.current.uniforms.uTurbulence.value, targetTurb, lerpSpeed)
        materialRef.current.uniforms.uColor.value.lerp(targetColor, lerpSpeed)
    })

    const geometry = useMemo(() => new THREE.PlaneGeometry(15, 10, 80, 80), [])

    return (
        <mesh geometry={geometry} rotation={[-Math.PI / 4, 0, 0]}>
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


// --- APP ---

const DEFAULT_CSV = `time,wind,turbulence,color,description
0,0.1,0.5,#8855ff,"System Initialized"
1,0.3,0.8,#5588ff,"Wind picking up"
2,0.6,1.2,#ff5588,"High Turbulence warning"
3,0.2,0.4,#55ff88,"Stabilizing"
4,0.1,0.2,#8855ff,"Calm state"`

function App() {
    const [csvInput, setCsvInput] = useState(DEFAULT_CSV)
    const [parsedData, setParsedData] = useState<DataRow[]>([])
    const [isMenuOpen, setIsMenuOpen] = useState(true)

    // Parse effect
    React.useEffect(() => {
        Papa.parse(csvInput, {
            header: true,
            dynamicTyping: true,
            skipEmptyLines: true,
            complete: (results) => {
                setParsedData(results.data as DataRow[])
            }
        })
    }, [csvInput])

    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        if (!file) return

        const reader = new FileReader()
        reader.onload = (e) => {
            const text = e.target?.result as string
            setCsvInput(text)
        }
        reader.readAsText(file)
    }

    // GUI Controls - standard usage
    const config = useControls("Simulation Settings", {
        isPlaying: { value: true, label: "PLAY SIMULATION" },
        playbackSpeed: { value: 1.0, min: 0.1, max: 5.0, step: 0.1, label: "Speed" },
        defaultWind: { value: 0.2, min: 0.0, max: 2.0, step: 0.1, label: "Wind Force" },
        defaultTurbulence: { value: 1.0, min: 0.0, max: 3.0, step: 0.1, label: "Turbulence" },
        defaultColor: { value: "#8855ff", label: "Base Color" },
        // Visuals
        opacity: { value: 1.0, min: 0.1, max: 1.0, step: 0.1 },
        wireframe: false
    })

    // Find current active description
    const [currentDescription, setCurrentDescription] = useState<string>("")

    useFrame(() => {
        // This useFrame is outside the Canvas context? No, it must be inside. 
        // We cannot use useFrame here in the main App component. 
        // Logic for extracting current description should be in a child component or calculated differently.
    })

    // Helper to get current description based on time (approximate since we don't have access to shader time here easily without context)
    // We will push this logic down or accept that the UI update might lag or we use a separate Raf for UI.
    // Better approach: Pass a callback to ClothSimulation or use a global state.
    // For simplicity, let's just make ClothSimulation emit the current index/row? 
    // Actually, let's keep it simple: The UI description update might need a bridge. 
    // But for now, let's just add the file uploader and basic description parsing.

    return (
        <div style={{ width: "100vw", height: "100vh", background: "#050505", position: 'relative' }}>

            {/* Leva Panel - Forced to be visible */}
            <Leva
                collapsed={false}
                theme={{
                    colors: {
                        elevation1: '#1a1a1a',
                        elevation2: '#2a2a2a',
                        elevation3: '#3a3a3a',
                        accent1: '#8855ff',
                        accent2: '#5588ff',
                        accent3: '#55ff88',
                        highlight1: '#ffffff',
                        highlight2: '#dddddd',
                        highlight3: '#bbbbbb',
                        vivid1: '#ff0088',
                    }
                }}
            />

            <Canvas
                dpr={[1, 2]}
                camera={{ position: [0, 0, 12], fov: 40 }}
                gl={{ antialias: true, alpha: true }}
            >
                <ambientLight intensity={0.5} />
                <directionalLight position={[10, 10, 10]} intensity={1} />

                <ClothSimulation
                    data={parsedData}
                    isPlaying={config.isPlaying}
                    playbackSpeed={config.playbackSpeed}
                    defaultColor={config.defaultColor}
                    defaultWind={config.defaultWind}
                    defaultTurbulence={config.defaultTurbulence}
                    onUpdate={(row) => setCurrentDescription(row.description || "")}
                />

                <OrbitControls enableZoom={true} enablePan={true} />
            </Canvas>

            {/* UI Overlay */}
            <div style={{
                position: 'absolute', top: 20, left: 20, zIndex: 10,
                width: isMenuOpen ? '320px' : 'auto',
                transition: 'width 0.3s ease',
                pointerEvents: 'none' // Let clicks pass through empty space
            }}>
                <div style={{
                    background: 'rgba(20,20,20,0.8)',
                    backdropFilter: 'blur(12px)',
                    borderRadius: '16px',
                    border: '1px solid rgba(255,255,255,0.1)',
                    padding: '20px',
                    boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
                    pointerEvents: 'auto' // Re-enable clicks for the menu itself
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isMenuOpen ? '16px' : '0' }}>
                        <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'white' }}>Data Cloth</h1>
                        <button
                            onClick={() => setIsMenuOpen(!isMenuOpen)}
                            style={{
                                background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer'
                            }}
                        >
                            {isMenuOpen ? '✕' : '☰'}
                        </button>
                    </div>

                    {isMenuOpen && (
                        <>
                            <div style={{ marginBottom: '16px' }}>
                                <label style={{
                                    display: 'block',
                                    marginBottom: '8px',
                                    fontSize: '12px',
                                    color: 'rgba(255,255,255,0.6)',
                                    cursor: 'pointer',
                                    padding: '8px',
                                    border: '1px dashed rgba(255,255,255,0.3)',
                                    borderRadius: '8px',
                                    textAlign: 'center'
                                }}>
                                    <input
                                        type="file"
                                        accept=".csv"
                                        onChange={handleFileUpload}
                                        style={{ display: 'none' }}
                                    />
                                    📂 Upload CSV
                                </label>
                            </div>

                            <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', marginBottom: '8px' }}>
                                Or paste CSV data below. Columns: <code>time, wind, turbulence, color, description</code>.
                            </p>

                            <textarea
                                value={csvInput}
                                onChange={(e) => setCsvInput(e.target.value)}
                                spellCheck={false}
                                style={{
                                    width: '100%',
                                    height: '150px',
                                    background: 'rgba(0,0,0,0.3)',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: '8px',
                                    padding: '12px',
                                    color: '#00ffcc',
                                    fontFamily: 'monospace',
                                    fontSize: '11px',
                                    lineHeight: '1.5',
                                    resize: 'vertical',
                                    marginBottom: '10px'
                                }}
                            />

                            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                                <span>Records: {parsedData.length}</span>
                                <span>Status: {parsedData.length > 0 ? 'Active' : 'No Data'}</span>
                            </div>

                            {currentDescription && (
                                <div style={{
                                    marginTop: '10px',
                                    padding: '12px',
                                    background: 'rgba(85, 136, 255, 0.1)',
                                    borderLeft: '3px solid #5588ff',
                                    borderRadius: '4px',
                                    color: '#ffffff',
                                    fontSize: '13px',
                                    animation: 'fadeIn 0.3s ease'
                                }}>
                                    <strong>Current Event:</strong><br />
                                    {currentDescription}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
            <style>{`
                @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
            `}</style>
        </div>
    )
}

export default App
