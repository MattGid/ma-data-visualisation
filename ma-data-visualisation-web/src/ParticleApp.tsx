import React, { useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { APPLICANTS, Applicant, getCohortIndex, getStatusColor } from './data'

// --- CONSTANTS ---
const COHORTS = [
    { key: 'March 2022', label: 'Mar 2022', color: '#ff6b6b' },
    { key: 'September 2022', label: 'Sep 2022', color: '#ffa502' },
    { key: 'March 2023', label: 'Mar 2023', color: '#ffd93d' },
    { key: 'September 2023', label: 'Sep 2023', color: '#6bcb77' },
    { key: 'March 2024', label: 'Mar 2024', color: '#4d96ff' },
    { key: 'September 2024', label: 'Sep 2024', color: '#9b59b6' },
    { key: 'March 2025', label: 'Mar 2025', color: '#00d2d3' },
    { key: 'September 2025', label: 'Sep 2025', color: '#ff9ff3' },
]

const STATUSES = [
    { key: 'active', label: 'Active', color: '#55ff88' },
    { key: 'completed', label: 'Completed', color: '#ffffff' },
    { key: 'deferred', label: 'Deferred', color: '#ffcc00' },
    { key: 'inactive', label: 'Inactive', color: '#888888' },
    { key: 'withdrawn', label: 'Withdrawn', color: '#ff4444' },
]

const COHORT_X_POSITIONS: Record<number, number> = {
    0: -35, 1: -25, 2: -15, 3: -5, 4: 5, 5: 15, 6: 25, 7: 35
}

// --- STREAM LANES ---
const StreamLanes = ({ activeCohorts }: { activeCohorts: Set<number> }) => {
    return (
        <>
            {COHORTS.map((cohort, i) => {
                const x = COHORT_X_POSITIONS[i]
                const isActive = activeCohorts.size === 0 || activeCohorts.has(i)
                return (
                    <mesh key={cohort.key} position={[x, 0, 0]} rotation={[0, 0, 0]}>
                        <planeGeometry args={[8, 200]} />
                        <meshBasicMaterial
                            color={cohort.color}
                            transparent
                            opacity={isActive ? 0.08 : 0.02}
                            side={THREE.DoubleSide}
                        />
                    </mesh>
                )
            })}
        </>
    )
}

// --- PARTICLE COMPONENT ---
const ParticleLoom = ({
    data,
    speed,
    activeCohorts,
    activeStatuses,
    onHover
}: {
    data: Applicant[],
    speed: number,
    activeCohorts: Set<number>,
    activeStatuses: Set<string>,
    onHover: (d: Applicant | null) => void
}) => {
    const pointsRef = useRef<THREE.Points>(null)
    const { camera, raycaster, pointer } = useThree()

    // Filter data based on active filters
    const filteredData = useMemo(() => {
        return data.filter(d => {
            const cohortIdx = getCohortIndex(d.cohort)
            const cohortMatch = activeCohorts.size === 0 || activeCohorts.has(cohortIdx)

            const statusKey = (d.status || '').toLowerCase()
            const statusMatch = activeStatuses.size === 0 ||
                Array.from(activeStatuses).some(s => statusKey.includes(s))

            return cohortMatch && statusMatch
        })
    }, [data, activeCohorts, activeStatuses])

    // Geometry
    const { positions, colors, sizes } = useMemo(() => {
        const count = filteredData.length
        const positions = new Float32Array(count * 3)
        const colors = new Float32Array(count * 3)
        const sizes = new Float32Array(count)

        for (let i = 0; i < count; i++) {
            const d = filteredData[i]
            const i3 = i * 3

            const cohortIdx = getCohortIndex(d.cohort)
            const baseX = COHORT_X_POSITIONS[cohortIdx] || 0
            const spreadX = (Math.random() - 0.5) * 5

            positions[i3] = baseX + spreadX
            positions[i3 + 1] = (Math.random() - 0.5) * 12
            positions[i3 + 2] = Math.random() * 100 - 50

            // Use COHORT color for streams
            const cohortColor = new THREE.Color(COHORTS[cohortIdx]?.color || '#888888')
            colors[i3] = cohortColor.r
            colors[i3 + 1] = cohortColor.g
            colors[i3 + 2] = cohortColor.b

            sizes[i] = 1.0
        }

        return { positions, colors, sizes }
    }, [filteredData])

    useFrame((state, delta) => {
        if (!pointsRef.current) return

        const posArray = pointsRef.current.geometry.attributes.position.array as Float32Array

        for (let i = 0; i < filteredData.length; i++) {
            const i3 = i * 3
            let z = posArray[i3 + 2]
            z += speed * delta
            if (z > 50) z -= 100
            posArray[i3 + 2] = z
        }
        pointsRef.current.geometry.attributes.position.needsUpdate = true

        raycaster.setFromCamera(pointer, camera)
        raycaster.params.Points.threshold = 1.5

        const intersects = raycaster.intersectObject(pointsRef.current)
        if (intersects.length > 0 && intersects[0].index !== undefined) {
            onHover(filteredData[intersects[0].index])
        } else {
            onHover(null)
        }
    })

    const texture = useMemo(() => {
        return new THREE.TextureLoader().load('https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/sprites/disc.png')
    }, [])

    return (
        <points ref={pointsRef}>
            <bufferGeometry>
                <bufferAttribute attach="attributes-position" count={filteredData.length} array={positions} itemSize={3} />
                <bufferAttribute attach="attributes-color" count={filteredData.length} array={colors} itemSize={3} />
            </bufferGeometry>
            <pointsMaterial size={1.5} vertexColors map={texture} alphaTest={0.5} transparent sizeAttenuation />
        </points>
    )
}

// --- INTERACTIVE BUTTON ---
const FilterButton = ({
    label,
    color,
    isActive,
    onClick
}: {
    label: string,
    color: string,
    isActive: boolean,
    onClick: () => void
}) => (
    <button
        onClick={onClick}
        style={{
            background: isActive ? color : 'rgba(255,255,255,0.1)',
            color: isActive ? '#000' : '#fff',
            border: `2px solid ${color}`,
            padding: '8px 14px',
            borderRadius: '20px',
            cursor: 'pointer',
            fontFamily: 'Inter, sans-serif',
            fontSize: '11px',
            fontWeight: 600,
            transition: 'all 0.2s ease',
            opacity: isActive ? 1 : 0.6,
            boxShadow: isActive ? `0 0 15px ${color}50` : 'none'
        }}
    >
        {label}
    </button>
)

// --- MAIN ---
export default function App() {
    const [hoveredData, setHoveredData] = useState<Applicant | null>(null)
    const [speed, setSpeed] = useState(15)
    const [activeCohorts, setActiveCohorts] = useState<Set<number>>(new Set())
    const [activeStatuses, setActiveStatuses] = useState<Set<string>>(new Set())

    const toggleCohort = (idx: number) => {
        setActiveCohorts(prev => {
            const next = new Set(prev)
            if (next.has(idx)) next.delete(idx)
            else next.add(idx)
            return next
        })
    }

    const toggleStatus = (key: string) => {
        setActiveStatuses(prev => {
            const next = new Set(prev)
            if (next.has(key)) next.delete(key)
            else next.add(key)
            return next
        })
    }

    const clearFilters = () => {
        setActiveCohorts(new Set())
        setActiveStatuses(new Set())
    }

    const stats = useMemo(() => {
        const active = APPLICANTS.filter(a => a.status?.toLowerCase().includes('active')).length
        const completed = APPLICANTS.filter(a => a.status?.toLowerCase().includes('completed')).length
        return { active, completed, total: APPLICANTS.length }
    }, [])

    return (
        <div style={{ width: '100vw', height: '100vh', background: '#000', overflow: 'hidden' }}>
            <Canvas camera={{ position: [0, 15, 40], fov: 55 }} dpr={[1, 2]}>
                <color attach="background" args={['#030308']} />
                <fog attach="fog" args={['#030308', 30, 100]} />

                <StreamLanes activeCohorts={activeCohorts} />
                <ParticleLoom
                    data={APPLICANTS}
                    speed={speed}
                    activeCohorts={activeCohorts}
                    activeStatuses={activeStatuses}
                    onHover={setHoveredData}
                />

                <OrbitControls makeDefault enableZoom enablePan />
            </Canvas>

            {/* TOP: Cohort Filter Buttons */}
            <div style={{
                position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)',
                display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center'
            }}>
                {COHORTS.map((cohort, i) => (
                    <FilterButton
                        key={cohort.key}
                        label={cohort.label}
                        color={cohort.color}
                        isActive={activeCohorts.size === 0 || activeCohorts.has(i)}
                        onClick={() => toggleCohort(i)}
                    />
                ))}
            </div>

            {/* LEFT: Status Filter + Speed */}
            <div style={{
                position: 'absolute', top: 80, left: 20,
                display: 'flex', flexDirection: 'column', gap: '8px'
            }}>
                <div style={{ color: '#888', fontSize: '10px', letterSpacing: '1px', marginBottom: '5px' }}>STATUS</div>
                {STATUSES.map(status => (
                    <FilterButton
                        key={status.key}
                        label={status.label}
                        color={status.color}
                        isActive={activeStatuses.size === 0 || activeStatuses.has(status.key)}
                        onClick={() => toggleStatus(status.key)}
                    />
                ))}

                <div style={{ marginTop: '20px' }}>
                    <div style={{ color: '#888', fontSize: '10px', letterSpacing: '1px', marginBottom: '8px' }}>SPEED</div>
                    <input
                        type="range"
                        min={0}
                        max={50}
                        value={speed}
                        onChange={e => setSpeed(Number(e.target.value))}
                        style={{ width: '100px', accentColor: '#55ff88' }}
                    />
                </div>

                {(activeCohorts.size > 0 || activeStatuses.size > 0) && (
                    <button
                        onClick={clearFilters}
                        style={{
                            marginTop: '10px',
                            background: 'rgba(255,100,100,0.2)',
                            border: '1px solid #ff6666',
                            color: '#ff6666',
                            padding: '8px',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontSize: '10px'
                        }}
                    >
                        Clear Filters
                    </button>
                )}
            </div>

            {/* BOTTOM LEFT: Title */}
            <div style={{
                position: 'absolute', bottom: 30, left: 30,
                color: 'white', fontFamily: 'Inter', pointerEvents: 'none'
            }}>
                <div style={{ fontSize: '28px', fontWeight: 200 }}>IL1 PROGRAMME</div>
                <div style={{ fontSize: '12px', opacity: 0.5 }}>APPLICANT DATA VISUALIZATION</div>
                <div style={{ marginTop: '15px', fontSize: '12px', opacity: 0.7 }}>
                    Total: <strong>{stats.total}</strong> &nbsp;|&nbsp;
                    Active: <strong style={{ color: '#55ff88' }}>{stats.active}</strong> &nbsp;|&nbsp;
                    Completed: <strong>{stats.completed}</strong>
                </div>
            </div>

            {/* TOOLTIP */}
            {hoveredData && (
                <div style={{
                    position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                    background: 'rgba(0,0,0,0.95)', border: `2px solid ${COHORTS[getCohortIndex(hoveredData.cohort)]?.color || '#888'}`,
                    padding: '24px', borderRadius: '12px', backdropFilter: 'blur(10px)',
                    color: 'white', fontFamily: 'Inter', pointerEvents: 'none', textAlign: 'center',
                    zIndex: 100, minWidth: '300px'
                }}>
                    <div style={{ fontSize: '10px', opacity: 0.5, letterSpacing: '2px' }}>APPLICANT</div>
                    <div style={{ fontSize: '22px', fontWeight: 'bold', margin: '8px 0' }}>{hoveredData.fullName}</div>
                    <div style={{ height: '1px', background: 'rgba(255,255,255,0.2)', margin: '12px 0' }} />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '11px', textAlign: 'left' }}>
                        <div><span style={{ opacity: 0.5 }}>STATUS</span><br /><span style={{ color: getStatusColor(hoveredData.status) }}>{hoveredData.status || 'Pending'}</span></div>
                        <div><span style={{ opacity: 0.5 }}>COHORT</span><br />{hoveredData.cohort || 'Unassigned'}</div>
                        <div><span style={{ opacity: 0.5 }}>DEANERY</span><br />{hoveredData.deanery || 'N/A'}</div>
                        <div><span style={{ opacity: 0.5 }}>SIGNED UP</span><br />{hoveredData.signupDate}</div>
                    </div>
                    <div style={{ marginTop: '12px', fontSize: '9px', opacity: 0.4 }}>{hoveredData.email}</div>
                </div>
            )}
        </div>
    )
}
