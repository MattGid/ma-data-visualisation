import React, { useMemo, useRef, useState, useEffect } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Text, Html } from '@react-three/drei'
import { PROCESSED_DATA, STAGES, TERMINAL_COLOR, getDateRange } from './isometric-data'

// --- CONSTANTS ---
const TILE_SIZE = 12;
const TILE_GAP = 4;
const TILE_SPACING = TILE_SIZE + TILE_GAP;
const AWARDED_STAGE_INDEX = 5;
const BUCKET_X = AWARDED_STAGE_INDEX * TILE_SPACING;

const SIDE_BUCKET_X = 2.5 * TILE_SPACING; // Middle of timeline
const SIDE_BUCKET_Z = 24; // To the side

const SPHERE_RADIUS = 0.4;

// --- UTILS ---
const formatDate = (ts: number) => {
    return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// --- PHYSICS CONSTANTS ---
const GRAVITY = -1.5; // Stronger gravity for "heavy" feel
const BOUNCE = 0.15; // Very low bounce (thud)
const FRICTION = 0.90; // High friction/drag
const TIMESTEP = 0.15; // Discrete step for stability

// 1. The Grid (Stage Platforms)
const StageGrid = ({ currentDate }: { currentDate: number }) => {

    // Compute Counts for current frame
    const counts = useMemo(() => {
        const c = { dropped: 0, byStage: new Array(STAGES.length).fill(0) };

        PROCESSED_DATA.forEach(p => {
            // Find latest event up to currentDate
            let lastEvt = null;
            // Events are sorted by generation logic usually, but let's be safe or just assume order
            for (const e of p.events) {
                if (e.date.getTime() <= currentDate) {
                    lastEvt = e;
                } else {
                    break;
                }
            }

            if (lastEvt) {
                if (lastEvt.stage === 'Terminal') {
                    c.dropped++;
                } else {
                    // Find stage index
                    const idx = STAGES.findIndex(s => s.name === lastEvt.stage);
                    if (idx !== -1) {
                        c.byStage[idx]++;
                    }
                }
            }
        });
        return c;
    }, [currentDate]);

    return (
        <group position={[0, -1, 0]}>
            {/* SIDE DROP BUCKET */}
            <group position={[SIDE_BUCKET_X, -2, SIDE_BUCKET_Z]}>
                <mesh position={[0, 0.5, 0]} receiveShadow>
                    <cylinderGeometry args={[12, 12, 1, 32]} />
                    <meshStandardMaterial color="#111" metalness={0.8} roughness={0.2} />
                </mesh>
                {/* Walls */}
                <mesh position={[0, 3, 0]}>
                    <cylinderGeometry args={[12, 12, 6, 32, 1, true]} />
                    <meshPhysicalMaterial
                        color="#ff4444"
                        transparent
                        opacity={0.1}
                        roughness={0.1}
                        metalness={0.1}
                        side={THREE.DoubleSide}
                    />
                </mesh>
                {/* Rim */}
                <mesh position={[0, 6, 0]} rotation={[Math.PI / 2, 0, 0]}>
                    <torusGeometry args={[12, 0.3, 16, 64]} />
                    <meshStandardMaterial color="#ff4444" emissive="#ff4444" emissiveIntensity={0.5} />
                </mesh>
                <Text
                    position={[0, 8, 0]}
                    rotation={[0, -Math.PI / 2, 0]} // Face camera mostly
                    fontSize={2}
                    color="#ff4444"
                    anchorY="middle"
                >
                    DROPPED
                </Text>
                {/* Count Display */}
                <Text
                    position={[0, 10.5, 0]}
                    rotation={[0, -Math.PI / 2, 0]}
                    fontSize={3.5}
                    color="#ff4444"
                    anchorY="middle"
                    fontWeight={700}
                >
                    {counts.dropped}
                </Text>
            </group>

            {STAGES.map((stage, i) => {
                const xPos = i * TILE_SPACING;
                const count = counts.byStage[i];

                // Render Bucket for Awarded Stage
                if (stage.name === 'Awarded') {
                    return (
                        <group key={stage.name}>
                            {/* 1. AWARDED BUCKET (Existing) */}
                            <group position={[xPos, 0, 0]}>
                                {/* Bucket Base */}
                                <mesh position={[0, 0.5, 0]} receiveShadow>
                                    <cylinderGeometry args={[6, 6, 1, 32]} />
                                    <meshStandardMaterial
                                        color="#222"
                                        metalness={0.8}
                                        roughness={0.2}
                                    />
                                </mesh>
                                {/* Bucket Walls */}
                                {/* Transparent glass-like walls */}
                                <mesh position={[0, 3, 0]}>
                                    <cylinderGeometry args={[6, 6, 4, 32, 1, true]} />
                                    <meshPhysicalMaterial
                                        color="#f1c40f"
                                        transparent
                                        opacity={0.1}
                                        roughness={0.1}
                                        metalness={0.1}
                                        side={THREE.DoubleSide}
                                    />
                                </mesh>
                                {/* Rim */}
                                <mesh position={[0, 5, 0]} rotation={[Math.PI / 2, 0, 0]}>
                                    <torusGeometry args={[6, 0.2, 16, 32]} />
                                    <meshStandardMaterial color="#f1c40f" emissive="#f1c40f" emissiveIntensity={0.5} />
                                </mesh>

                                <Text
                                    position={[0, 7, 0]}
                                    fontSize={1.2}
                                    color={stage.color}
                                    anchorY="middle"
                                >
                                    {stage.label}
                                </Text>
                                {/* Count Display */}
                                <Text
                                    position={[0, 9, 0]}
                                    fontSize={2.5}
                                    color={stage.color}
                                    anchorY="middle"
                                    fontWeight={700}
                                >
                                    {count}
                                </Text>
                            </group>

                        </group>
                    );
                }

                return (
                    <group key={stage.name} position={[xPos, 0, 0]}>
                        {/* Floor Tile */}
                        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                            <planeGeometry args={[TILE_SIZE, TILE_SIZE]} />
                            <meshStandardMaterial
                                color={stage.color}
                                transparent
                                opacity={0.1}
                                roughness={0.1}
                                metalness={0.8}
                                side={THREE.DoubleSide}
                            />
                        </mesh>

                        {/* Border/Rim */}
                        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
                            <ringGeometry args={[TILE_SIZE / 2 - 0.2, TILE_SIZE / 2, 4, 1]} />
                            <meshBasicMaterial color={stage.color} opacity={0.5} transparent />
                        </mesh>

                        {/* Label */}
                        <Text
                            position={[0, 4, -TILE_SIZE / 2]}
                            fontSize={1.2}
                            color={stage.color}
                            anchorX="center"
                            anchorY="middle"
                            font="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hjp-Ek-_EeA.woff"
                        >
                            {stage.label}
                        </Text>

                        {/* Count Display */}
                        <Text
                            position={[0, 2, -TILE_SIZE / 2 + 1.5]}
                            rotation={[-Math.PI / 6, 0, 0]} // Tilt slightly up
                            fontSize={2}
                            color={stage.color}
                            anchorX="center"
                            anchorY="middle"
                            fontWeight={700}
                        >
                            {count}
                        </Text>

                        {/* Connector Line to Next */}
                        {i < STAGES.length - 1 && (
                            <mesh position={[TILE_SPACING / 2, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                                <planeGeometry args={[TILE_GAP, 1]} />
                                <meshBasicMaterial color="#333" transparent opacity={0.3} />
                            </mesh>
                        )}
                    </group>
                )
            })}
        </group>
    )
}

// 2. The Applicants (Instanced Spheres)
const Applicants = ({ currentDate }: { currentDate: number }) => {
    const instancesRef = useRef<THREE.InstancedMesh>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);
    const tempObj = useMemo(() => new THREE.Object3D(), []);
    const tempColor = useMemo(() => new THREE.Color(), []);
    const targetColor = useMemo(() => new THREE.Color(), []);

    // New interaction state for manual raycasting
    const [tooltipData, setTooltipData] = useState<any>(null);
    const lastHoveredId = useRef<number | null>(null);

    // Raycaster
    const raycaster = useMemo(() => new THREE.Raycaster(), []);
    const { camera, pointer } = useThree();

    // Physics State
    const velocities = useRef<Float32Array>(new Float32Array(PROCESSED_DATA.length * 3));
    const isDynamic = useRef<boolean[]>(new Array(PROCESSED_DATA.length).fill(false));

    useFrame((state) => {
        if (!instancesRef.current) return;

        const TRAVEL_DURATION_MS = 1000 * 60 * 60 * 24 * 7;
        const time = state.clock.elapsedTime;

        // Active dynamic indices for collision loop
        const dynamicIndices: number[] = [];
        // Active kinematic indices for separation loop
        const kinematicIndices: number[] = [];
        // Store kinematic positions for solving
        const kinematicPositions: Float32Array = new Float32Array(PROCESSED_DATA.length * 3);

        PROCESSED_DATA.forEach((applicant, i) => {
            const events = applicant.events;
            if (events.length === 0) {
                tempObj.scale.set(0, 0, 0);
                tempObj.updateMatrix();
                instancesRef.current!.setMatrixAt(i, tempObj.matrix);
                return;
            }

            // Global Visibility Check
            const firstEvent = events[0];
            if (currentDate < firstEvent.date.getTime()) {
                tempObj.scale.set(0, 0, 0);
                tempObj.updateMatrix();
                instancesRef.current!.setMatrixAt(i, tempObj.matrix);
                return;
            }

            // --- STATE DETERMINATION ---
            // Re-calc current timeline segment
            let prevEvent = events[0];
            let nextEvent = null;
            for (let j = 0; j < events.length; j++) {
                if (events[j].date.getTime() <= currentDate) {
                    prevEvent = events[j];
                } else {
                    nextEvent = events[j];
                    break;
                }
            }

            const isBucketStage = prevEvent.stage === 'Awarded' || prevEvent.stage === 'Terminal';

            let x = 0, y = 0, z = 0;
            // Initialize tempColor for this frame
            tempColor.set(prevEvent.color);
            let currentIsDynamic = false;

            if (isBucketStage) {
                currentIsDynamic = true;
            } else if (nextEvent && (nextEvent.stage === 'Awarded' || nextEvent.stage === 'Terminal')) {
                // Check travel progress
                const nextTime = nextEvent.date.getTime();
                const gap = nextTime - prevEvent.date.getTime();
                const travelDuration = Math.min(gap, TRAVEL_DURATION_MS);
                const startTravelTime = nextTime - travelDuration;

                if (currentDate > startTravelTime) {
                    const p = (currentDate - startTravelTime) / travelDuration;

                    // Interpolate Color
                    targetColor.set(nextEvent.color);
                    tempColor.lerp(targetColor, THREE.MathUtils.clamp(p, 0, 1));

                    if (p > 0.9) { // Drop even later for less overlap
                        currentIsDynamic = true;
                    }
                }
            }

            // --- KINEMATIC (Timeline) UPDATE ---
            if (!currentIsDynamic) {
                // Reset velocity when kinematic/resetting
                velocities.current[i * 3] = 0;
                velocities.current[i * 3 + 1] = 0;
                velocities.current[i * 3 + 2] = 0;
                isDynamic.current[i] = false;

                if (nextEvent) {
                    const nextTime = nextEvent.date.getTime();
                    const gap = nextTime - prevEvent.date.getTime();
                    const travelDuration = Math.min(gap, TRAVEL_DURATION_MS);
                    const startTravelTime = nextTime - travelDuration;

                    if (currentDate < startTravelTime) {
                        // Sitting
                        x = prevEvent.stageIndex * TILE_SPACING;
                        y = SPHERE_RADIUS;
                        z = applicant.offsetZ;
                        x += applicant.offsetX * 0.1;
                    } else {
                        // Traveling
                        const linearP = (currentDate - startTravelTime) / travelDuration;
                        const p = THREE.MathUtils.smoothstep(linearP, 0, 1);

                        const startX = prevEvent.stageIndex * TILE_SPACING;

                        if (nextEvent.stage === 'Awarded') {
                            // Fly to Bucket Rim
                            x = startX + (BUCKET_X - startX) * p;
                            z = applicant.offsetZ + (0 - applicant.offsetZ) * p * 0.5;
                            y = SPHERE_RADIUS + Math.sin(p * Math.PI) * 5 + (p * 5);
                        } else if (nextEvent.stage === 'Terminal') {
                            // Drop at CURRENT stage (don't fly forward)
                            // We handled this by making it dynamic immediately, but if we are here,
                            // it means we are transitioning TO terminal?
                            // Actually, logic in "isBucketStage" catches 'Terminal' immediately if nextEvent is terminal
                            // Wait, if nextEvent is terminal, we set 'currentIsDynamic = true' if close?
                            // See logic at line 230.
                            // If we are here, we are just "traveling" to the drop?
                            // No, if next is Terminal, they should stay at StartX and drop.

                            // Keep them at startX
                            x = startX;
                            // Maybe slight wobble?
                            z = applicant.offsetZ;
                            y = SPHERE_RADIUS;
                        } else {
                            // Normal
                            const endX = nextEvent.stageIndex * TILE_SPACING;
                            x = startX + (endX - startX) * p;
                            z = applicant.offsetZ;
                            y = SPHERE_RADIUS;
                        }

                        // Interpolate Color for Normal Travel
                        targetColor.set(nextEvent.color);
                        tempColor.lerp(targetColor, p);
                    }
                } else {
                    // Stuck/Sitting
                    x = prevEvent.stageIndex * TILE_SPACING;
                    y = SPHERE_RADIUS;
                    z = applicant.offsetZ;
                }

                // Add "Breathing" / Constant Movement to Kinematic State
                const hoverFreq = 1 + (i % 5) * 0.1;
                const hoverAmp = 0.05;
                const bobX = Math.sin(time * hoverFreq + i) * hoverAmp;
                const bobY = Math.cos(time * hoverFreq * 1.1 + i) * hoverAmp;
                const bobZ = Math.sin(time * hoverFreq * 0.9 + i) * hoverAmp;

                x += bobX;
                y += bobY;
                z += bobZ;

                kinematicIndices.push(i);
                kinematicPositions[i * 3] = x;
                kinematicPositions[i * 3 + 1] = y;
                kinematicPositions[i * 3 + 2] = z;

                // We defer setting the matrix until after collision resolution
            } else {
                // --- DYNAMIC (Physics) UPDATE ---
                if (!isDynamic.current[i]) {
                    isDynamic.current[i] = true;
                    // Initial drop logic
                    const isRejected = (prevEvent.stage === 'Terminal');

                    if (isRejected) {
                        // "Throw" to side bucket
                        // Target Position - Tighten spread to ensure they hit inside (Bucket Radius ~5)
                        const targetX = SIDE_BUCKET_X + (Math.random() - 0.5) * 4;
                        const targetZ = SIDE_BUCKET_Z + (Math.random() - 0.5) * 4;

                        // Current Pos (approx)
                        const currX = prevEvent.stageIndex * TILE_SPACING;

                        // Launch Velocity
                        const dx = targetX - currX;
                        const dz = targetZ - 0; // Assuming z=0 start

                        // Simple arc impulse
                        velocities.current[i * 3] = dx * 0.05 + (Math.random() - 0.5) * 0.1;
                        velocities.current[i * 3 + 1] = 0.6 + Math.random() * 0.3; // Jump up (Higher 0.6)
                        velocities.current[i * 3 + 2] = dz * 0.05 + (Math.random() - 0.5) * 0.1;
                    } else {
                        // Awarded drop (standard jitter drop)
                        const stageX = prevEvent.stageIndex * TILE_SPACING;
                        tempObj.position.set(stageX + (Math.random() - 0.5) * 4, 6, (Math.random() - 0.5) * 4);

                        velocities.current[i * 3] = (Math.random() - 0.5) * 0.2;
                        velocities.current[i * 3 + 1] = -0.2 - Math.random() * 0.2;
                        velocities.current[i * 3 + 2] = (Math.random() - 0.5) * 0.2;
                    }
                }

                if (prevEvent.stage === 'Terminal') tempColor.set(TERMINAL_COLOR);
                dynamicIndices.push(i);
            }

            // tempColor is already set/interpolated above
            instancesRef.current!.setColorAt(i, tempColor);
        });

        // --- KINEMATIC COLLISION RESOLUTION (Separation) ---
        // Simple iterative solver to push overlapping waiting spheres apart
        for (let iter = 0; iter < 2; iter++) { // 2 Passes usually enough for stability
            for (let i = 0; i < kinematicIndices.length; i++) {
                const idxA = kinematicIndices[i];
                for (let j = i + 1; j < kinematicIndices.length; j++) {
                    const idxB = kinematicIndices[j];

                    const dx = kinematicPositions[idxA * 3] - kinematicPositions[idxB * 3];
                    const dy = kinematicPositions[idxA * 3 + 1] - kinematicPositions[idxB * 3 + 1];
                    const dz = kinematicPositions[idxA * 3 + 2] - kinematicPositions[idxB * 3 + 2];

                    const distSq = dx * dx + dy * dy + dz * dz;
                    const minDst = SPHERE_RADIUS * 2.2; // slightly larger padding

                    if (distSq < minDst * minDst && distSq > 0.0001) {
                        const dist = Math.sqrt(distSq);
                        const pen = (minDst - dist) * 0.5;
                        const nx = dx / dist;
                        const ny = dy / dist;
                        const nz = dz / dist;

                        // Push apart, but damp Y changes to keep them mostly distinct in X/Z
                        kinematicPositions[idxA * 3] += nx * pen;
                        kinematicPositions[idxA * 3 + 1] += ny * pen * 0.1;
                        kinematicPositions[idxA * 3 + 2] += nz * pen;

                        kinematicPositions[idxB * 3] -= nx * pen;
                        kinematicPositions[idxB * 3 + 1] -= ny * pen * 0.1;
                        kinematicPositions[idxB * 3 + 2] -= nz * pen;
                    }
                }
            }
        }

        // Apply Kinematic Positions
        kinematicIndices.forEach(getIndex => {
            tempObj.position.set(
                kinematicPositions[getIndex * 3],
                kinematicPositions[getIndex * 3 + 1],
                kinematicPositions[getIndex * 3 + 2]
            );
            tempObj.scale.set(1, 1, 1);
            tempObj.updateMatrix();
            instancesRef.current!.setMatrixAt(getIndex, tempObj.matrix);
        });


        // --- BATCH PHYSICS UPDATE (DYNAMIC) ---
        const iMatrix = new THREE.Matrix4();
        const iPos = new THREE.Vector3();
        const iQuat = new THREE.Quaternion();
        const iScale = new THREE.Vector3();

        for (const idx of dynamicIndices) {
            instancesRef.current!.getMatrixAt(idx, iMatrix);
            iMatrix.decompose(iPos, iQuat, iScale);

            const isTerminal = PROCESSED_DATA[idx].isTerminal;

            // 1. Force

            let isFlying = false;

            if (isTerminal) {
                // --- MANUALLY GUIDED FLIGHT LOGIC ---
                // "Magic" flight to ensure they hit the bucket regardless of physics settings
                const dx = SIDE_BUCKET_X - iPos.x;
                const dz = SIDE_BUCKET_Z - iPos.z;
                const distToCenter = Math.sqrt(dx * dx + dz * dz);

                // If we are technically "launching" or "flying" (distance is large)
                // And not already in the bucket
                if (distToCenter > 6) {
                    isFlying = true;
                    // Lerp Velocity towards target to force arrival
                    // We want to arrive in X frames.
                    // Simple homing missile

                    // Normalized direction
                    const nx = dx / distToCenter;
                    const nz = dz / distToCenter;

                    // Speed factor - move quite fast so they don't look floaty
                    const speed = 0.5;

                    // Set Velocity directly
                    velocities.current[idx * 3] = nx * speed + (Math.random() - 0.5) * 0.05;
                    velocities.current[idx * 3 + 2] = nz * speed + (Math.random() - 0.5) * 0.05;

                    // Arc height logic
                    // Distance fraction
                    const initialDist = 50; // Approximated max dist
                    const fraction = Math.min(distToCenter / initialDist, 1);

                    // Desired Height based on distance (parabola)
                    // Close = low, Far = High
                    const desiredY = 4 + (distToCenter * 0.2);

                    // Soft pull to desired height
                    const dy = desiredY - iPos.y;
                    velocities.current[idx * 3 + 1] = dy * 0.1;
                } else {
                    // We are close! Let physics take over to drop them in
                    velocities.current[idx * 3 + 1] += GRAVITY * TIMESTEP;
                }
            } else {
                // --- AWARDED / COMPLETED PARTICLES ---
                // "Vacuum" logic to ensure they end up in the Gold Bucket
                // sometimes they drop early (e.g. stage 4) if data says so, but visually we want them in the final bucket.

                const targetX = BUCKET_X;
                const targetZ = 0;

                const dx = targetX - iPos.x;
                const dz = targetZ - iPos.z;
                const distToCenter = Math.sqrt(dx * dx + dz * dz);

                // If they are not inside the bucket radius (approx 6)
                if (distToCenter > 6) {
                    // Fly them there!
                    const nx = dx / distToCenter;
                    const nz = dz / distToCenter;
                    const speed = 0.4; // Consistent travel speed

                    velocities.current[idx * 3] = nx * speed + (Math.random() - 0.5) * 0.02;
                    velocities.current[idx * 3 + 2] = nz * speed + (Math.random() - 0.5) * 0.02;

                    // Helper Arc
                    const desiredY = 6 + (distToCenter * 0.1);
                    const dy = desiredY - iPos.y;
                    velocities.current[idx * 3 + 1] = dy * 0.1;
                } else {
                    // Inside bucket area: let gravity do its job
                    velocities.current[idx * 3 + 1] += GRAVITY * TIMESTEP;
                    // Mild damping to stop them shooting out
                    velocities.current[idx * 3] *= 0.95;
                    velocities.current[idx * 3 + 2] *= 0.95;
                }
            }

            // 2. Integration
            iPos.x += velocities.current[idx * 3] * TIMESTEP;
            iPos.y += velocities.current[idx * 3 + 1] * TIMESTEP;
            iPos.z += velocities.current[idx * 3 + 2] * TIMESTEP;

            // 3. Constraints (Floors)
            let floorY = -100; // Default abyss
            let bucketRadius = 0;
            let bucketX = 0;
            let bucketZ = 0;

            if (isTerminal) {
                // Side Bucket Logic
                floorY = -0.5; // Inside bucket floor. Visual base is at -2.5 (world).
                // Side Bucket Group is at Y=-2. 
                // Base Mesh is at local Y=0.5 -> World Y = -1.5.
                // So floor should be around -1.5 + Radius(0.4) = -1.1.
                floorY = -1.1;

                bucketRadius = 5.0; // Slightly smaller than visual (6) to keep them in
                bucketX = SIDE_BUCKET_X;
                bucketZ = SIDE_BUCKET_Z;
            } else {
                // Awarded Bucket Logic
                floorY = 0.5; // Awarded base
                // Visual Radius is 6.0 (Cylinder args). 
                // Physics Radius should be close to 6.0 to match.
                bucketRadius = 5.5;
                bucketX = BUCKET_X;
                bucketZ = 0;
            }

            // Floor Collision
            // Only apply floor if we are roughly over the bucket
            const dx = iPos.x - bucketX;
            const dz = iPos.z - bucketZ;
            const dist = Math.sqrt(dx * dx + dz * dz);

            if (dist < bucketRadius + 2) { // Allow slight rim misses to be caught by wall constraint
                if (iPos.y < floorY) {
                    iPos.y = floorY;
                    velocities.current[idx * 3 + 1] *= -BOUNCE; // Thud
                    velocities.current[idx * 3] *= 0.5; // Friction
                    velocities.current[idx * 3 + 2] *= 0.5;
                }
            } else if (iPos.y < -50) {
                // Reset if fell into abyss (safety)
                if (isTerminal) {
                    // Respawn ABOVE bucket to try again
                    iPos.set(SIDE_BUCKET_X + (Math.random() - 0.5) * 2, 10, SIDE_BUCKET_Z + (Math.random() - 0.5) * 2);
                    velocities.current[idx * 3] = 0;
                    velocities.current[idx * 3 + 1] = 0;
                    velocities.current[idx * 3 + 2] = 0;
                } else {
                    // Awarded / In-Progress safety reset
                    // If it belongs in Awarded bucket (last stage), put it there
                    // Otherwise reset to start? Or just hold at y=-50?
                    // Assuming this is mostly for Awarded particles falling out:
                    if (Math.abs(iPos.x - BUCKET_X) < 20) {
                        iPos.set(BUCKET_X + (Math.random() - 0.5) * 4, 10, (Math.random() - 0.5) * 4);
                        velocities.current[idx * 3] = 0;
                        velocities.current[idx * 3 + 1] = 0;
                        velocities.current[idx * 3 + 2] = 0;
                    } else {
                        velocities.current[idx * 3 + 1] = 0;
                        iPos.y = -50;
                    }
                }
            }

            // Cylindrical Constraint (The Bucket Walls)
            const rimHeight = isTerminal ? 4.0 : 5.0;

            if (iPos.y < rimHeight) {
                if (dist > bucketRadius - SPHERE_RADIUS && dist < bucketRadius + 3) {
                    // Hit wall from inside
                    const angle = Math.atan2(dz, dx);
                    const pen = dist - (bucketRadius - SPHERE_RADIUS);

                    // Push in
                    iPos.x -= Math.cos(angle) * pen;
                    iPos.z -= Math.sin(angle) * pen;

                    // Reflect velocity
                    const vNormal = (velocities.current[idx * 3] * Math.cos(angle) + velocities.current[idx * 3 + 2] * Math.sin(angle));
                    velocities.current[idx * 3] -= 1.5 * vNormal * Math.cos(angle);
                    velocities.current[idx * 3 + 2] -= 1.5 * vNormal * Math.sin(angle);

                    velocities.current[idx * 3] *= 0.5;
                    velocities.current[idx * 3 + 2] *= 0.5;
                }
            }

            velocities.current[idx * 3] *= FRICTION;
            velocities.current[idx * 3 + 1] *= FRICTION;
            velocities.current[idx * 3 + 2] *= FRICTION;

            tempObj.position.copy(iPos);
            tempObj.scale.set(1, 1, 1);
            tempObj.updateMatrix();
            instancesRef.current!.setMatrixAt(idx, tempObj.matrix);
        }

        // --- DYNAMIC COLLISION LOOP (Elastic) ---
        const positions = new Float32Array(dynamicIndices.length * 3);
        const ids = dynamicIndices; // map local index to global ID

        dynamicIndices.forEach((idx, i) => {
            instancesRef.current!.getMatrixAt(idx, iMatrix);
            positions[i * 3] = iMatrix.elements[12];
            positions[i * 3 + 1] = iMatrix.elements[13];
            positions[i * 3 + 2] = iMatrix.elements[14];
        });

        // 4 Iterations for stability
        for (let iter = 0; iter < 4; iter++) {
            for (let i = 0; i < dynamicIndices.length; i++) {
                for (let j = i + 1; j < dynamicIndices.length; j++) {
                    const idxA = ids[i];
                    const idxB = ids[j];

                    const dx = positions[i * 3] - positions[j * 3];
                    const dy = positions[i * 3 + 1] - positions[j * 3 + 1];
                    const dz = positions[i * 3 + 2] - positions[j * 3 + 2];
                    const distSq = dx * dx + dy * dy + dz * dz;
                    const minDst = SPHERE_RADIUS * 2;

                    if (distSq < minDst * minDst && distSq > 0.0001) {
                        const dist = Math.sqrt(distSq);
                        const nx = dx / dist;
                        const ny = dy / dist;
                        const nz = dz / dist;

                        // 1. Positional Correction (prevent sinking)
                        const pen = (minDst - dist) * 0.5;
                        positions[i * 3] += nx * pen;
                        positions[i * 3 + 1] += ny * pen;
                        positions[i * 3 + 2] += nz * pen;

                        positions[j * 3] -= nx * pen;
                        positions[j * 3 + 1] -= ny * pen;
                        positions[j * 3 + 2] -= nz * pen;

                        // 2. Velocity Response (Elastic Bounce)
                        // Relative velocity
                        const vx = velocities.current[idxA * 3] - velocities.current[idxB * 3];
                        const vy = velocities.current[idxA * 3 + 1] - velocities.current[idxB * 3 + 1];
                        const vz = velocities.current[idxA * 3 + 2] - velocities.current[idxB * 3 + 2];

                        const dot = vx * nx + vy * ny + vz * nz;

                        if (dot < 0) { // Only if moving towards each other
                            // Coefficient of Restitution (bounciness)
                            const e = 0.6; // Bouncy!
                            const jVal = -(1 + e) * dot;
                            // Assuming equal mass = 1
                            const impulse = jVal * 0.5; // 1/mass1 + 1/mass2 = 2

                            velocities.current[idxA * 3] += nx * impulse;
                            velocities.current[idxA * 3 + 1] += ny * impulse;
                            velocities.current[idxA * 3 + 2] += nz * impulse;

                            velocities.current[idxB * 3] -= nx * impulse;
                            velocities.current[idxB * 3 + 1] -= ny * impulse;
                            velocities.current[idxB * 3 + 2] -= nz * impulse;
                        }
                    }
                }
            }
        }

        dynamicIndices.forEach((idx, i) => {
            tempObj.position.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
            tempObj.scale.set(1, 1, 1);
            tempObj.updateMatrix();
            instancesRef.current!.setMatrixAt(idx, tempObj.matrix);
        });

        instancesRef.current.instanceMatrix.needsUpdate = true;
        if (instancesRef.current.instanceColor) instancesRef.current.instanceColor.needsUpdate = true;

        // --- 2. MANUAL RAYCASTING (Robust Interaction) ---
        raycaster.setFromCamera(pointer, camera);
        const intersects = raycaster.intersectObject(instancesRef.current);

        if (intersects.length > 0) {
            const instanceId = intersects[0].instanceId;
            if (instanceId !== undefined && instanceId !== lastHoveredId.current) {
                lastHoveredId.current = instanceId;
                setTooltipData(PROCESSED_DATA[instanceId]);
            }

            // Update Tooltip Position
            if (tooltipRef.current) {
                instancesRef.current.getMatrixAt(instanceId!, iMatrix);
                iMatrix.decompose(iPos, iQuat, iScale);
                iPos.y += 1.5;

                // Project to 2D
                iPos.project(camera);
                const x = (iPos.x * .5 + .5) * window.innerWidth;
                const y = (-(iPos.y * .5) + .5) * window.innerHeight;

                tooltipRef.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
                tooltipRef.current.style.display = 'block';
            }
        } else {
            if (lastHoveredId.current !== null) {
                lastHoveredId.current = null;
                setTooltipData(null);
                if (tooltipRef.current) tooltipRef.current.style.display = 'none';
            }
        }
    });

    return (
        <group>
            {/* TRAIL RENDERER */}
            <ParticleTrails count={PROCESSED_DATA.length} instancesRef={instancesRef} />

            {/* Mesh with frustumCulled=false to ensure raycasting works even if origin is off screen */}
            <instancedMesh ref={instancesRef} args={[undefined, undefined, PROCESSED_DATA.length]} frustumCulled={false}>
                <sphereGeometry args={[SPHERE_RADIUS, 16, 16]} />
                <meshStandardMaterial toneMapped={false} emissiveIntensity={2} />
            </instancedMesh>

            {/* HTML Tooltip Overlay Container */}
            <Html as='div' wrapperClass="tooltip-layer" center style={{ position: 'absolute', top: 0, left: 0, width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: 100 }}>
                <div
                    ref={tooltipRef}
                    style={{
                        position: 'absolute',
                        top: 0, left: 0,
                        display: 'none',
                        willChange: 'transform'
                    }}
                >
                    {tooltipData && (
                        <div style={{
                            background: 'rgba(0,0,0,0.85)',
                            padding: '10px 14px',
                            borderRadius: '8px',
                            border: '1px solid rgba(255,255,255,0.2)',
                            backdropFilter: 'blur(8px)',
                            color: '#fff',
                            fontSize: '12px',
                            fontFamily: 'Inter, sans-serif',
                            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                            transform: 'translate(-50%, -100%) translateY(-10px)',
                            whiteSpace: 'nowrap',
                            pointerEvents: 'none'
                        }}>
                            <div style={{ fontWeight: '700', marginBottom: '4px', fontSize: '13px' }}>
                                {tooltipData.originalData.firstName} {tooltipData.originalData.lastName}
                            </div>
                            <div style={{ color: '#ccc', fontSize: '11px' }}>
                                <span style={{ opacity: 0.6 }}>Status:</span> {tooltipData.originalData.status}
                            </div>
                            <div style={{ color: '#aaa', fontSize: '11px' }}>
                                <span style={{ opacity: 0.6 }}>Cohort:</span> {tooltipData.originalData.cohort}
                            </div>
                        </div>
                    )}
                </div>
            </Html>
        </group>
    );
};

// --- TRAIL COMPONENT ---
const ParticleTrails = ({ count, instancesRef }: { count: number, instancesRef: React.RefObject<THREE.InstancedMesh> }) => {
    const lineRef = useRef<THREE.LineSegments>(null);
    const SEGMENTS = 5; // Trail length

    // Buffer for history: [ParticleID][SegmentHistory][x,y,z]
    // Flat: count * SEGMENTS * 3
    const historyRef = useRef<Float32Array>(new Float32Array(count * SEGMENTS * 3));
    const initializedRef = useRef<boolean[]>(new Array(count).fill(false));

    // Update geometry frame-by-frame
    // We render (SEGMENTS - 1) lines per particle
    const positionsRef = useRef<Float32Array>(new Float32Array(count * (SEGMENTS - 1) * 2 * 3));
    const colorsRef = useRef<Float32Array>(new Float32Array(count * (SEGMENTS - 1) * 2 * 3));

    // Temp vars
    const tempMat = useMemo(() => new THREE.Matrix4(), []);
    const tempPos = useMemo(() => new THREE.Vector3(), []);
    const tempScale = useMemo(() => new THREE.Vector3(), []);
    const tempQuat = useMemo(() => new THREE.Quaternion(), []);

    useFrame(() => {
        if (!instancesRef.current || !lineRef.current) return;

        const history = historyRef.current;
        const positions = positionsRef.current;
        const colors = colorsRef.current;
        const initialized = initializedRef.current;

        // For each particle
        for (let i = 0; i < count; i++) {
            // Get current pos
            instancesRef.current.getMatrixAt(i, tempMat);
            tempMat.decompose(tempPos, tempQuat, tempScale);

            const baseOff = i * SEGMENTS * 3;

            // Check visibility based on scale
            if (tempScale.x < 0.1) {
                // If previously initialized, we need to clear/hide its trail
                if (initialized[i]) {
                    // Reset history to 0 or current pos (effectively collapsing it)
                    for (let s = 0; s < SEGMENTS; s++) {
                        history[baseOff + s * 3] = tempPos.x;
                        history[baseOff + s * 3 + 1] = tempPos.y;
                        history[baseOff + s * 3 + 2] = tempPos.z;
                    }
                    initialized[i] = false;
                }

                // Hide geometry by setting verts to 0
                for (let s = 0; s < SEGMENTS - 1; s++) {
                    const idx = (i * (SEGMENTS - 1) + s) * 2 * 3;
                    for (let k = 0; k < 6; k++) positions[idx + k] = 0;
                }
                continue;
            }

            // Initialization logic
            if (!initialized[i]) {
                for (let s = 0; s < SEGMENTS; s++) {
                    history[baseOff + s * 3] = tempPos.x;
                    history[baseOff + s * 3 + 1] = tempPos.y;
                    history[baseOff + s * 3 + 2] = tempPos.z;
                }
                initialized[i] = true;
            }

            // Cycle History: Shift old values down
            // history[0] is Head (Current). history[SEGMENTS-1] is Tail.
            // Move: 0->1, 1->2... 
            history.copyWithin(baseOff + 3, baseOff, baseOff + (SEGMENTS - 1) * 3);

            // Update Head
            history[baseOff] = tempPos.x;
            history[baseOff + 1] = tempPos.y;
            history[baseOff + 2] = tempPos.z;

            // Update Line Geometry from History
            // We have (SEGMENTS - 1) segments.
            // Segment 0 connects History[0] (Head) -> History[1]
            // Segment 1 connects History[1] -> History[2]
            for (let s = 0; s < SEGMENTS - 1; s++) {
                const hIdx1 = baseOff + s * 3;
                const hIdx2 = baseOff + (s + 1) * 3;

                const pIdx = (i * (SEGMENTS - 1) + s) * 2 * 3;

                // Vertex 1
                positions[pIdx] = history[hIdx1];
                positions[pIdx + 1] = history[hIdx1 + 1];
                positions[pIdx + 2] = history[hIdx1 + 2];

                // Vertex 2
                positions[pIdx + 3] = history[hIdx2];
                positions[pIdx + 4] = history[hIdx2 + 1];
                positions[pIdx + 5] = history[hIdx2 + 2];

                // Colors (Cyan/Gold fade)
                // Head is bright (alpha=1), Tail is faded (alpha=0)
                const alpha1 = 1.0 - (s / (SEGMENTS - 2 + 1));
                const alpha2 = 1.0 - ((s + 1) / (SEGMENTS - 2 + 1));
                // Clamp alpha
                const a1 = Math.max(0, alpha1);
                const a2 = Math.max(0, alpha2);

                const R = 0.2; const G = 0.9; const B = 1.0; // Cyan

                colors[pIdx] = R * a1; colors[pIdx + 1] = G * a1; colors[pIdx + 2] = B * a1;
                colors[pIdx + 3] = R * a2; colors[pIdx + 4] = G * a2; colors[pIdx + 5] = B * a2;
            }
        }

        lineRef.current.geometry.attributes.position.needsUpdate = true;
        lineRef.current.geometry.attributes.color.needsUpdate = true;
    });

    return (
        <lineSegments ref={lineRef} frustumCulled={false}>
            <bufferGeometry>
                <bufferAttribute
                    attach="attributes-position"
                    count={count * (SEGMENTS - 1) * 2}
                    array={positionsRef.current}
                    itemSize={3}
                />
                <bufferAttribute
                    attach="attributes-color"
                    count={count * (SEGMENTS - 1) * 2}
                    array={colorsRef.current}
                    itemSize={3}
                />
            </bufferGeometry>
            <lineBasicMaterial vertexColors transparent opacity={0.5} blending={THREE.AdditiveBlending} depthWrite={false} linewidth={2} />
        </lineSegments>
    )
}

// 3. Main Scene
const Scene = ({ currentDate }: { currentDate: number }) => {
    return (
        <>
            <ambientLight intensity={0.5} />
            <directionalLight position={[10, 20, 10]} intensity={1} castShadow />
            <StageGrid currentDate={currentDate} />
            <Applicants currentDate={currentDate} />
        </>
    )
}

// 4. UI Overlay
const UIOverlay = ({
    currentDate,
    setCurrentDate,
    dateRange,
    isPlaying,
    setIsPlaying,
    speedMultiplier,
    setSpeedMultiplier
}: any) => {
    return (
        <div style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            width: '100%',
            padding: '20px 40px',
            background: 'linear-gradient(to top, #000 0%, transparent 100%)',
            color: 'white',
            fontFamily: 'Inter, sans-serif'
        }}>
            {/* Speed Control (Moved to Left, Above Player) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <span style={{ fontSize: '10px', fontWeight: 600, opacity: 0.5, letterSpacing: '0.5px' }}>SPEED</span>
                <input
                    type="range"
                    min="0.1"
                    max="50"
                    step="0.1"
                    value={speedMultiplier}
                    onChange={(e) => setSpeedMultiplier(parseFloat(e.target.value))}
                    style={{ width: '100px', accentColor: '#55ff88', cursor: 'pointer', height: '4px' }}
                />
                <span style={{ fontSize: '12px', fontWeight: 700, minWidth: '40px', color: '#55ff88' }}>{speedMultiplier.toFixed(1)}x</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '10px' }}>
                <button
                    onClick={() => setIsPlaying(!isPlaying)}
                    style={{
                        background: isPlaying ? '#ff4444' : '#55ff88',
                        border: 'none',
                        borderRadius: '50%',
                        width: '40px',
                        height: '40px',
                        color: isPlaying ? 'white' : 'black',
                        cursor: 'pointer',
                        fontWeight: 'bold',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                    }}
                >
                    {isPlaying ? '⏸' : '▶'}
                </button>
                <div style={{ fontSize: '24px', fontWeight: 300, letterSpacing: '-0.5px' }}>
                    {formatDate(currentDate)}
                </div>
            </div>

            <input
                type="range"
                min={dateRange.min}
                max={dateRange.max}
                value={currentDate}
                onChange={(e) => {
                    setIsPlaying(false);
                    setCurrentDate(Number(e.target.value));
                }}
                style={{
                    width: '100%',
                    accentColor: '#55ff88',
                    cursor: 'pointer'
                }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', opacity: 0.5, marginTop: '5px' }}>
                <span>2020</span>
                <span>2021</span>
                <span>2022</span>
                <span>2023</span>
                <span>2024</span>
                <span>2025</span>
                <span>2026</span>
            </div>
        </div>
    )
}

// 5. Main App
import { APPLICANTS } from './data';

export default function IsometricApplicantFlow() {
    const dateRange = useMemo(() => getDateRange(), []);
    const [currentDate, setCurrentDate] = useState(dateRange.min);
    const [isPlaying, setIsPlaying] = useState(true);
    const [speedMultiplier, setSpeedMultiplier] = useState(1.0);

    // Animation Loop for Slider
    useEffect(() => {
        let frameId: number;
        if (isPlaying) {
            const loop = () => {
                setCurrentDate(prev => {
                    // Base speed: 4 hours per frame (~10 days/sec at 60fps)
                    // Multiplier scales this
                    const baseSpeed = 1000 * 60 * 60 * 4;
                    const next = prev + (baseSpeed * speedMultiplier);
                    if (next > dateRange.max) {
                        return dateRange.min; // Loop
                    }
                    return next;
                });
                frameId = requestAnimationFrame(loop);
            }
            frameId = requestAnimationFrame(loop);
        }
        return () => cancelAnimationFrame(frameId);
    }, [isPlaying, dateRange, speedMultiplier]);

    return (
        <div style={{ width: '100vw', height: '100vh', background: '#050505', position: 'relative', overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ position: 'absolute', top: 30, left: 30, zIndex: 60, color: 'white', fontFamily: 'Inter', pointerEvents: 'none' }}>
                <div style={{ pointerEvents: 'auto' }}>
                    <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 600, letterSpacing: '-0.5px' }}>APPLICANT FLOW</h1>
                    <p style={{ margin: 0, opacity: 0.5, fontSize: '12px' }}>Isometric Cohort Visualization</p>
                </div>
            </div>

            <Canvas
                orthographic
                camera={{ zoom: 15, position: [50, 50, 50], near: -100, far: 500 }}
                gl={{ antialias: true, alpha: false, stencil: false }}
            >
                <color attach="background" args={['#050505']} />
                <OrbitControls makeDefault enableZoom={true} enableRotate={true} minZoom={5} maxZoom={30} target={[STAGES.length * TILE_SPACING / 2, 0, 0]} />
                <Scene currentDate={currentDate} />
            </Canvas>

            <UIOverlay
                currentDate={currentDate}
                setCurrentDate={setCurrentDate}
                dateRange={dateRange}
                isPlaying={isPlaying}
                setIsPlaying={setIsPlaying}
                speedMultiplier={speedMultiplier}
                setSpeedMultiplier={setSpeedMultiplier}
            />


        </div>
    )
}
