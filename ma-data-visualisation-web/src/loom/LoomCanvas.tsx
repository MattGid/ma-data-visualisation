
import React, { useEffect, useRef, useState } from 'react';
import { useControls } from 'leva';
import { simulationWGSL } from './simulation.wgsl';
import { renderWGSL } from './render.wgsl';
import { MOCK_DATA, parseDateToFloat, getProgramId } from './data';
import * as THREE from 'three';

const THREAD_COUNT = MOCK_DATA.length;
const STRIDE = 96;

export const LoomCanvas: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [error, setError] = useState<string | null>(null);

    const { timeScale, timelineProgress, cameraZ, showDebug } = useControls({
        timeScale: { value: 1.0, min: 0.0, max: 2.0 },
        timelineProgress: { value: 100.0, min: 0, max: 2000 },
        cameraZ: { value: -10, min: -100, max: 100 },
        showDebug: true
    });

    useEffect(() => {
        if (!navigator.gpu) {
            setError("WebGPU not supported.");
            return;
        }

        const canvas = canvasRef.current!;
        const context = canvas.getContext('webgpu') as GPUCanvasContext;
        let device: GPUDevice;

        // Pipelines
        let p_compute: GPUComputePipeline;
        let p_render: GPURenderPipeline;

        // Buffers
        let b_threads: GPUBuffer;
        let b_render_uniforms: GPUBuffer; // view, proj, time
        let b_compute_uniforms: GPUBuffer; // time, dt, timeline

        // BindGroups
        let bg_compute: GPUBindGroup;
        let bg_render: GPUBindGroup;

        let depthTexture: GPUTexture;
        let frameId: number;
        let lastTime = performance.now();

        const init = async () => {
            const adapter = await navigator.gpu.requestAdapter();
            if (!adapter) { setError("No WebGPU adapter"); return; }
            device = await adapter.requestDevice();

            const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
            context.configure({
                device,
                format: presentationFormat,
                alphaMode: 'premultiplied',
            });

            // --- DATA INIT ---

            // Wait, THREAD_COUNT * STRIDE is bytes.
            // Let's ensure alignment.
            const paddedCount = Math.ceil(THREAD_COUNT / 64) * 64; // Workgroup align
            const totalSize = paddedCount * STRIDE;

            const dataBuffer = new ArrayBuffer(totalSize);
            const view = new DataView(dataBuffer);

            MOCK_DATA.forEach((app, i) => {
                const byteOffset = i * STRIDE;
                const pId = getProgramId(app.program);
                // Distribute ribbons on X - Tighter grouping
                const ribbonX = (pId - 1.5) * 5.0;
                const x = ribbonX + (Math.random() - 0.5) * 2.0;
                const y = (Math.random() - 0.5) * 8.0;
                const z = 0; // Start at 0

                // Layout matches struct ThreadData
                // 0: pos (vec3)
                view.setFloat32(byteOffset + 0, x, true);
                view.setFloat32(byteOffset + 4, y, true);
                view.setFloat32(byteOffset + 8, z, true);
                // 16: vel (vec3)
                // 32: baseOrigin (vec3)
                view.setFloat32(byteOffset + 32, x + 100.0, true); // Storing x again? No, baseOrigin.
                view.setFloat32(byteOffset + 36, y, true);
                view.setFloat32(byteOffset + 40, z, true);
                // 48: targetZ, t_signup, t_submitted, t_decision
                view.setFloat32(byteOffset + 48, 0, true);
                view.setFloat32(byteOffset + 52, parseDateToFloat(app.events.signed_up), true);
                view.setFloat32(byteOffset + 56, parseDateToFloat(app.events.submitted), true);
                view.setFloat32(byteOffset + 60, app.events.status?.includes("Rej") ? 999 : 9999, true);

                // 64: statusId (u32), programId (u32), seed (f32), isSnapped (f32)
                let status = 0;
                if (app.events.status?.includes("Inter")) status = 1;
                if (app.events.status?.includes("Acc")) status = 2;
                if (app.events.awarded) status = 3;

                view.setUint32(byteOffset + 64, status, true);
                view.setUint32(byteOffset + 68, pId, true);
                view.setFloat32(byteOffset + 72, Math.random() * 1000.0, true);
                view.setFloat32(byteOffset + 76, 0.0, true);

                // 80: isAccepted(f32)
                view.setFloat32(byteOffset + 80, status === 2 ? 1.0 : 0.0, true);
            });

            b_threads = device.createBuffer({
                size: totalSize,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX,
                mappedAtCreation: true,
            });
            new Uint8Array(b_threads.getMappedRange()).set(new Uint8Array(dataBuffer));
            b_threads.unmap();

            // --- UNIFORMS ---
            // Render: Mat4(64) + Mat4(64) + Time(4) + pad(12) = 144 -> 160(align 32?) 
            b_render_uniforms = device.createBuffer({
                size: 256,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            });
            // Compute: Time(4) + DT(4) + Progress(4) + pad(4) = 16
            b_compute_uniforms = device.createBuffer({
                size: 64,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            });

            // --- PIPELINES ---
            const cMod = device.createShaderModule({ code: simulationWGSL });
            p_compute = device.createComputePipeline({
                layout: 'auto',
                compute: { module: cMod, entryPoint: 'main' }
            });

            const rMod = device.createShaderModule({ code: renderWGSL });
            p_render = device.createRenderPipeline({
                layout: 'auto',
                vertex: { module: rMod, entryPoint: 'vs_main' },
                fragment: {
                    module: rMod, entryPoint: 'fs_main',
                    targets: [{
                        format: presentationFormat,
                        blend: {
                            color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }
                        }
                    }]
                },
                primitive: { topology: 'triangle-list' }, // Instanced quads usually need triangle-list with index buffer or just vertex generation
                depthStencil: {
                    depthWriteEnabled: true,
                    depthCompare: 'less',
                    format: 'depth24plus',
                }
            });

            // --- BIND GROUPS ---
            bg_compute = device.createBindGroup({
                layout: p_compute.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: { buffer: b_threads } },
                    { binding: 1, resource: { buffer: b_compute_uniforms } }
                ]
            });

            bg_render = device.createBindGroup({
                layout: p_render.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: { buffer: b_threads } },
                    { binding: 1, resource: { buffer: b_render_uniforms } }
                ]
            });

            // Initialize canvas dimensions to match CSS before creating depth texture
            const dpr = window.devicePixelRatio || 1;
            canvas.width = Math.floor(canvas.clientWidth * dpr);
            canvas.height = Math.floor(canvas.clientHeight * dpr);

            // Depth - now using correctly sized canvas
            depthTexture = device.createTexture({
                size: [canvas.width, canvas.height],
                format: 'depth24plus',
                usage: GPUTextureUsage.RENDER_ATTACHMENT,
            });

            requestAnimationFrame(loop);
        };

        const loop = (t: number) => {
            frameId = requestAnimationFrame(loop);
            const dt = (t - lastTime) * 0.001 * timeScale; // scale delta
            lastTime = t;
            if (!device || !p_compute) return;

            // Resize logic - use DPR for proper sizing
            const dpr = window.devicePixelRatio || 1;
            const targetWidth = Math.floor(canvas.clientWidth * dpr);
            const targetHeight = Math.floor(canvas.clientHeight * dpr);
            if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
                canvas.width = targetWidth;
                canvas.height = targetHeight;
                depthTexture.destroy();
                depthTexture = device.createTexture({
                    size: [canvas.width, canvas.height],
                    format: 'depth24plus',
                    usage: GPUTextureUsage.RENDER_ATTACHMENT,
                });
            }

            // --- UPDATE UNIFORMS ---
            // Render
            const aspect = canvas.width / canvas.height;
            const cam = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
            cam.position.set(0, 10, cameraZ);
            cam.lookAt(0, 0, 50);
            cam.updateMatrixWorld();
            cam.updateProjectionMatrix();

            device.queue.writeBuffer(b_render_uniforms, 0, new Float32Array(cam.matrixWorldInverse.elements));
            device.queue.writeBuffer(b_render_uniforms, 64, new Float32Array(cam.projectionMatrix.elements));
            device.queue.writeBuffer(b_render_uniforms, 128, new Float32Array([t * 0.001]));

            // Compute
            const cData = new Float32Array([t * 0.001, dt, timelineProgress, 0]);
            device.queue.writeBuffer(b_compute_uniforms, 0, cData);

            // --- ENCODE PASSES ---
            const encoder = device.createCommandEncoder();

            // 1. Compute Pass
            const cPass = encoder.beginComputePass();
            cPass.setPipeline(p_compute);
            cPass.setBindGroup(0, bg_compute);
            // Workgroups: ceil(count / 64)
            cPass.dispatchWorkgroups(Math.ceil(THREAD_COUNT / 64));
            cPass.end();

            // 2. Render Pass
            const rPass = encoder.beginRenderPass({
                colorAttachments: [{
                    view: context.getCurrentTexture().createView(),
                    clearValue: { r: 0.05, g: 0.05, b: 0.1, a: 1 },
                    loadOp: 'clear',
                    storeOp: 'store',
                }],
                depthStencilAttachment: {
                    view: depthTexture.createView(),
                    depthClearValue: 1.0,
                    depthLoadOp: 'clear',
                    depthStoreOp: 'store',
                }
            });
            rPass.setPipeline(p_render);
            rPass.setBindGroup(0, bg_render);
            // Draw 6 vertices per instance, for THREAD_COUNT instances
            rPass.draw(6, THREAD_COUNT);
            rPass.end();

            device.queue.submit([encoder.finish()]);
        };

        const catchErr = (e: any) => { console.error(e); setError(e.message); };
        init().catch(catchErr);

        return () => { cancelAnimationFrame(frameId); };
    }, [timelineProgress, timeScale, cameraZ]);

    if (error) return <div className="text-red-500 p-4">{error}</div>;

    return (
        <div style={{ width: '100vw', height: '100vh', background: '#050505', position: 'relative', overflow: 'hidden' }}>
            <canvas
                ref={canvasRef}
                style={{ width: '100%', height: '100%', display: 'block' }}
                className="touch-none"
            />
            {showDebug && (
                <div className="absolute bottom-4 left-4 text-white text-xs opacity-50 pointer-events-none">
                    GPU Active. Threads: {THREAD_COUNT}
                </div>
            )}
        </div>
    );
};
