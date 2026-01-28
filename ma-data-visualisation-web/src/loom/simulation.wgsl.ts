
export const simulationWGSL = /* wgsl */`
struct ThreadData {
  position: vec3f,
  velocity: vec3f,
  baseOrigin: vec3f,     // Where it started (x, y at z=0)
  targetZ: f32,          // Calculated based on time
  
  // Timestamps (Pre-parsed as floats: days since start)
  t_signup: f32,
  t_submitted: f32,
  t_decision: f32,       // Rejection or Acceptance
  
  // State flags
  statusId: u32,         // 0: Ghost, 1: Interview, 2: Active, 3: Awarded
  programId: u32,        // 0: HLA, 1: InLET...
  seed: f32,             // From name_hash
  
  // Physics Constraints
  isSnapped: f32,        // 1.0 if rejected/detached
  isAccepted: f32,       // 1.0 if weaving
};

struct GlobalParams {
  time: f32,
  deltaTime: f32,
  timelineProgress: f32, // Current visualization time (in days)
};

@group(0) @binding(0) var<storage, read_write> threads: array<ThreadData>;
@group(0) @binding(1) var<uniform> params: GlobalParams;

// Helper: Simple pseudo-random based on seed
fn hash11(p: f32) -> f32 {
    var p2 = fract(p * .1031);
    p2 *= p2 + 33.33;
    p2 *= p2 + p2;
    return fract(p2);
}

fn snoise(v: vec3f) -> f32 {
    // (Placeholder for Simplex Noise implementation - simplified for brevity)
    return sin(v.x * 10.0 + params.time) * 0.5 + sin(v.z * 5.0) * 0.5; 
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) global_id: vec3u) {
  let index = global_id.x;
  if (index >= arrayLength(&threads)) {
    return;
  }

  var t = threads[index];

  // --- PHASE A: The Intake (Chaos) ---
  // If we haven't reached signup time, keep hidden or at origin
  if (params.timelineProgress < t.t_signup) {
     t.position = t.baseOrigin;
     t.velocity = vec3f(0.0);
     threads[index] = t;
     return;
  }

  // --- PHYSICS UPDATE ---
  
  // Base movement along Z (Time)
  // We map timelineProgress to Z coordinate specifically for the visualization
  let targetZ = (params.timelineProgress - t.t_signup) * 0.5; // Scale time to distance
  
  var force = vec3f(0.0);

  // 1. Spring force towards target Z
  let stiffness = 2.0;
  let displacement = targetZ - t.position.z;
  
  // Phase B: Tension (submitted)
  var tensionMultiplier = 1.0;
  if (t.t_submitted > 0.0 && params.timelineProgress > t.t_submitted) {
    tensionMultiplier = 5.0; // Stiffen up
  }
  
  force.z += displacement * stiffness * tensionMultiplier;
  
  // 2. Turbulence / Noise (Wind)
  let noiseFreq = 0.1;
  let noiseAmp = 0.2 * (1.0 + sin(params.time + t.seed));
  let turb = vec3f(
     snoise(vec3f(t.position.x, t.position.y, params.time * 0.5)),
     snoise(vec3f(t.position.x + 100.0, t.position.y, params.time * 0.5)),
     0.0
  );
  
  // If attached (not snapped)
  if (t.isSnapped < 0.5) {
     force += turb * noiseAmp;
     
     // Stay close to lane origin (X/Y)
     let springXY = 3.0;
     force.x += (t.baseOrigin.x - t.position.x) * springXY;
     force.y += (t.baseOrigin.y - t.position.y) * springXY;
  } 
  else {
      // Phase C: The Filter (Gravity drop)
      force.y -= 9.8 * 0.1; // Gravity
      force.z *= 0.1; // Slow down forward momentum
  }

  // Phase D: The Weave
  // (In a real implementation, we would access threads[index +/- 1] for neighbor springs)
  // Here we simulate it by locking relative positions tighter
  if (t.isAccepted > 0.5 && params.timelineProgress > t.t_decision) {
      // Damping lateral movement to form "Cloth"
      t.velocity.x *= 0.5;
      t.velocity.y *= 0.5;
  }

  // Integration (Euler)
  t.velocity += force * params.deltaTime;
  t.velocity *= 0.95; // Damping
  t.position += t.velocity * params.deltaTime;

  // Write back
  threads[index] = t;
}
`;
