
import React, { Suspense } from 'react'
import { LoomCanvas } from './loom/LoomCanvas'

// This component now acts as a wrapper for the WebGPU Loom Canvas
// ensuring it runs in a clean environment.

export default function TheLoomApp() {
    return (
        <React.Fragment>
            <Suspense fallback={<div className="text-white text-center pt-20">Loading Loom GPU...</div>}>
                <LoomCanvas />
            </Suspense>
        </React.Fragment>
    )
}
