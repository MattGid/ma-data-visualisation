
// Helper to ensure WebGPU types are recognized if not loaded globally
/// <reference types="@webgpu/types" />

// Patch for Navigator if needed
interface Navigator {
    gpu: GPU;
}
