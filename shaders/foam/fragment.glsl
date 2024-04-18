uniform float time;
  uniform vec3 foamColor;
  varying vec2 vUv;
  uniform float seed;

  // Perlin noise function
  vec4 permute(vec4 x) {
    return mod(((x * 34.0) + 1.0) * x, 289.0);
  }

  vec4 taylorInvSqrt(vec4 r) {
    //return sqrt(1/r); 
    return 1.79284291400159 - 0.85373472095314 * r;
  }


  float perlinNoise(vec2 P) {
    vec4 Pi = floor(P.xyxy) + vec4(0.0, 0.0, 1.0, 1.0);
    vec4 Pf = fract(P.xyxy) - vec4(0.0, 0.0, 1.0, 1.0);
    Pi = mod(Pi, 289.0);
    vec4 ix = Pi.xzxz;
    vec4 iy = Pi.yyww;
    vec4 fx = Pf.xzxz;
    vec4 fy = Pf.yyww;
    vec4 i = permute(permute(ix) + iy);
    vec4 gx = 2.0 * fract(i * 0.0243902439) - 1.0;
    vec4 gy = abs(gx) - 0.5;
    vec4 tx = floor(gx + 0.5);
    gx = gx - tx;
    vec2 g00 = vec2(gx.x, gy.x);
    vec2 g10 = vec2(gx.y, gy.y);
    vec2 g01 = vec2(gx.z, gy.z);
    vec2 g11 = vec2(gx.w, gy.w);
    vec4 norm = taylorInvSqrt(vec4(dot(g00, g00), dot(g01, g01), dot(g10, g10), dot(g11, g11)));
    g00 *= norm.x;
    g01 *= norm.y;
    g10 *= norm.z;
    g11 *= norm.w;
    float n00 = dot(g00, vec2(fx.x, fy.x));
    float n10 = dot(g10, vec2(fx.y, fy.y));
    float n01 = dot(g01, vec2(fx.z, fy.z));
    float n11 = dot(g11, vec2(fx.w, fy.w));
    vec2 fade_xy = Pf.xy * Pf.xy * Pf.xy * (Pf.xy * (Pf.xy * 6.0 - 15.0) + 10.0);
    vec2 n_x = mix(vec2(n00, n01), vec2(n10, n11), fade_xy.x);
    float n_xy = mix(n_x.x, n_x.y, fade_xy.y);
    return 2.3 * n_xy;
  }


  void main() {
    // Introduce time-based variations and a random seed in noise coordinates
    float noise = perlinNoise(vUv * 10.0 + vec2(time * 0.2, time * 0.3) + seed * 1000.0); // Adjust speeds for different directions

    // Adjust foam generation based on noise and random phase offset
    float randomPhase = sin(seed * 123.456 + 456.789); // Introduce a random phase offset based on the seed
    float phaseOffset = randomPhase * 6.28318; // Convert to the range [0, 2π]

    // Introduce a random offset for the foam density
    float randomDensityOffset = sin(seed * 789.012 + 345.678) * 0.4; // Random value between -0.4 and 0.4

    // Vary density over time with phase offset and random density offset
    float foam = smoothstep(0.5 + randomDensityOffset, 0.7 + randomDensityOffset, noise * (0.8 + sin(time * 0.5 + phaseOffset) * 0.2));

    gl_FragColor = vec4(foamColor, foam*0.5);
}