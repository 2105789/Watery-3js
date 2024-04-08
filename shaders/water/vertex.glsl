uniform sampler2D water;
uniform float time;
uniform float waveAmplitude;
uniform float waveFrequency;
uniform float waveSpeed;

varying vec2 refractedPosition[3];
varying vec3 reflected;
varying float reflectionFactor;
varying vec2 vUv;
varying float vHeight;

const float refractionFactor = 0.002;
const float fresnelBias = 0.2;
const float fresnelPower = 0.5;
const float fresnelScale = 0.1;
const float eta = 0.7; // Air refractive index / Water refractive index

void main() {
    vec4 info = texture2D(water, position.xy * 0.5 + 0.5);
    float vertexHeight = info.r;
    vHeight = vertexHeight;

    vec3 pos = vec3(position.xy, position.z + vertexHeight);
    vec3 norm = normalize(vec3(info.b, sqrt(1.0 - dot(info.ba, info.ba)), info.a)).xzy;
    vec3 eye = normalize(pos - cameraPosition);
    vec3 refracted = normalize(refract(eye, norm, eta));
    reflected = normalize(reflect(eye, norm));
    reflectionFactor = fresnelBias + fresnelScale * pow(1. + dot(eye, norm), fresnelPower);

    // Calculate wave displacement with independent summations of sine functions
    float waveX = 0.0;
    waveX += sin(position.x * 3.12 + time * .2) * 0.01;
    waveX += sin((position.x + time) * 2.5 + time * 0.8 ) * 0.005;
    waveX += sin((position.x - time) * 2.0 + time * 0.01) * 0.025;

    float waveY = 0.0;
    waveY += sin(position.y * 0.75 + time * 0.004) * 0.002;
    waveY += sin((position.y + time) * 5.0 + time * 0.0012 * 0.8) * 0.005;
    waveY += sin((position.y - time) * 0.1 + time * 0.0007 * 0.002) * 0.035;

    float waveZ = 0.0;
    waveZ += sin(position.x * 2.0 + position.y * 1.5 + time * 0.01 * 0.6) * 0.0015;
    waveZ += sin((position.x + position.y) * 3.0 + time * 0.007 * 0.001) * 0.002;
    waveZ += sin((position.x - position.y) * 1.8 + time * 0.0005 * 0.09) * 0.012;

    // Displace the vertex position with the wave
    pos.x += waveX;
    pos.y += waveY;
    pos.z += waveZ;

    mat4 proj = projectionMatrix * modelViewMatrix;
    vec4 projectedRefractedPosition = proj * vec4(pos + refractionFactor * refracted, 1.0);
    refractedPosition[0] = projectedRefractedPosition.xy / projectedRefractedPosition.w;
    projectedRefractedPosition = proj * vec4(pos + refractionFactor * normalize(refract(eye, norm, eta * 0.96)), 1.0);
    refractedPosition[1] = projectedRefractedPosition.xy / projectedRefractedPosition.w;
    projectedRefractedPosition = proj * vec4(pos + refractionFactor * normalize(refract(eye, norm, eta * 0.92)), 1.0);
    refractedPosition[2] = projectedRefractedPosition.xy / projectedRefractedPosition.w;

    gl_Position = proj * vec4(pos, 1.0);
    vUv = position.xy * 0.5 + 0.5;
}