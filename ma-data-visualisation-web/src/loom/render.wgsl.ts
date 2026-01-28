
export const renderWGSL = /* wgsl */`
struct ThreadData {
  position: vec3f,
  velocity: vec3f,
  baseOrigin: vec3f,
  targetZ: f32,
  t_signup: f32,
  t_submitted: f32,
  t_decision: f32,
  statusId: u32,
  programId: u32,
  seed: f32,
  isSnapped: f32,
  isAccepted: f32,
};

struct Uniforms {
  viewMatrix: mat4x4f,
  projectionMatrix: mat4x4f,
  time: f32,
};

@group(0) @binding(0) var<storage, read> threads: array<ThreadData>;
@group(0) @binding(1) var<uniform> uniforms: Uniforms;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) color: vec4f,
  @location(1) uv: vec2f,
  @location(2) worldPos: vec3f,
  @location(3) centerPos: vec3f, // Center of sphere in world space
};

// --- QUATERNION ROTATION ---
fn rotate(v: vec3f, axis: vec3f, angle: f32) -> vec3f {
    let s = sin(angle);
    let c = cos(angle);
    let oc = 1.0 - c;
    return v * c + cross(axis, v) * s + axis * dot(axis, v) * oc;
}

@vertex
fn vs_main(
  @builtin(vertex_index) vertexIndex: u32,
  @builtin(instance_index) instanceIndex: u32
) -> VertexOutput {
  let t = threads[instanceIndex];
  
  // Billboard Logic: Always face camera? 
  // For sphere impostor, a camera-facing quad is ideal.
  // We can extract camera Right and Up vectors from View Matrix.
  let right = vec3f(uniforms.viewMatrix[0].x, uniforms.viewMatrix[1].x, uniforms.viewMatrix[2].x);
  let up    = vec3f(uniforms.viewMatrix[0].y, uniforms.viewMatrix[1].y, uniforms.viewMatrix[2].y);
  
  // Local Quad
  let size = 3.0; // Slightly smaller but denser
  let idx = vertexIndex % 6;
  var uv = vec2f(0.0);
  var offset = vec2f(0.0);

  if (idx == 0 || idx == 5) { offset = vec2f(-1.0, 1.0); uv = vec2f(0.0, 1.0); }
  else if (idx == 1) { offset = vec2f(-1.0, -1.0); uv = vec2f(0.0, 0.0); }
  else if (idx == 2 || idx == 3) { offset = vec2f(1.0, -1.0); uv = vec2f(1.0, 0.0); }
  else { offset = vec2f(1.0, 1.0); uv = vec2f(1.0, 1.0); }

  let localPos = (right * offset.x + up * offset.y) * size;
  let worldPos = t.position + localPos;

  var out: VertexOutput;
  out.position = uniforms.projectionMatrix * uniforms.viewMatrix * vec4f(worldPos, 1.0);
  out.uv = uv;
  out.worldPos = worldPos;
  out.centerPos = t.position;

  // --- PREMIUM COLORS ---
  var col = vec4f(0.9, 0.9, 0.95, 0.3); // "Ghost" Glass
  
  // 1. Interview (Pulse Blue)
  if (t.statusId == 1) { 
      col = vec4f(0.0, 0.4, 1.0, 0.9);
  } 
  // 2. Active/Accepted (Teal/Cyan - Signature)
  else if (t.statusId == 2) { 
      col = vec4f(0.0, 0.9, 0.8, 1.0); 
  } 
  // 3. Awarded (Metallic Gold)
  else if (t.statusId == 3) { 
      // Rich Golden Color
      col = vec4f(1.0, 0.8, 0.1, 1.0); 
  }

  // Snapped / Rejected (Red/Grey fade)
  if (t.isSnapped > 0.5) {
      col = vec4f(0.8, 0.2, 0.2, 0.4);
  }

  out.color = col;
  return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  // --- SPHERE IMPOSTOR RAYCASTING ---
  // Map UV (0..1) to Centered coords (-1..1)
  let p = in.uv * 2.0 - 1.0;
  
  // 1. Cutout circle
  let rSq = dot(p, p);
  if (rSq > 1.0) { discard; }

  // 2. Calculate Sphere Normal
  // N.z is the height of the sphere at point p
  let z = sqrt(1.0 - rSq);
  // Normal in "View Space" roughly corresponds to (p.x, p.y, z)
  // But we want World Space normal for lighting.
  // Approximation: Use the billboard basis vectors relative to camera?
  // Let's do simple lighting in Tangent Space (View-aligned) for efficiency.
  let normal = vec3f(p.x, p.y, z);

  // --- LIGHTING MODEL ---
  // Light Dir (Top-Right-Front)
  let lightDir = normalize(vec3f(0.5, 0.8, 1.0));
  let viewDir = vec3f(0.0, 0.0, 1.0); // Ortho-like approximation for billboards facing camera

  // Diffuse (Lambet)
  let diff = max(dot(normal, lightDir), 0.0);
  
  // Specular (Blinn-Phong)
  let halfVec = normalize(lightDir + viewDir);
  let specAmt = pow(max(dot(normal, halfVec), 0.0), 32.0); // Shininess

  // Fresnel (Rim Lighting) - KEY for Glassy look
  let fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 3.0);

  // --- MATERIAL COMPOSITION ---
  var baseColor = in.color.rgb;
  let alpha = in.color.a;

  var finalColor = baseColor * (0.4 + 0.6 * diff); // Ambient + Diffuse
  
  // Add Specular (Gold gets colored specular, others white)
  var specColor = vec3f(1.0);
  if (in.color.r > 0.8 && in.color.g > 0.6 && in.color.b < 0.3) {
      // Gold Specular
      specColor = vec3f(1.0, 0.9, 0.6); 
  }
  
  finalColor += specColor * specAmt * 0.8;
  
  // Add Rim Light (Cyan tint for techy feel)
  finalColor += vec3f(0.2, 0.8, 1.0) * fresnel * 0.6;
  
  // Add Emissive Core (fake SSS)
  let centerGlow = smoothstep(0.0, 0.3, z) * 0.2;
  finalColor += baseColor * centerGlow;

  // Alpha composition
  // Edges softer for transparency
  let edgeAlpha = smoothstep(0.0, 0.2, z);
  
  return vec4f(finalColor, alpha * edgeAlpha);
}
`;
