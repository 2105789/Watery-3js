uniform sampler2D envMap;
uniform samplerCube skybox;
uniform float foamAmount;
uniform float foamSpeed;
uniform float time; // Declare time uniform

varying vec2 refractedPosition[3];
varying vec3 reflected;
varying float reflectionFactor;
varying vec2 vUv;
varying float vHeight;

// Perlin noise function (from https://github.com/stegu/webgl-noise)
vec3 permute(vec3 x) {
    return mod(((x * 34.0) + 1.0) * x, 289.0);
}

float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
    vec2 i = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1;
    i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod(i, 289.0);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
    m = m * m;
    m = m * m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
}

float perlinNoise(vec2 uvs, float time) {
    return snoise(uvs + time);
}

void main() {
    vec3 reflectedColor = textureCube(skybox, reflected).xyz;

    vec3 refractedColor = vec3(1.);
    refractedColor.r = texture2D(envMap, refractedPosition[0] * 0.5 + 0.5).r;
    refractedColor.g = texture2D(envMap, refractedPosition[1] * 0.5 + 0.5).g;
    refractedColor.b = texture2D(envMap, refractedPosition[2] * 0.5 + 0.5).b;

    vec2 foamUvs = vUv * 10.0; // Adjust the scale of the foam texture
    float foamNoise = perlinNoise(foamUvs, time * foamSpeed);
    vec3 foamColor = vec3(foamNoise); // Use the noise value as the foam color

    float foamFactor = smoothstep(1.0 - foamAmount, 1.0, vHeight);

    vec3 finalColor = mix(refractedColor, foamColor, foamFactor);

    gl_FragColor = vec4(mix(finalColor, reflectedColor, clamp(reflectionFactor, 0., 1.)), 1.);
}