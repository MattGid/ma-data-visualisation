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
const StageGrid = () => {
    return (
        <group position={[0, -1, 0]}>
            {STAGES.map((stage, i) => {
                const xPos = i * TILE_SPACING;

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

                        {/* DROP BUCKET (Underneath) */}
                        <group position={[0, -4, 0]}>
                            {/* Bucket Base */}
                            <mesh position={[0, 0.5, 0]} receiveShadow>
                                <cylinderGeometry args={[5, 5, 1, 32]} />
                                <meshStandardMaterial color="#111" metalness={0.8} roughness={0.2} />
                            </mesh>
                            {/* Bucket Walls */}
                            <mesh position={[0, 2.5, 0]}>
                                <cylinderGeometry args={[5, 5, 4, 32, 1, true]} />
                                <meshPhysicalMaterial
                                    color="#ff4444"
                                    transparent
                                    opacity={0.05}
                                    roughness={0.1}
                                    metalness={0.1}
                                    side={THREE.DoubleSide}
                                />
                            </mesh>
                            {/* Rim */}
                            <mesh position={[0, 4.5, 0]} rotation={[Math.PI / 2, 0, 0]}>
                                <torusGeometry args={[5, 0.1, 8, 32]} />
                                <meshStandardMaterial color="#ff4444" emissive="#ff4444" emissiveIntensity={0.2} />
                            </mesh>
                        </group>

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
                    // Initial drop logic
                    const isRejected = (prevEvent.stage === 'Terminal');

                    const randX = (Math.random() - 0.5) * 4;
                    const randZ = (Math.random() - 0.5) * 4;

                    // Drop at the CURRENT stage index (prevEvent.stageIndex)
                    const stageX = prevEvent.stageIndex * TILE_SPACING;

                    tempObj.position.set(
                        stageX + randX, // Local to stage
                        6 + Math.random() * 2, // Drop height
                        randZ // Local jitter
                    );

                    velocities.current[i * 3] = (Math.random() - 0.5) * 0.2;
                    velocities.current[i * 3 + 1] = -0.2 - Math.random() * 0.2;
                    velocities.current[i * 3 + 2] = (Math.random() - 0.5) * 0.2;
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

            // 1. Force
            velocities.current[idx * 3 + 1] += GRAVITY * TIMESTEP;

            // 2. Integration
            iPos.x += velocities.current[idx * 3] * TIMESTEP;
            iPos.y += velocities.current[idx * 3 + 1] * TIMESTEP;
            iPos.z += velocities.current[idx * 3 + 2] * TIMESTEP;

            // 3. Constraints
            if (iPos.y < SPHERE_RADIUS + 0.5) {
                // If in a drop bucket (Terminal), floor is lower?
                // Visual bucket is at Y= -4. Base at Y=-3.5 (since base is 1 unit thick at y=0.5 relative to group -4?)
                // Group is at -4. Base is at 0.5 relative. So Base Top is at -4 + 0.5 + 0.5 = -3.
                // Floor Tile is at Y=0.

                // If 'Terminal', they should be allowed to fall to -3.
                // We need to know if this specific particle is Terminal.
                // We can check if it's "Rejected" by checking if it matches the 'Terminal' criteria?
                // Or we store it?
                // Hack: Check if we are "in" a bucket radius (X near stage center) AND below 0?
                // The physics loop doesn't know 'prevEvent' here easily without lookup.
                // BUT, we changed 'isRejected' logic above to just be based on Z. That won't work anymore since Z is normal.

                // Let's assume height floor is 0 by default.
                // If we want them to fall, we need to let them pass Y=0 if they are 'Terminal'.
                // But we don't have per-particle state here in the batch loop easily.

                // However! We only add particles to 'dynamicIndices' if they are Awarded or Terminal.
                // Awarded go to BUCKET_X (last stage). Terminal go to other stages.
                // So check X position?

                const isAwardedBucket = Math.abs(iPos.x - BUCKET_X) < 6; // BUCKET_X is Awarded
                // If NOT awarded bucket, it must be a drop bucket (if dynamic).

                const floorY = isAwardedBucket ? (SPHERE_RADIUS + 0.5) : -2.5; // Drop deeper for Rejected

                if (iPos.y < floorY) {
                    iPos.y = floorY;
                    velocities.current[idx * 3 + 1] *= -BOUNCE;
                    velocities.current[idx * 3] *= 0.8;
                    velocities.current[idx * 3 + 2] *= 0.8;
                }
            }

            const BUCKET_RADIUS = 2.8;
            // Determine which bucket center we are closest to
            // Awarded Bucket
            let centerX = BUCKET_X;
            // If not near Awarded, find nearest stage center
            if (Math.abs(iPos.x - BUCKET_X) > 6) {
                centerX = Math.round(iPos.x / TILE_SPACING) * TILE_SPACING;
            }

            const dx = iPos.x - centerX;
            const dz = iPos.z; // Centered on Z=0
            const dist = Math.sqrt(dx * dx + dz * dz);

            if (dist > BUCKET_RADIUS - SPHERE_RADIUS) {
                const angle = Math.atan2(dz, dx);
                const pen = dist - (BUCKET_RADIUS - SPHERE_RADIUS);
                iPos.x -= Math.cos(angle) * pen;
                iPos.z -= Math.sin(angle) * pen;

                const vNormal = (velocities.current[idx * 3] * Math.cos(angle) + velocities.current[idx * 3 + 2] * Math.sin(angle));
                velocities.current[idx * 3] -= 1.2 * vNormal * Math.cos(angle);
                velocities.current[idx * 3 + 2] -= 1.2 * vNormal * Math.sin(angle);

                velocities.current[idx * 3] *= 0.8;
                velocities.current[idx * 3 + 2] *= 0.8;
            }

            velocities.current[idx * 3] *= FRICTION;
            velocities.current[idx * 3 + 1] *= FRICTION;
            velocities.current[idx * 3 + 2] *= FRICTION;

            tempObj.position.copy(iPos);
            tempObj.scale.set(1, 1, 1);
            tempObj.updateMatrix();
            instancesRef.current!.setMatrixAt(idx, tempObj.matrix);
        }

        // --- DYNAMIC COLLISION LOOP ---
        const positions = new Float32Array(dynamicIndices.length * 3);
        dynamicIndices.forEach((idx, i) => {
            instancesRef.current!.getMatrixAt(idx, iMatrix);
            positions[i * 3] = iMatrix.elements[12];
            positions[i * 3 + 1] = iMatrix.elements[13];
            positions[i * 3 + 2] = iMatrix.elements[14];
        });

        for (let iter = 0; iter < 4; iter++) {
            for (let i = 0; i < dynamicIndices.length; i++) {
                for (let j = i + 1; j < dynamicIndices.length; j++) {
                    const idxA = i;
                    const idxB = j;
                    const dx = positions[idxA * 3] - positions[idxB * 3];
                    const dy = positions[idxA * 3 + 1] - positions[idxB * 3 + 1];
                    const dz = positions[idxA * 3 + 2] - positions[idxB * 3 + 2];
                    const distSq = dx * dx + dy * dy + dz * dz;
                    const minDst = SPHERE_RADIUS * 2;

                    if (distSq < minDst * minDst && distSq > 0.0001) {
                        const dist = Math.sqrt(distSq);
                        const pen = (minDst - dist) * 0.5;
                        const nx = dx / dist;
                        const ny = dy / dist;
                        const nz = dz / dist;

                        positions[idxA * 3] += nx * pen;
                        positions[idxA * 3 + 1] += ny * pen;
                        positions[idxA * 3 + 2] += nz * pen;

                        positions[idxB * 3] -= nx * pen;
                        positions[idxB * 3 + 1] -= ny * pen;
                        positions[idxB * 3 + 2] -= nz * pen;
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

// 3. Main Scene
const Scene = ({ currentDate }: { currentDate: number }) => {
    return (
        <>
            <ambientLight intensity={0.5} />
            <directionalLight position={[10, 20, 10]} intensity={1} castShadow />
            <StageGrid />
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
    setIsPlaying
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
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}
                >
                    {isPlaying ? '⏸' : '▶'}
                </button>
                <div style={{ fontSize: '24px', fontWeight: 300 }}>
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

    // Animation Loop for Slider
    useEffect(() => {
        let frameId: number;
        if (isPlaying) {
            const loop = () => {
                setCurrentDate(prev => {
                    // Much slower speed: ~0.5 days per frame (at 60fps = 30 days/sec -> 1 month/sec)
                    const next = prev + (1000 * 60 * 60 * 4);
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
    }, [isPlaying, dateRange]);

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
            />


        </div>
    )
}
