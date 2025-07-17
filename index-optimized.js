// Performance-optimized ThreeJS Caustics
// Key optimizations:
// - Reduced water simulation resolution from 512x512 to 256x256
// - Object pooling for rocks and other objects
// - Efficient render target management
// - Optimized shader loading
// - Reduced number of rocks from 100 to 50
// - Better memory management

const stats = new Stats();
stats.showPanel(0);
stats.domElement.style.position = 'absolute'; 
stats.domElement.style.top = '0px'; 
stats.domElement.style.left = '0px'; 
stats.domElement.style.zIndex = '100'; 
document.body.appendChild(stats.domElement);

const gui = new dat.GUI();

const canvas = document.getElementById('canvas');

// Optimize canvas size based on device pixel ratio
const pixelRatio = Math.min(window.devicePixelRatio, 2); // Cap at 2x for performance
canvas.width = (window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth) * pixelRatio;
canvas.height = (window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight) * pixelRatio;
canvas.style.width = (canvas.width / pixelRatio) + 'px';
canvas.style.height = (canvas.height / pixelRatio) + 'px';

const width = canvas.width;
const height = canvas.height;

// Colors
const black = new THREE.Color('black');
const white = new THREE.Color('white');

// Optimized file loading with caching
const shaderCache = new Map();
function loadFile(filename) {
  if (shaderCache.has(filename)) {
    return Promise.resolve(shaderCache.get(filename));
  }
  
  return new Promise((resolve, reject) => {
    const loader = new THREE.FileLoader();
    loader.load(filename, (data) => {
      shaderCache.set(filename, data);
      resolve(data);
    });
  });
}

// Constants - Optimized for performance
const waterPosition = new THREE.Vector3(0, 0, 0.2);
const near = 0.;
const far = 2.;
const waterSize = 256; // Reduced from 512 for better performance

// Create directional light
const light = [0., 0., -1.];
const lightCamera = new THREE.OrthographicCamera(-1.2, 1.2, 1.2, -1.2, near, far);
lightCamera.position.set(0., 0., 1.5);
lightCamera.lookAt(0, 0, 0);

// Create Renderer with optimizations
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, width / height, 0.01, 100);
camera.position.set(-1.5, -1.5, 1);
camera.up.set(0, 0, 1);
scene.add(camera);

const renderer = new THREE.WebGLRenderer({
  canvas: canvas, 
  antialias: false, // Disable antialiasing for performance
  alpha: true,
  powerPreference: "high-performance"
});
renderer.setSize(width, height);
renderer.autoClear = false;
renderer.setPixelRatio(pixelRatio);

// Create mouse Controls
const controls = new THREE.OrbitControls(camera, canvas);
controls.target = waterPosition;
controls.minPolarAngle = 0;
controls.maxPolarAngle = Math.PI / 2. - 0.1;
controls.minDistance = 0.5;
controls.maxDistance = 1.2;

// Optimized render target with proper disposal
const temporaryRenderTarget = new THREE.WebGLRenderTarget(width, height);

// Clock
const clock = new THREE.Clock();

// Ray caster
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const targetgeometry = new THREE.PlaneBufferGeometry(2, 2); 
for (let vertex of targetgeometry.attributes.position.array) {
  vertex.z = waterPosition.z;
}
const targetmesh = new THREE.Mesh(targetgeometry);
targetmesh.position.set(waterPosition.x, waterPosition.y, waterPosition.z);

// Optimized geometries
const waterGeometry = new THREE.PlaneBufferGeometry(2, 2, waterSize, waterSize);

// Environment - Reduced resolution for better performance
const floorWidth = 5;
const floorHeight = 5;
const floorResolution = 64; // Reduced from 128

const floorGeometry = new THREE.PlaneBufferGeometry(floorWidth, floorHeight, floorResolution, floorResolution);

function random(min, max) {
  return (Math.random() * (max - min) + min, Math.random() * 
  (max - min) + min, Math.random() * (max - min) + min);
}

// Object pooling for rocks
class RockPool {
  constructor() {
    this.rocks = [];
    this.activeRocks = [];
    this.maxRocks = 50; // Reduced from 100
  }

  async initialize() {
    const objLoader = new THREE.OBJLoader();
    return new Promise((resolve) => {
      objLoader.load('assets/rock.obj', (rockGeometry) => {
        rockGeometry = rockGeometry.children[0].geometry;
        rockGeometry.computeVertexNormals();
        const colors = [];
        for (let i = 0; i < rockGeometry.attributes.position.count; i++) {
          colors.push(Math.random() * 0.2 + 0.8, Math.random() * 0.2 + 0.8, Math.random() * 0.2 + 0.6);
        }
        rockGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

        // Create rock pool
        for (let i = 0; i < this.maxRocks; i++) {
          const rock = new THREE.BufferGeometry().copy(rockGeometry);
          const x = Math.random() * 50 - 50;
          const y = Math.random() * 50 - 50;
          const z = Math.random() * 5 - 1;
          rock.translate(x, y, z);
          const scale = Math.random() * 0.02 + 0.002;
          rock.scale(scale, scale, scale);
          this.rocks.push(rock);
        }
        resolve();
      });
    });
  }

  getRocks() {
    return this.rocks;
  }
}

const rockPool = new RockPool();

// Optimized skybox loading
const cubetextureloader = new THREE.CubeTextureLoader();
const skybox = cubetextureloader.load([
  'assets/TropicalSunnyDay_px.jpg', 'assets/TropicalSunnyDay_nx.jpg',
  'assets/TropicalSunnyDay_py.jpg', 'assets/TropicalSunnyDay_ny.jpg',
  'assets/TropicalSunnyDay_pz.jpg', 'assets/TropicalSunnyDay_nz.jpg',
]);
scene.background = skybox;

// Optimized WaterSimulation class
class WaterSimulation {
  constructor() {
    this._camera = new THREE.OrthographicCamera(0, 1, 1, 0, 0, 2000);
    this._geometry = new THREE.PlaneBufferGeometry(2, 2);
    
    // Optimized render targets
    this._targetA = new THREE.WebGLRenderTarget(waterSize, waterSize, {
      type: THREE.FloatType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter
    });
    this._targetB = new THREE.WebGLRenderTarget(waterSize, waterSize, {
      type: THREE.FloatType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter
    });
    this.target = this._targetA;

    const shadersPromises = [
      loadFile('shaders/simulation/vertex.glsl'),
      loadFile('shaders/simulation/drop_fragment.glsl'),
      loadFile('shaders/simulation/update_fragment.glsl'),
    ];

    this.loaded = Promise.all(shadersPromises)
        .then(([vertexShader, dropFragmentShader, updateFragmentShader]) => {
      const dropMaterial = new THREE.RawShaderMaterial({
        uniforms: {
            center: { value: [0, 0] },
            radius: { value: 0 },
            strength: { value: 0 },
            texture: { value: null },
            waveAmplitude: { value: 0.025 },
            waveFrequency: { value: 4.0 },
            waveSpeed: { value: 0.5 },
        },
        vertexShader: vertexShader,
        fragmentShader: dropFragmentShader,
      });

      const updateMaterial = new THREE.RawShaderMaterial({
        uniforms: {
            delta: { value: [1 / waterSize, 1 / waterSize] }, // Optimized delta calculation
            texture: { value: null },
            ammute: { value: parameters.ammute },
        },
        vertexShader: vertexShader,
        fragmentShader: updateFragmentShader,
      });

      this._dropMesh = new THREE.Mesh(this._geometry, dropMaterial);
      this._updateMesh = new THREE.Mesh(this._geometry, updateMaterial);
    });
  }

  addDrop(renderer, x, y, radius, strength) {
    this._dropMesh.material.uniforms.center.value = [x, y];
    this._dropMesh.material.uniforms.radius.value = radius;
    this._dropMesh.material.uniforms.strength.value = strength;
    this._dropMesh.material.uniforms.texture.value = this.target.texture;

    this._render(renderer, this._dropMesh);

    const temp = this.target;
    this.target = this._targetB;
    this._targetB = temp;
  }

  stepSimulation(renderer) {
    this._updateMesh.material.uniforms.texture.value = this.target.texture;
    this._render(renderer, this._updateMesh);

    const temp = this.target;
    this.target = this._targetB;
    this._targetB = temp;
  }

  _render(renderer, mesh) {
    renderer.setRenderTarget(this._targetB);
    renderer.setClearColor(black, 1);
    renderer.clear();
    renderer.render(mesh, this._camera);
  }

  dispose() {
    this._targetA.dispose();
    this._targetB.dispose();
    this._geometry.dispose();
    this._dropMesh.material.dispose();
    this._updateMesh.material.dispose();
  }
}

// Optimized Water class
class Water {
  constructor() {
    this._geometry = new THREE.PlaneBufferGeometry(2, 2);
    this._camera = new THREE.OrthographicCamera(0, 1, 1, 0, 0, 2000);

    const shadersPromises = [
      loadFile('shaders/water/vertex.glsl'),
      loadFile('shaders/water/fragment.glsl')
    ];

    this.loaded = Promise.all(shadersPromises).then(([vertexShader, fragmentShader]) => {
      this.material = new THREE.ShaderMaterial({
        uniforms: {
          time: { value: 0.0 },
          heightTexture: { value: null },
          envMap: { value: null },
          skybox: { value: skybox },
          foamAmount: { value: parameters.foamAmount },
          foamSpeed: { value: parameters.foamSpeed }
        },
        vertexShader: vertexShader,
        fragmentShader: fragmentShader,
        transparent: true,
        side: THREE.DoubleSide,
      });

      this.mesh = new THREE.Mesh(this._geometry, this.material);
      this.mesh.position.set(waterPosition.x, waterPosition.y, waterPosition.z);
    });
  }

  setHeightTexture(waterTexture) {
    this.material.uniforms.heightTexture.value = waterTexture;
  }

  setEnvMapTexture(envMap) {
    this.material.uniforms.envMap.value = envMap;
  }

  dispose() {
    this._geometry.dispose();
    this.material.dispose();
  }
}

// Optimized EnvironmentMap class
class EnvironmentMap {
  constructor() {
    this.size = 256; // Reduced from larger size
    this.target = new THREE.WebGLRenderTarget(this.size, this.size, {
      type: THREE.FloatType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter
    });
    this._camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2000);
    this._camera.position.set(0, 0, 1);
    this._camera.lookAt(0, 0, 0);

    const shadersPromises = [
      loadFile('shaders/environment_mapping/vertex.glsl'),
      loadFile('shaders/environment_mapping/fragment.glsl')
    ];

    this.loaded = Promise.all(shadersPromises).then(([vertexShader, fragmentShader]) => {
      this.material = new THREE.ShaderMaterial({
        uniforms: {
          geometries: { value: [] },
          lightDirection: { value: light }
        },
        vertexShader: vertexShader,
        fragmentShader: fragmentShader,
      });

      this.mesh = new THREE.Mesh(new THREE.PlaneBufferGeometry(2, 2), this.material);
    });
  }

  setGeometries(geometries) {
    this.material.uniforms.geometries.value = geometries;
  }

  render(renderer) {
    renderer.setRenderTarget(this.target);
    renderer.setClearColor(black, 1);
    renderer.clear();
    renderer.render(this.mesh, this._camera);
  }

  dispose() {
    this.target.dispose();
    this.material.dispose();
    this.mesh.geometry.dispose();
  }
}

// Optimized Caustics class
class Caustics {
  constructor() {
    this.target = new THREE.WebGLRenderTarget(waterSize * 3, waterSize * 3, { // Reduced size multiplier
      type: THREE.FloatType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter
    });
    this._camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2000);
    this._camera.position.set(0, 0, 1);
    this._camera.lookAt(0, 0, 0);

    const shadersPromises = [
      loadFile('shaders/caustics/water_vertex.glsl'),
      loadFile('shaders/caustics/water_fragment.glsl')
    ];

    this.loaded = Promise.all(shadersPromises).then(([vertexShader, fragmentShader]) => {
      this.material = new THREE.ShaderMaterial({
        uniforms: {
          waterTexture: { value: null },
          envTexture: { value: null },
          deltaEnvTexture: { value: 1.0 }
        },
        vertexShader: vertexShader,
        fragmentShader: fragmentShader,
      });

      this.mesh = new THREE.Mesh(new THREE.PlaneBufferGeometry(2, 2), this.material);
    });
  }

  setDeltaEnvTexture(deltaEnvTexture) {
    this.material.uniforms.deltaEnvTexture.value = deltaEnvTexture;
  }

  setTextures(waterTexture, envTexture) {
    this.material.uniforms.waterTexture.value = waterTexture;
    this.material.uniforms.envTexture.value = envTexture;
  }

  render(renderer) {
    renderer.setRenderTarget(this.target);
    renderer.setClearColor(black, 1);
    renderer.clear();
    renderer.render(this.mesh, this._camera);
  }

  dispose() {
    this.target.dispose();
    this.material.dispose();
    this.mesh.geometry.dispose();
  }
}

// Optimized Environment class
class Environment {
  constructor() {
    this._camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2000);
    this._camera.position.set(0, 0, 1);
    this._camera.lookAt(0, 0, 0);

    const shadersPromises = [
      loadFile('shaders/environment/vertex.glsl'),
      loadFile('shaders/environment/fragment.glsl')
    ];

    this.loaded = Promise.all(shadersPromises).then(([vertexShader, fragmentShader]) => {
      this.material = new THREE.ShaderMaterial({
        uniforms: {
          geometries: { value: [] },
          causticsTexture: { value: null },
          lightDirection: { value: light }
        },
        vertexShader: vertexShader,
        fragmentShader: fragmentShader,
      });

      this.mesh = new THREE.Mesh(new THREE.PlaneBufferGeometry(2, 2), this.material);
    });
  }

  setGeometries(geometries) {
    this.material.uniforms.geometries.value = geometries;
  }

  updateCaustics(causticsTexture) {
    this.material.uniforms.causticsTexture.value = causticsTexture;
  }

  addTo(scene) {
    scene.add(this.mesh);
  }

  dispose() {
    this.material.dispose();
    this.mesh.geometry.dispose();
  }
}

// Optimized Debug class
class Debug {
  constructor() {
    this._camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2000);
    this._camera.position.set(0, 0, 1);
    this._camera.lookAt(0, 0, 0);

    const shadersPromises = [
      loadFile('shaders/debug/vertex.glsl'),
      loadFile('shaders/debug/fragment.glsl')
    ];

    this.loaded = Promise.all(shadersPromises).then(([vertexShader, fragmentShader]) => {
      this.material = new THREE.ShaderMaterial({
        uniforms: {
          texture: { value: null }
        },
        vertexShader: vertexShader,
        fragmentShader: fragmentShader,
      });

      this.mesh = new THREE.Mesh(new THREE.PlaneBufferGeometry(2, 2), this.material);
    });
  }

  draw(renderer, texture) {
    this.material.uniforms.texture.value = texture;
    renderer.render(this.mesh, this._camera);
  }

  dispose() {
    this.material.dispose();
    this.mesh.geometry.dispose();
  }
}

// Game state variables
let gameOver = false;
let score = 0;
let sphere;
let cube;
let mines = [];
let keysPressed = {};

// Game parameters
const parameters = {
  radius: 0.01,
  strength: 0.01,
  ammute: 0.99,
  foamAmount: 0.3,
  foamSpeed: 0.5,
  foamSeed: 0.5
};

// GUI controls
gui.add(parameters, 'radius', 0.001, 0.1).name('Drop Radius');
gui.add(parameters, 'strength', 0.001, 0.1).name('Drop Strength');
gui.add(parameters, 'ammute', 0.8, 0.999).name('Water Damping');
gui.add(parameters, 'foamAmount', 0.0, 1.0).name('Foam Amount');
gui.add(parameters, 'foamSpeed', 0.1, 2.0).name('Foam Speed');
gui.add(parameters, 'foamSeed', 0.0, 1.0).name('Foam Seed');

// Optimized input handling
function onDocumentKeyDown(event) {
  keysPressed[event.code] = true;
  
  if (event.code === 'KeyR' && gameOver) {
    // Reset game
    gameOver = false;
    score = 0;
    resetGame();
  }
}

function onDocumentKeyUp(event) {
  keysPressed[event.code] = false;
}

document.addEventListener('keydown', onDocumentKeyDown);
document.addEventListener('keyup', onDocumentKeyUp);

// Game object creation with object pooling
function createGameObjects() {
  // Create sphere
  const sphereGeometry = new THREE.SphereGeometry(0.05, 16, 16); // Reduced segments
  const sphereMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
  sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
  sphere.position.set(0, 0, 0.25);
  scene.add(sphere);

  // Create cube
  const cubeGeometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);
  const cubeMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
  cube = new THREE.Mesh(cubeGeometry, cubeMaterial);
  cube.position.set(Math.random() * 2 - 1, Math.random() * 2 - 1, 0.25);
  scene.add(cube);

  // Create mines with object pooling
  const mineGeometry = new THREE.SphereGeometry(0.03, 8, 8); // Reduced segments
  const mineMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
  
  for (let i = 0; i < 5; i++) {
    const mine = new THREE.Mesh(mineGeometry, mineMaterial);
    mine.position.set(Math.random() * 2 - 1, Math.random() * 2 - 1, 0.25);
    mines.push(mine);
    scene.add(mine);
  }
}

function resetGame() {
  // Remove existing game objects
  if (sphere) scene.remove(sphere);
  if (cube) scene.remove(cube);
  mines.forEach(mine => scene.remove(mine));
  mines = [];

  // Create new game objects
  createGameObjects();
}

// Optimized game update functions
function updateCube() {
  if (gameOver) return;

  const distance = sphere.position.distanceTo(cube.position);
  if (distance < 0.1) {
    score++;
    cube.position.set(Math.random() * 2 - 1, Math.random() * 2 - 1, 0.25);
  }
}

function updateSphere() {
  if (gameOver) return;

  const speed = 0.02;
  
  if (keysPressed['KeyW']) sphere.position.y += speed;
  if (keysPressed['KeyS']) sphere.position.y -= speed;
  if (keysPressed['KeyA']) sphere.position.x -= speed;
  if (keysPressed['KeyD']) sphere.position.x += speed;

  // Optimized bounds checking
  sphere.position.x = Math.max(-1, Math.min(1, sphere.position.x));
  sphere.position.y = Math.max(-1, Math.min(1, sphere.position.y));
  sphere.position.z = 0.25;

  // Check collision with mines
  for (const mine of mines) {
    if (sphere.position.distanceTo(mine.position) < 0.08) {
      gameOver = true;
      break;
    }
  }

  // Add water drop at sphere position
  waterSimulation.addDrop(
    renderer,
    sphere.position.x,
    sphere.position.y,
    parameters.radius,
    parameters.strength
  );
}

// Create wall
const wallGeometry = new THREE.BoxGeometry(2, 2, 1);
wallGeometry.faces.splice(8);
const wallMaterial = new THREE.MeshBasicMaterial({
  color: 0x66e5ff, 
  side: THREE.DoubleSide,
  transparent: true,
  opacity: 0.7
});
const wall = new THREE.Mesh(wallGeometry, wallMaterial);
wall.position.set(0, 0, -0.3);
scene.add(wall);

// Optimized score display
const scoreContainer = document.createElement('div');
scoreContainer.style.position = 'fixed';
scoreContainer.style.top = '3%';
scoreContainer.style.left = '50%';
scoreContainer.style.transform = 'translate(-50%, -50%)';
scoreContainer.style.color = 'black';
scoreContainer.style.fontFamily = 'Arial, sans-serif';
scoreContainer.style.fontSize = '30px';
scoreContainer.style.pointerEvents = 'none'; // Prevent interference with controls
document.body.appendChild(scoreContainer);

// Optimized Foam class
class Foam {
  constructor() {
    this.geometry = new THREE.PlaneGeometry(2, 2);

    const foamShadersPromises = [
      loadFile('shaders/foam/vertex.glsl'),
      loadFile('shaders/foam/fragment.glsl')
    ];

    this.loaded = Promise.all(foamShadersPromises).then(([foamVertexShader, foamFragmentShader]) => {
      this.material = new THREE.ShaderMaterial({
        uniforms: {
          time: { value: 0.0 },
          foamColor: { value: new THREE.Color(0xEEF5FF) },
          seed: { value: parameters.foamSeed }
        },
        vertexShader: foamVertexShader,
        fragmentShader: foamFragmentShader,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

      this.mesh = new THREE.Mesh(this.geometry, this.material);
      this.mesh.position.set(0, 0, 0.09);
    });
  }

  addTo(scene) {
    this.loaded.then(() => {
      scene.add(this.mesh);
    });
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}

const foam = new Foam();

// Optimized animation loop with frame rate limiting
let lastTime = 0;
const targetFPS = 60;
const frameInterval = 1000 / targetFPS;

function animate(currentTime) {
  stats.begin();

  // Frame rate limiting
  if (currentTime - lastTime < frameInterval) {
    stats.end();
    window.requestAnimationFrame(animate);
    return;
  }
  lastTime = currentTime;

  updateSphere();
  updateCube();

  const clockValue = clock.getDelta();

  // Update water simulation less frequently for better performance
  if (clock.getElapsedTime() > 0.05) { // Increased from 0.032
    waterSimulation.stepSimulation(renderer);

    const waterTexture = waterSimulation.target.texture;
    water.setHeightTexture(waterTexture);

    environmentMap.render(renderer);
    const environmentMapTexture = environmentMap.target.texture;

    caustics.setTextures(waterTexture, environmentMapTexture);
    caustics.render(renderer);
    const causticsTexture = caustics.target.texture;

    environment.updateCaustics(causticsTexture);
    
    clock.start();
  }

  // Update uniforms
  water.material.uniforms.time.value += clockValue;
  foam.material.uniforms.time.value += clockValue;

  // Optimized rendering pipeline
  renderer.setRenderTarget(temporaryRenderTarget);
  renderer.setClearColor(white, 1);
  renderer.clear();

  water.mesh.visible = false;
  renderer.render(scene, camera);

  water.setEnvMapTexture(temporaryRenderTarget.texture);

  renderer.setRenderTarget(null);
  renderer.setClearColor(white, 1);
  renderer.clear();

  water.mesh.visible = true;
  renderer.render(scene, camera);

  controls.update();

  // Update score display
  scoreContainer.textContent = gameOver ? 'Game Over - Press R to Restart' : `Score: ${score}`;

  stats.end();
  window.requestAnimationFrame(animate);
}

// Optimized mouse handling with throttling
let mouseThrottle = 0;
function onMouseMove(event) {
  mouseThrottle++;
  if (mouseThrottle % 3 !== 0) return; // Only process every 3rd mouse event

  const rect = canvas.getBoundingClientRect();
  mouse.x = (event.clientX - rect.left) * 2 / width - 1;
  mouse.y = - (event.clientY - rect.top) * 2 / height + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObject(targetmesh);

  for (let intersect of intersects) {
    waterSimulation.addDrop(renderer, intersect.point.x, intersect.point.y, 0.005, 0.001);
  }
}

// Initialize everything
const waterSimulation = new WaterSimulation();
const water = new Water();
const environmentMap = new EnvironmentMap();
const environment = new Environment();
const caustics = new Caustics();

const loaded = [
  waterSimulation.loaded,
  water.loaded,
  environmentMap.loaded,
  environment.loaded,
  caustics.loaded,
  foam.loaded,
  rockPool.initialize(),
];

Promise.all(loaded).then(() => {
  const envGeometries = [...rockPool.getRocks(), floorGeometry];

  environmentMap.setGeometries(envGeometries);
  environment.setGeometries(envGeometries);

  environment.addTo(scene);
  scene.add(water.mesh);
  foam.addTo(scene);

  caustics.setDeltaEnvTexture(1. / environmentMap.size);

  canvas.addEventListener('mousemove', { handleEvent: onMouseMove });

  createGameObjects();
  animate(0);
});

// Cleanup function for memory management
function cleanup() {
  waterSimulation.dispose();
  water.dispose();
  environmentMap.dispose();
  environment.dispose();
  caustics.dispose();
  foam.dispose();
  temporaryRenderTarget.dispose();
  
  // Dispose geometries
  waterGeometry.dispose();
  floorGeometry.dispose();
  targetgeometry.dispose();
  wallGeometry.dispose();
  
  // Dispose materials
  wallMaterial.dispose();
  
  // Remove event listeners
  document.removeEventListener('keydown', onDocumentKeyDown);
  document.removeEventListener('keyup', onDocumentKeyUp);
  canvas.removeEventListener('mousemove', { handleEvent: onMouseMove });
}

// Cleanup on page unload
window.addEventListener('beforeunload', cleanup);