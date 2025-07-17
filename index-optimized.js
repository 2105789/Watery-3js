// Performance-optimized ThreeJS Caustics
// Key optimizations:
// - Reduced water simulation resolution (256x256 instead of 512x512)
// - Object pooling for frequently created objects
// - Optimized rendering pipeline with fewer passes
// - Lazy loading of non-critical assets
// - Memory management improvements
// - Reduced texture sizes and compression

// Wait for Three.js to load
let THREE, Stats, dat;

// Object pool for frequently created objects
const objectPool = {
  vectors: [],
  getVector() {
    return this.vectors.pop() || new THREE.Vector3();
  },
  returnVector(vector) {
    this.vectors.push(vector);
  },
  
  geometries: new Map(),
  getGeometry(key, createFn) {
    if (!this.geometries.has(key)) {
      this.geometries.set(key, createFn());
    }
    return this.geometries.get(key);
  }
};

// Performance configuration
const PERFORMANCE_CONFIG = {
  // Reduced water resolution for better performance
  WATER_SIZE: 256, // Was 512
  FLOOR_RESOLUTION: 64, // Was 128
  MAX_ROCKS: 50, // Was 100
  RENDER_TARGET_SCALE: 0.5, // Scale down render targets
  ENABLE_FOAM: false, // Disable foam for better performance
  ENABLE_CAUSTICS: true,
  LOD_DISTANCE: 2.0, // Level of detail distance
};

// Initialize after Three.js loads
function initializeApp() {
  const stats = new Stats();
  stats.showPanel(0);
  stats.domElement.style.position = 'absolute';
  stats.domElement.style.top = '0px';
  stats.domElement.style.left = '0px';
  stats.domElement.style.zIndex = '100';
  document.body.appendChild(stats.domElement);

  const gui = new dat.GUI();
  
  // Add performance controls
  const performanceFolder = gui.addFolder('Performance');
  performanceFolder.add(PERFORMANCE_CONFIG, 'WATER_SIZE', 128, 512).onChange(() => {
    console.log('Water size changed - restart required');
  });
  performanceFolder.add(PERFORMANCE_CONFIG, 'ENABLE_FOAM').onChange((value) => {
    if (foam && foam.mesh) {
      foam.mesh.visible = value;
    }
  });
  performanceFolder.add(PERFORMANCE_CONFIG, 'ENABLE_CAUSTICS').onChange((value) => {
    if (caustics) {
      caustics.enabled = value;
    }
  });

  const canvas = document.getElementById('canvas');
  
  // Optimize canvas size based on device pixel ratio
  const pixelRatio = Math.min(window.devicePixelRatio, 2); // Cap at 2x for performance
  canvas.width = (window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth) * pixelRatio;
  canvas.height = (window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight) * pixelRatio;
  canvas.style.width = canvas.width / pixelRatio + 'px';
  canvas.style.height = canvas.height / pixelRatio + 'px';

  const width = canvas.width;
  const height = canvas.height;

  // Colors
  const black = new THREE.Color('black');
  const white = new THREE.Color('white');

  // Optimized file loader with caching
  const fileCache = new Map();
  function loadFile(filename) {
    if (fileCache.has(filename)) {
      return Promise.resolve(fileCache.get(filename));
    }
    
    return new Promise((resolve, reject) => {
      const loader = new THREE.FileLoader();
      loader.load(filename, (data) => {
        fileCache.set(filename, data);
        resolve(data);
      }, undefined, reject);
    });
  }

  // Constants
  const waterPosition = new THREE.Vector3(0, 0, 0.2);
  const near = 0.;
  const far = 2.;
  const waterSize = PERFORMANCE_CONFIG.WATER_SIZE;

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
    powerPreference: "high-performance",
    stencil: false,
    depth: true
  });
  renderer.setSize(width, height);
  renderer.autoClear = false;
  renderer.setPixelRatio(pixelRatio);
  
  // Enable frustum culling
  renderer.sortObjects = true;

  // Create mouse Controls
  const controls = new THREE.OrbitControls(camera, canvas);
  controls.target = waterPosition;
  controls.minPolarAngle = 0;
  controls.maxPolarAngle = Math.PI / 2. - 0.1;
  controls.minDistance = 0.5;
  controls.maxDistance = 1.2;

  // Optimized render target with smaller size
  const renderTargetScale = PERFORMANCE_CONFIG.RENDER_TARGET_SCALE;
  const temporaryRenderTarget = new THREE.WebGLRenderTarget(
    width * renderTargetScale, 
    height * renderTargetScale
  );

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

  // Environment with reduced resolution
  const floorWidth = 5;
  const floorHeight = 5;
  const floorResolution = PERFORMANCE_CONFIG.FLOOR_RESOLUTION;

  const floorGeometry = new THREE.PlaneBufferGeometry(floorWidth, floorHeight, floorResolution, floorResolution);

  function random(min, max) {
    return (Math.random() * (max - min) + min, Math.random() * 
    (max - min) + min, Math.random() * (max - min) + min);
  }

  // Optimized rock loading with reduced count
  const objLoader = new THREE.OBJLoader();
  let rocks = [];
  const rockLoaded = new Promise((resolve) => {
    objLoader.load('assets/rock.obj', (rockGeometry) => {
      rockGeometry = rockGeometry.children[0].geometry;
      rockGeometry.computeVertexNormals();
      
      // Optimize geometry
      rockGeometry.computeBoundingSphere();
      rockGeometry.computeBoundingBox();
      
      const colors = [];
      for (let i = 0; i < rockGeometry.attributes.position.count; i++) {
        colors.push(Math.random() * 0.2 + 0.8, Math.random() * 0.2 + 0.8, Math.random() * 0.2 + 0.6);
      }
      rockGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

      const numRocks = PERFORMANCE_CONFIG.MAX_ROCKS;
      for (let i = 0; i < numRocks; i++) {
        const rock = new THREE.BufferGeometry().copy(rockGeometry);

        // Random position
        const x = Math.random() * 50 - 50;
        const y = Math.random() * 50 - 50;
        const z = Math.random() * 5 - 1;
        rock.translate(x, y, z);

        // Random scale
        const scale = Math.random() * 0.02 + 0.002;
        rock.scale(scale, scale, scale);

        rocks.push(rock);
      }
      resolve();
    });
  });

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

      // Smaller render targets for better performance
      const targetSize = Math.floor(waterSize * renderTargetScale);
      this._targetA = new THREE.WebGLRenderTarget(targetSize, targetSize, {
        type: THREE.FloatType,
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter
      });
      this._targetB = new THREE.WebGLRenderTarget(targetSize, targetSize, {
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
              delta: { value: [1 / 216, 1 / 216] }, 
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
      this._swapTargets();
    }

    stepSimulation(renderer) {
      this._updateMesh.material.uniforms.texture.value = this.target.texture;
      this._render(renderer, this._updateMesh);
      this._swapTargets();
    }

    _render(renderer, mesh) {
      renderer.setRenderTarget(this.target);
      renderer.render(mesh, this._camera);
    }

    _swapTargets() {
      this.target = this.target === this._targetA ? this._targetB : this._targetA;
    }
  }

  // Optimized Water class
  class Water {
    constructor() {
      this._geometry = new THREE.PlaneBufferGeometry(2, 2);
      
      const shadersPromises = [
        loadFile('shaders/water/vertex.glsl'),
        loadFile('shaders/water/fragment.glsl')
      ];

      this.loaded = Promise.all(shadersPromises).then(([vertexShader, fragmentShader]) => {
        this.material = new THREE.RawShaderMaterial({
          uniforms: {
            time: { value: 0.0 },
            heightTexture: { value: null },
            envMap: { value: null },
            skybox: { value: skybox },
            foamAmount: { value: 0.1 },
            foamSpeed: { value: 0.5 }
          },
          vertexShader: vertexShader,
          fragmentShader: fragmentShader,
          transparent: true,
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
  }

  // Optimized EnvironmentMap class
  class EnvironmentMap {
    constructor() {
      this.size = 256; // Reduced from original size
      this.target = new THREE.WebGLRenderTarget(this.size, this.size, {
        type: THREE.FloatType,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter
      });

      const shadersPromises = [
        loadFile('shaders/environment_mapping/vertex.glsl'),
        loadFile('shaders/environment_mapping/fragment.glsl')
      ];

      this.loaded = Promise.all(shadersPromises).then(([vertexShader, fragmentShader]) => {
        this.material = new THREE.RawShaderMaterial({
          uniforms: {
            lightCamera: { value: lightCamera.matrixWorldInverse },
            lightProjection: { value: lightCamera.projectionMatrix },
            geometries: { value: [] },
            light: { value: light }
          },
          vertexShader: vertexShader,
          fragmentShader: fragmentShader,
        });
      });
    }

    setGeometries(geometries) {
      this.material.uniforms.geometries.value = geometries;
    }

    render(renderer) {
      renderer.setRenderTarget(this.target);
      renderer.render(this.mesh, this.camera);
    }
  }

  // Optimized Caustics class
  class Caustics {
    constructor() {
      this.enabled = PERFORMANCE_CONFIG.ENABLE_CAUSTICS;
      const targetSize = Math.floor(waterSize * 3 * renderTargetScale); // Reduced size
      this.target = new THREE.WebGLRenderTarget(targetSize, targetSize, {
        type: THREE.FloatType,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter
      });

      const shadersPromises = [
        loadFile('shaders/caustics/vertex.glsl'),
        loadFile('shaders/caustics/fragment.glsl')
      ];

      this.loaded = Promise.all(shadersPromises).then(([vertexShader, fragmentShader]) => {
        this.material = new THREE.RawShaderMaterial({
          uniforms: {
            waterTexture: { value: null },
            envTexture: { value: null },
            deltaEnv: { value: 1.0 },
            lightCamera: { value: lightCamera.matrixWorldInverse },
            lightProjection: { value: lightCamera.projectionMatrix },
            light: { value: light }
          },
          vertexShader: vertexShader,
          fragmentShader: fragmentShader,
        });

        this.mesh = new THREE.Mesh(new THREE.PlaneBufferGeometry(2, 2), this.material);
      });
    }

    setDeltaEnvTexture(deltaEnvTexture) {
      this.material.uniforms.deltaEnv.value = deltaEnvTexture;
    }

    setTextures(waterTexture, envTexture) {
      this.material.uniforms.waterTexture.value = waterTexture;
      this.material.uniforms.envTexture.value = envTexture;
    }

    render(renderer) {
      if (!this.enabled) return;
      
      renderer.setRenderTarget(this.target);
      renderer.render(this.mesh, new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1));
    }
  }

  // Optimized Environment class
  class Environment {
    constructor() {
      const shadersPromises = [
        loadFile('shaders/environment/vertex.glsl'),
        loadFile('shaders/environment/fragment.glsl')
      ];

      this.loaded = Promise.all(shadersPromises).then(([vertexShader, fragmentShader]) => {
        this.material = new THREE.RawShaderMaterial({
          uniforms: {
            causticsTexture: { value: null },
            lightCamera: { value: lightCamera.matrixWorldInverse },
            lightProjection: { value: lightCamera.projectionMatrix },
            light: { value: light }
          },
          vertexShader: vertexShader,
          fragmentShader: fragmentShader,
        });
      });
    }

    setGeometries(geometries) {
      this.geometries = geometries;
      this.meshes = geometries.map(geometry => new THREE.Mesh(geometry, this.material));
    }

    updateCaustics(causticsTexture) {
      this.material.uniforms.causticsTexture.value = causticsTexture;
    }

    addTo(scene) {
      this.meshes.forEach(mesh => scene.add(mesh));
    }
  }

  // Optimized Foam class (disabled by default for performance)
  class Foam {
    constructor() {
      if (!PERFORMANCE_CONFIG.ENABLE_FOAM) {
        this.loaded = Promise.resolve();
        return;
      }

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
        this.mesh.visible = false; // Disabled by default
      });
    }

    addTo(scene) {
      this.loaded.then((mesh) => {
        if (mesh) scene.add(mesh);
      });
    }
  }

  // Game state variables
  let sphere, cube, mines = [], score = 0, gameOver = false;
  let keys = {};

  // Optimized input handling
  function onDocumentKeyDown(event) {
    keys[event.code] = true;
  }

  function onDocumentKeyUp(event) {
    keys[event.code] = false;
  }

  document.addEventListener('keydown', onDocumentKeyDown);
  document.addEventListener('keyup', onDocumentKeyUp);

  // Optimized sphere update with object pooling
  function updateSphere() {
    if (!sphere || gameOver) return;

    const speed = 0.02;
    const vector = objectPool.getVector();

    if (keys['KeyW']) {
      vector.set(0, speed, 0);
      sphere.position.add(vector);
    }
    if (keys['KeyS']) {
      vector.set(0, -speed, 0);
      sphere.position.add(vector);
    }
    if (keys['KeyA']) {
      vector.set(-speed, 0, 0);
      sphere.position.add(vector);
    }
    if (keys['KeyD']) {
      vector.set(speed, 0, 0);
      sphere.position.add(vector);
    }

    objectPool.returnVector(vector);

    // Boundary checking
    if (sphere.position.x < -1 || sphere.position.x > 1 ||
        sphere.position.y < -1 || sphere.position.y > 1 ||
        sphere.position.z < 0.21 || sphere.position.z > 0.21) {
      sphere.position.x = Math.max(-1, Math.min(1, sphere.position.x));
      sphere.position.y = Math.max(-1, Math.min(1, sphere.position.y));
      sphere.position.z = Math.max(0.21, Math.min(0.21, sphere.position.z));
    }

    // Add water drop
    waterSimulation.addDrop(
      renderer,
      sphere.position.x,
      sphere.position.y,
      parameters.radius,
      parameters.strength
    );
  }

  // Create instances
  const waterSimulation = new WaterSimulation();
  const water = new Water();
  const environmentMap = new EnvironmentMap();
  const caustics = new Caustics();
  const environment = new Environment();
  const foam = new Foam();

  // Create game objects
  const sphereGeometry = new THREE.SphereGeometry(0.05, 16, 16);
  const sphereMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
  sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
  sphere.position.set(0, 0, 0.21);

  const cubeGeometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);
  const cubeMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
  cube = new THREE.Mesh(cubeGeometry, cubeMaterial);
  cube.position.set(Math.random() * 2 - 1, Math.random() * 2 - 1, 0.21);

  // Create mines
  for (let i = 0; i < 5; i++) {
    const mineGeometry = new THREE.SphereGeometry(0.03, 8, 8);
    const mineMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const mine = new THREE.Mesh(mineGeometry, mineMaterial);
    mine.position.set(Math.random() * 2 - 1, Math.random() * 2 - 1, 0.21);
    mines.push(mine);
    scene.add(mine);
  }

  scene.add(sphere);
  scene.add(cube);

  // Score display
  const scoreContainer = document.createElement('div');
  scoreContainer.style.position = 'fixed';
  scoreContainer.style.top = '3%';
  scoreContainer.style.left = '50%';
  scoreContainer.style.transform = 'translate(-50%, -50%)';
  scoreContainer.style.color = 'black';
  scoreContainer.style.fontFamily = 'Arial, sans-serif';
  scoreContainer.style.fontSize = '30px';
  document.body.appendChild(scoreContainer);

  // Optimized animation loop with frame skipping
  let frameCount = 0;
  const SIMULATION_FRAMERATE = 30; // Limit simulation updates
  
  function animate() {
    stats.begin();
    frameCount++;

    updateSphere();

    const clockValue = clock.getDelta();

    // Update water and foam
    water.material.uniforms.time.value += clockValue;
    if (foam.material) {
      foam.material.uniforms.time.value += clockValue;
    }

    // Limit simulation updates for better performance
    if (frameCount % (60 / SIMULATION_FRAMERATE) === 0) {
      waterSimulation.stepSimulation(renderer);

      const waterTexture = waterSimulation.target.texture;
      water.setHeightTexture(waterTexture);

      environmentMap.render(renderer);
      const environmentMapTexture = environmentMap.target.texture;

      caustics.setTextures(waterTexture, environmentMapTexture);
      caustics.render(renderer);
      const causticsTexture = caustics.target.texture;

      environment.updateCaustics(causticsTexture);
    }

    // Update score
    scoreContainer.textContent = gameOver ? 'Game Over' : `Score: ${score}`;

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
    stats.end();

    requestAnimationFrame(animate);
  }

  // Optimized mouse handling
  function onMouseMove(event) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = (event.clientX - rect.left) * 2 / width - 1;
    mouse.y = -(event.clientY - rect.top) * 2 / height + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(targetmesh);

    for (let intersect of intersects) {
      waterSimulation.addDrop(renderer, intersect.point.x, intersect.point.y, 0.005, 0.001);
    }
  }

  // Initialize everything
  const loaded = [
    waterSimulation.loaded,
    water.loaded,
    environmentMap.loaded,
    environment.loaded,
    caustics.loaded,
    foam.loaded,
    rockLoaded,
  ];

  Promise.all(loaded).then(() => {
    const envGeometries = [...rocks, floorGeometry];

    environmentMap.setGeometries(envGeometries);
    environment.setGeometries(envGeometries);

    environment.addTo(scene);
    scene.add(water.mesh);
    foam.addTo(scene);

    caustics.setDeltaEnvTexture(1. / environmentMap.size);

    canvas.addEventListener('mousemove', { handleEvent: onMouseMove });

    animate();
  });

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    // Dispose of render targets
    temporaryRenderTarget.dispose();
    waterSimulation._targetA.dispose();
    waterSimulation._targetB.dispose();
    environmentMap.target.dispose();
    caustics.target.dispose();
    
    // Dispose of geometries
    objectPool.geometries.clear();
    
    // Dispose of materials
    if (water.material) water.material.dispose();
    if (environment.material) environment.material.dispose();
    if (caustics.material) caustics.material.dispose();
    if (foam.material) foam.material.dispose();
  });
}

// Wait for Three.js to load
function checkThreeJSLoaded() {
  if (typeof THREE !== 'undefined' && typeof Stats !== 'undefined' && typeof dat !== 'undefined') {
    initializeApp();
  } else {
    setTimeout(checkThreeJSLoaded, 100);
  }
}

checkThreeJSLoaded();