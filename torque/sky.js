import * as THREE from "three";

const VS = `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = vec4(mat3(viewMatrix) * position, 1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }`;
const FS = `varying vec3 vDir; uniform vec3 top, hor, sunDir, sunCol; uniform float night;
float h3(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719)))*43758.5453); }
void main(){
  vec3 d = normalize(vDir); float y = d.y;
  vec3 c = mix(hor, top, pow(clamp(y,0.0,1.0), 0.45));
  c = mix(c, hor * 0.8, smoothstep(0.0, -0.25, y));
  float s = max(dot(d, sunDir), 0.0);
  c += sunCol * (pow(s, 900.0) * 6.0 + pow(s, 12.0) * 0.35);
  // Soft procedural cloud puffs (2-octave hash noise, faded at night / below horizon).
  vec2 cuv = d.xz / (d.y + 0.35);
  float n1 = h3(floor(vec3(cuv * 1.4, 0.0)));
  float n2 = h3(floor(vec3(cuv * 3.1 + 7.0, 0.0)));
  float cl = smoothstep(0.62, 0.85, n1 * 0.65 + n2 * 0.35);
  c = mix(c, vec3(0.95, 0.97, 1.0), cl * 0.35 * smoothstep(0.02, 0.25, y) * (1.0 - night * 0.85));
  c += vec3(step(0.9988, h3(floor(d*260.0))) * night * smoothstep(0.0,0.3,y));
  gl_FragColor = vec4(c, 1.0);
}`;

export function makeSky() {
  const u = { top: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color() }, night: { value: 0 } };
  const mat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: VS, fragmentShader: FS, side: THREE.BackSide, depthWrite: false, fog: false });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), mat);
  mesh.frustumCulled = false; mesh.renderOrder = -10;
  return { mesh, u };
}

const C = c => new THREE.Color(c);
const DAY_TOP = C(0x3a78d8), DAY_HOR = C(0xb9d4ef), NIGHT_TOP = C(0x02040c), NIGHT_HOR = C(0x0a1020), DUSK = C(0xf08a4b);
const tmp = new THREE.Color();
// hours 0..24 -> lighting state
export function timeOfDay(hours) {
  const a = (hours - 6) / 12 * Math.PI, elev = Math.sin(a);
  const dir = new THREE.Vector3(Math.cos(a) * 0.8, elev, 0.45).normalize();
  const day = THREE.MathUtils.smoothstep(elev, -0.12, 0.25), dusk = Math.max(0, 1 - Math.abs(elev) * 5) * 0.9;
  const top = NIGHT_TOP.clone().lerp(DAY_TOP, day);
  const hor = NIGHT_HOR.clone().lerp(DAY_HOR, day).lerp(DUSK, dusk);
  const sunCol = C(0xfff4e0).lerp(C(0xff9a50), 1 - Math.min(1, Math.max(0, elev) * 3)).multiplyScalar(day);
  return { dir, elev, day, night: 1 - day, top, hor, sunCol, tmp };
}
