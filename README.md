# MA Data Visualisation Project

A collection of high-performance data visualization experiments featuring 3D simulations, particle systems, and interactive physics.

## 🚀 Live Demo

Host this repository on any static file server. The `index.html` at the root provides a landing page with links to all experiments.

## 📦 Experiments

### 1. Isometric Applicant Flow
Interactive 3D visualization of applicant progression through stages with physics-based particle systems and drop buckets.
- **Technologies:** Three.js, React Three Fiber, Physics Simulation
- **Data:** CSV applicant data integration

### 2. Particle Stream
Dynamic particle-based data visualization with flowing streams representing cohorts and categories.
- **Technologies:** WebGL, Three.js, Particle Systems

### 3. Loom of Cohorts
WebGPU-powered fabric simulation visualizing data threads woven into an interactive 3D loom structure.
- **Technologies:** WebGPU, WGSL Shaders, Cloth Simulation

### 4. Framer Data Cloth
Interactive cloth simulation component for Framer with CSV data integration.
- **Technologies:** Framer, React, Three.js

## 🛠️ Development

```bash
# Build the web visualization
cd ma-data-visualisation-web
npm install
npm run build

# Serve the landing page locally
cd ..
python3 -m http.server 8080
# Then open http://localhost:8080
```

## 📁 Project Structure

```
ma-data-visualisation-project/
├── index.html                    # Landing page
├── styles.css                    # Landing page styles
├── FramerComponentCloth.tsx      # Framer cloth component
├── FramerDataCloth.tsx           # Framer data cloth component
└── ma-data-visualisation-web/    # Vite/React web app
    ├── src/
    │   ├── IsometricApplicantFlow.tsx
    │   ├── ParticleApp.tsx
    │   ├── LoomApp.tsx
    │   └── loom/                 # WebGPU loom components
    └── dist/                     # Built output
```

## 🎨 Design

The landing page features a premium dark-mode aesthetic with:
- Glassmorphism card effects
- Animated gradient orbs
- Interactive hover states with glow tracking
- Responsive grid layout
- Modern typography (Space Grotesk + Inter)
