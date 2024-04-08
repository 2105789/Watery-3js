const stats = new Stats();
stats.showPanel(0); // Show the FPS panel
stats.domElement.style.position = 'absolute'; 
stats.domElement.style.top = '0px'; 
stats.domElement.style.left = '0px'; 
stats.domElement.style.zIndex = '100'; 
document.body.appendChild(stats.domElement);


const gui = new dat.GUI();


const canvas = document.getElementById('canvas');

canvas.width = window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth;
canvas.height = window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight;

const width = canvas.width;
const height = canvas.height;

// Colors
const black = new THREE.Color('black');
const white = new THREE.Color('white');

function loadFile(filename) {
  return new Promise((resolve, reject) => {
    const loader = new THREE.FileLoader();

    loader.load(filename, (data) => {
      resolve(data);
    });
  });
}

// Constants
const waterPosition = new THREE.Vector3(0, 0, 0.2);
const near = 0.;
const far = 2.;
const waterSize = 512;

// Create directional light
const light = [0., 0., -1.];
const lightCamera = new THREE.OrthographicCamera(-1.2, 1.2, 1.2, -1.2, near, far);
lightCamera.position.set(0., 0., 1.5);
lightCamera.lookAt(0, 0, 0);

// Create Renderer
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, width / height, 0.01, 100);
camera.position.set(-1.5, -1.5, 1);
camera.up.set(0, 0, 1);
scene.add(camera);

const renderer = new THREE.WebGLRenderer({canvas: canvas, antialias: true, alpha: true});
renderer.setSize(width, height);
renderer.autoClear = false;

// Create mouse Controls
const controls = new THREE.OrbitControls(
  camera,
  canvas
);

controls.target = waterPosition;

controls.minPolarAngle = 0;
controls.maxPolarAngle = Math.PI / 2. - 0.1;

controls.minDistance = 0.5;
controls.maxDistance = 1.2;

// Target for computing the water refraction
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

// Geometries
const waterGeometry = new THREE.PlaneBufferGeometry(2, 2, waterSize, waterSize);

// Environment
const floorWidth = 5;
const floorHeight = 5;
const floorResolution = 128; // Adjust this value to control the resolution of the noise

const floorGeometry = new THREE.PlaneBufferGeometry(floorWidth, floorHeight, floorResolution, floorResolution);

function random(min, max) {
  return (Math.random() * (max - min) + min, Math.random() * (max - min) + min, Math.random() * (max - min) + min);
}

const objLoader = new THREE.OBJLoader();
let rocks = [];
const rockLoaded = new Promise((resolve) => {
  objLoader.load('assets/rock.obj', (rockGeometry) => {
    rockGeometry = rockGeometry.children[0].geometry;
    rockGeometry.computeVertexNormals();
    const colors = [];
    for (let i = 0; i < rockGeometry.attributes.position.count; i++) {
      colors.push(Math.random() * 0.2 + 0.8, Math.random() * 0.2 + 0.8, Math.random() * 0.2 + 0.6); // Adjust color range as needed
    }
    rockGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const numRocks = 100; // Adjust the number of rocks as desired
    for (let i = 0; i < numRocks; i++) {
      const rock = new THREE.BufferGeometry().copy(rockGeometry);

      // Random position
      const x = Math.random() * 50 - 50;
      const y = Math.random() * 50 - 50;
      const z = Math.random() * 5 - 1 ; // Random height above the water
      rock.translate(x, y, z);

      // Random scale
      const scale = Math.random() * 0.02 + 0.002; // Random scale between 0.02 and 0.12
      rock.scale(scale, scale, scale);

      const rotationZ = Math.random() * Math.PI * 2;
      rock.rotateZ(rotationZ);

      rocks.push(rock);
    }
    resolve();
  });
});



// Skybox
const cubetextureloader = new THREE.CubeTextureLoader();

const skybox = cubetextureloader.load([
  'assets/TropicalSunnyDay_px.jpg', 'assets/TropicalSunnyDay_nx.jpg',
  'assets/TropicalSunnyDay_py.jpg', 'assets/TropicalSunnyDay_ny.jpg',
  'assets/TropicalSunnyDay_pz.jpg', 'assets/TropicalSunnyDay_nz.jpg',
]);

scene.background = skybox;


class WaterSimulation {

  constructor() {
    this._camera = new THREE.OrthographicCamera(0, 1, 1, 0, 0, 2000);

    this._geometry = new THREE.PlaneBufferGeometry(2, 2);

    this._targetA = new THREE.WebGLRenderTarget(waterSize, waterSize, {type: THREE.FloatType});
    this._targetB = new THREE.WebGLRenderTarget(waterSize, waterSize, {type: THREE.FloatType});
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
            waveAmplitude: { value: 0.025 }, // Adjust the amplitude as needed
            waveFrequency: { value: 4.0 },  // Adjust the frequency as needed
            waveSpeed: { value: 0.5 },     // Adjust the wave speed as needed
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

  // Add a drop of water at the (x, y) coordinate (in the range [-1, 1])
  addDrop(renderer, x, y, radius, strength) {
    this._dropMesh.material.uniforms['center'].value = [x, y];
    this._dropMesh.material.uniforms['radius'].value = radius;
    this._dropMesh.material.uniforms['strength'].value = strength;

    this._render(renderer, this._dropMesh);
  }

  stepSimulation(renderer) {
    this._render(renderer, this._updateMesh);
  }

  _render(renderer, mesh) {
    // Swap textures
    const _oldTarget = this.target;
    const _newTarget = this.target === this._targetA ? this._targetB : this._targetA;

    const oldTarget = renderer.getRenderTarget();

    renderer.setRenderTarget(_newTarget);

    mesh.material.uniforms['texture'].value = _oldTarget.texture;

    renderer.render(mesh, this._camera);

    renderer.setRenderTarget(oldTarget);

    this.target = _newTarget;
  }

}


const textureLoader = new THREE.TextureLoader();

class Water {

  constructor() {
    this.geometry = waterGeometry;

    const shadersPromises = [
      loadFile('shaders/water/vertex.glsl'),
      loadFile('shaders/water/fragment.glsl')
    ];

    this.loaded = Promise.all(shadersPromises)
        .then(([vertexShader, fragmentShader]) => {
          this.material = new THREE.ShaderMaterial({
            uniforms: {
                light: { value: light },
                water: { value: null },
                envMap: { value: null },
                skybox: { value: skybox },
            },
            vertexShader: vertexShader,
            fragmentShader: fragmentShader,
          });          
      this.material.uniforms.fresnelBias = { value: parameters.fresnelBias };
      this.material.uniforms.time = { value: 0.0 };
      this.material.uniforms.waveAmplitude = { value: 0.05 };
      this.material.uniforms.waveFrequency = { value: 2.0 };
      this.material.uniforms.waveSpeed = { value: 0.5 };
      this.material.extensions = {
        derivatives: true
      };

      this.mesh = new THREE.Mesh(this.geometry, this.material);
      this.mesh.position.set(waterPosition.x, waterPosition.y, waterPosition.z);
    });
  }

  setHeightTexture(waterTexture) {
    this.material.uniforms['water'].value = waterTexture;
  }

  setEnvMapTexture(envMap) {
    this.material.uniforms['envMap'].value = envMap;
  }

}


// This renders the environment map seen from the light POV.
// The resulting texture contains (posx, posy, posz, depth) in the colors channels.
class EnvironmentMap {

  constructor() {
    this.size = 512;
    this.target = new THREE.WebGLRenderTarget(this.size, this.size, {type: THREE.FloatType});

    const shadersPromises = [
      loadFile('shaders/environment_mapping/vertex.glsl'),
      loadFile('shaders/environment_mapping/fragment.glsl')
    ];

    this._meshes = [];

    this.loaded = Promise.all(shadersPromises)
        .then(([vertexShader, fragmentShader]) => {
      this._material = new THREE.ShaderMaterial({
        vertexShader: vertexShader,
        fragmentShader: fragmentShader,
      });
    });
  }

  setGeometries(geometries) {
    this._meshes = [];

    for (let geometry of geometries) {
      this._meshes.push(new THREE.Mesh(geometry, this._material));
    }
  }

  render(renderer) {
    const oldTarget = renderer.getRenderTarget();

    renderer.setRenderTarget(this.target);
    renderer.setClearColor(black, 0);
    renderer.clear();

    for (let mesh of this._meshes) {
      renderer.render(mesh, lightCamera);
    }

    renderer.setRenderTarget(oldTarget);
  }

}


class Caustics {

  constructor() {this.target = new THREE.WebGLRenderTarget(waterSize * 6., waterSize * 6., {type: THREE.FloatType});
    this._waterGeometry = waterGeometry.clone();

    const shadersPromises = [
      loadFile('shaders/caustics/water_vertex.glsl'),
      loadFile('shaders/caustics/water_fragment.glsl'),
    ];

    this.loaded = Promise.all(shadersPromises)
        .then(([waterVertexShader, waterFragmentShader]) => {
      this._waterMaterial = new THREE.ShaderMaterial({
        uniforms: {
          light: { value: light },
          env: { value: null },
          water: { value: null },
          deltaEnvTexture: { value: null },
        },
        vertexShader: waterVertexShader,
        fragmentShader: waterFragmentShader,
        transparent: true,
      });

      this._waterMaterial.blending = THREE.CustomBlending;

      // Set the blending so that:
      // Caustics intensity uses an additive function
      this._waterMaterial.blendEquation = THREE.AddEquation;
      this._waterMaterial.blendSrc = THREE.OneFactor;
      this._waterMaterial.blendDst = THREE.OneFactor;

      // Caustics depth does not use blending, we just set the value
      this._waterMaterial.blendEquationAlpha = THREE.AddEquation;
      this._waterMaterial.blendSrcAlpha = THREE.OneFactor;
      this._waterMaterial.blendDstAlpha = THREE.ZeroFactor;


      this._waterMaterial.side = THREE.DoubleSide;
      this._waterMaterial.extensions = {
        derivatives: true
      };

      this._waterMesh = new THREE.Mesh(this._waterGeometry, this._waterMaterial);
    });
  }
  

  setDeltaEnvTexture(deltaEnvTexture) {
    this._waterMaterial.uniforms['deltaEnvTexture'].value = deltaEnvTexture;
  }

  setTextures(waterTexture, envTexture) {
    this._waterMaterial.uniforms['env'].value = envTexture;
    this._waterMaterial.uniforms['water'].value = waterTexture;
  }

  render(renderer) {
    const oldTarget = renderer.getRenderTarget();

    renderer.setRenderTarget(this.target);
    renderer.setClearColor(black, 0);
    renderer.clear();

    renderer.render(this._waterMesh, lightCamera);

    renderer.setRenderTarget(oldTarget);
  }

}


class Environment {

  constructor() {
    const shadersPromises = [
      loadFile('shaders/environment/vertex.glsl'),
      loadFile('shaders/environment/fragment.glsl')
    ];

    this._meshes = [];

    this.loaded = Promise.all(shadersPromises).then(([vertexShader, fragmentShader]) => {
      this._material = new THREE.ShaderMaterial({
        uniforms: {
          light: { value: light },
          caustics: { value: null },
          lightProjectionMatrix: { value: lightCamera.projectionMatrix },
          lightViewMatrix: { value: lightCamera.matrixWorldInverse  }
        },
        vertexShader: vertexShader,
        fragmentShader: fragmentShader,
      });
    });
  }

  setGeometries(geometries) {
    this._meshes = [];

    for (let geometry of geometries) {
      this._meshes.push(new THREE.Mesh(geometry, this._material));
    }
  }

  updateCaustics(causticsTexture) {
    this._material.uniforms['caustics'].value = causticsTexture;
  }

  addTo(scene) {
    for (let mesh of this._meshes) {
      scene.add(mesh);
    }
  }

}


class Debug {

  constructor() {
    this._camera = new THREE.OrthographicCamera(0, 1, 1, 0, 0, 1);
    this._geometry = new THREE.PlaneBufferGeometry();

    const shadersPromises = [
      loadFile('shaders/debug/vertex.glsl'),
      loadFile('shaders/debug/fragment.glsl')
    ];

    this.loaded = Promise.all(shadersPromises)
        .then(([vertexShader, fragmentShader]) => {
      this._material = new THREE.RawShaderMaterial({
        uniforms: {
            texture: { value: null },
        },
        vertexShader: vertexShader,
        fragmentShader: fragmentShader,
      });

      this._mesh = new THREE.Mesh(this._geometry, this._material);
      this._material.transparent = true;
    });
  }

  draw(renderer, texture) {
    this._material.uniforms['texture'].value = texture;

    const oldTarget = renderer.getRenderTarget();

    renderer.setRenderTarget(null);
    renderer.render(this._mesh, this._camera);

    renderer.setRenderTarget(oldTarget);
  }

}

const waterSimulation = new WaterSimulation();

const water = new Water();

const environmentMap = new EnvironmentMap();
const environment = new Environment();
const caustics = new Caustics();

const debug = new Debug();

const spherefolder = gui.addFolder('Sphere')
const waterfolder = gui.addFolder('Water')
const foamFolder = gui.addFolder('Foam');

const parameters = {
  sphereColor: "#ff8d00", // initial color of the cube in hexadecimal
  radius: 0.01, // initial radius
  strength: 0.005, // initial strength
  speed:0.001,
  ammute : 0.92,
  fresnelBias: 0.8, // initial fresnelBias
  foamColor: "#EEF5FF", 
  foamSeed: 80.57207917054751//Math.random() * (100 - 0) + 0,
};
console.log(parameters.foamSeed);

spherefolder.addColor(parameters, 'sphereColor').onChange(function (value) {
  sphereMaterial.color.set(value); // set the color of the sphere
});
spherefolder.add(parameters,'speed', 0.001, 0.01).name('Sphere Speed');

waterfolder.add(parameters,'radius', 0.01, 0.1).name('Wave Radius');
waterfolder.add(parameters,'strength', 0.005, 0.05).name('Wave Strength');
const ammuteController = waterfolder.add(parameters, 'ammute', 0.8, 1.0).name('Waves');
ammuteController.onChange((value) => {
  waterSimulation._updateMesh.material.uniforms.ammute.value = value;
});

foamFolder.addColor(parameters, 'foamColor').name('Foam Color').onChange(function (value) {
  foam.material.uniforms.foamColor.value = new THREE.Color(value); // set the color of the foam
});
foamFolder.add(parameters, 'foamSeed', 0, 100).name('Foam Seed').onChange(function (value) {
  foam.material.uniforms.seed.value = value; // set the seed of the foam
});



// foamFolder.add(foamMaterial.uniforms.seed, 'value', 0, 1000).name('Foam Seed').onChange(() => {
//   // No need to do anything here since the seed value is directly updated in the uniform
// });

// const fresnelBiasController = waterfolder.add(parameters, 'fresnelBias', 0.0, 1.0).name('Fresnel Bias');
// fresnelBiasController.onChange((value) => {
//   water.material.uniforms['fresnelBias'].value = value;
// });


let score = 0;
let gameOver = false;
let cubePosition = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, 0.24);
const cubeSize = 0.02;


// Create a sphere
const sphereGeometry = new THREE.SphereGeometry(0.025, 25,25); // Smaller sphere
const sphereMaterial = new THREE.MeshBasicMaterial({ color: 0xff8d00 });
const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
sphere.position.set(0, 0, 0.21); // Position the sphere above the water
scene.add(sphere);

// Variables to control the sphere's movement
let sphereSpeed = 0.001; 
let sphereDirection = new THREE.Vector3();

// Handle keyboard input
document.addEventListener('keydown', onDocumentKeyDown, false);
document.addEventListener('keyup', onDocumentKeyUp, false);

function onDocumentKeyDown(event) {
  const keyCode = event.which;

  if (keyCode === 87) { // W
    sphereDirection.z = -1; // Move forward
  } else if (keyCode === 83) { // S
    sphereDirection.z = 1; // Move backward
  } else if (keyCode === 65) { // A
    sphereDirection.x = -1;
  } else if (keyCode === 68) { // D
    sphereDirection.x = 1;
  }

  // Normalize the direction vector
  sphereDirection.normalize();
}

function onDocumentKeyUp(event) {
  const keyCode = event.which;

  if (
    keyCode === 87 || // W
    keyCode === 83 || // S
    keyCode === 65 || // A
    keyCode === 68    // D
  ) {
    sphereDirection.set(0, 0, 0);
  }
}

// Create a cube
const cubeGeometry = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize);
const cubeMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });
const cube = new THREE.Mesh(cubeGeometry, cubeMaterial);
cube.position.copy(cubePosition);
scene.add(cube);

// Create mines (obstacles)
const mineGeometry = new THREE.BufferGeometry();

const vertices = [];
const normals = [];
const indices = [];

const spikeCount = 20; // Number of spikes
const radius = 0.02; // Radius of the sphere
const spikeheight = 0.02; // Height of the spikes

// Generate vertices, normals, and indices for the thorny geometry
for (let i = 0; i < spikeCount; i++) {
  const angle = (i / spikeCount) * Math.PI * 2;
  const x = radius * Math.cos(angle);
  const y = radius * Math.sin(angle);
  const z = 0;

  vertices.push(x, y, z); // Base vertex
  normals.push(0, 0, -1); // Base normal

  vertices.push(x, y, spikeheight); // Spike vertex
  normals.push(x / radius, y / radius, 1); // Spike normal

  indices.push(i * 2, i * 2 + 1); // Base to spike
}

mineGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices), 3));
mineGeometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), 3));
mineGeometry.setIndex(new THREE.BufferAttribute(new Uint16Array(indices), 1));

const mineMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000 });
const mines = [];
const numMines = 10; // Change this value to adjust the number of mines

for (let i = 0; i < numMines; i++) {
  const mine = new THREE.Mesh(mineGeometry, mineMaterial);
  mine.position.set(
    Math.random() * 2 - 1,
    Math.random() * 2 - 1,
    0.21
  );
  scene.add(mine);
  mines.push(mine);
}


for (let i = 0; i < numMines; i++) {
  const mine = new THREE.Mesh(mineGeometry, mineMaterial);
  mine.position.set(
    Math.random() * 2 - 1,
    Math.random() * 2 - 1,
    0.21
  );
  scene.add(mine);
  mines.push(mine);
}

function updateCube() {
  cube.rotation.x += 0.01;
  cube.rotation.y += 0.01;
  cube.rotation.z += 0.01;

  // Check if the sphere is near the cube
  const distance = sphere.position.distanceTo(cube.position);
  if (distance < cubeSize + 0.025) {
    score++;
    cubePosition = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, 0.21);
    cube.position.copy(cubePosition);
  }
}


// Update the sphere's position and interact with the water
function updateCube() {
  cube.rotation.x += 0.01;
  cube.rotation.y += 0.01;
  cube.rotation.z += 0.01;

  // Check if the sphere is near the cube
  const distance = sphere.position.distanceTo(cube.position);
  if (distance < cubeSize + 0.025) {
    score++;
    cubePosition = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, 0.21);
    cube.position.copy(cubePosition);
  }
}

// Update the sphere's position and interact with the water
function updateSphere() {
  updateCube();

  // Check for collisions with mines
  for (const mine of mines) {
    const distance = sphere.position.distanceTo(mine.position);
    if (distance < 0.045) {
      gameOver = true;
      score = 0;
      break;
    }
  }

  if (!gameOver) {
    // Transform the sphere's direction based on the camera's rotation
    let transformedDirection = sphereDirection.clone().applyQuaternion(camera.quaternion);

    sphere.position.add(transformedDirection.multiplyScalar(parameters.speed));

    // Check if the cube is outside the water bounds
    if (
      sphere.position.x < -1 ||
      sphere.position.x > 1 ||
      sphere.position.y < -1 ||
      sphere.position.y > 1 ||
      sphere.position.z < 0.21 ||
      sphere.position.z > 0.21
    ) {
      // Clamp the sphere's position to the water bounds
      sphere.position.x = Math.max(-1, Math.min(1, sphere.position.x));
      sphere.position.y = Math.max(-1, Math.min(1, sphere.position.y));
      sphere.position.z = Math.max(0.21, Math.min(0.21, sphere.position.z));
    }

    // Add a drop to the water simulation
    waterSimulation.addDrop(
      renderer,
      sphere.position.x,
      sphere.position.y,
      parameters.radius,
      parameters.strength
    );
  } else {
    // Despawn mines, cube, and sphere
    for (const mine of mines) {
      scene.remove(mine);
    }
    scene.remove(cube);
    scene.remove(sphere);
  }
}

// Create a geometry
var geometry = new THREE.BoxGeometry(2, 2, 1);

// Remove the top face (the 4th and 5th faces)
geometry.faces.splice(8);

// Create a material
var material = new THREE.MeshBasicMaterial({
  color: 0x66e5ff, 
  side: THREE.DoubleSide,
  transparent: true,
  opacity: 0.7
});

// Create a cube
var wall = new THREE.Mesh(geometry, material);
wall.position.set(0, 0, -0.3);
// Add the cube to the scene
scene.add(wall);

// Render the score
const scoreContainer = document.createElement('div');
scoreContainer.style.position = 'fixed';  // Change to fixed for absolute positioning relative to viewport
scoreContainer.style.top = '3%';
scoreContainer.style.left = '50%';
scoreContainer.style.transform = 'translate(-50%, -50%)';  // Center the element horizontally and vertically
scoreContainer.style.color = 'black';
scoreContainer.style.fontFamily = 'Arial, sans-serif';
scoreContainer.style.fontSize = '30px';
document.body.appendChild(scoreContainer);

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

      return this.mesh; // Return the mesh to allow chaining
    });
  }

  addTo(scene) {
    this.loaded.then((mesh) => {
      scene.add(mesh);
    });
  }
}

const foam = new Foam();


// Main rendering loop
function animate() {
  stats.begin();
  //updateBoat();
  updateSphere();

  let clockValue = clock.getDelta()

  // Update the water
  water.material.uniforms.time.value += clockValue;
  foam.material.uniforms.time.value += clockValue;
  // Update the water
  if (clock.getElapsedTime() > 0.032) {
    waterSimulation.stepSimulation(renderer);

    const waterTexture = waterSimulation.target.texture;

    water.setHeightTexture(waterTexture);

    environmentMap.render(renderer);
    const environmentMapTexture = environmentMap.target.texture;

    caustics.setTextures(waterTexture, environmentMapTexture);
    caustics.render(renderer);
    const causticsTexture = caustics.target.texture;

    // debug.draw(renderer, environmentMapTexture);
    // debug.draw(renderer, causticsTexture);

    environment.updateCaustics(causticsTexture);
    // Update the score text
    scoreContainer.textContent = gameOver ? 'Game Over' : `Score: ${score}`;

    clock.start();
  }

  // Render everything but the refractive water
  renderer.setRenderTarget(temporaryRenderTarget);
  renderer.setClearColor(white, 1);
  renderer.clear();

  water.mesh.visible = false;
  renderer.render(scene, camera);

  water.setEnvMapTexture(temporaryRenderTarget.texture);

  // Then render the final scene with the refractive water
  renderer.setRenderTarget(null);
  renderer.setClearColor(white, 1);
  renderer.clear();

  water.mesh.visible = true;
  renderer.render(scene, camera);

  controls.update();

  stats.end();

  window.requestAnimationFrame(animate);
}

function onMouseMove(event) {
  const rect = canvas.getBoundingClientRect();

  mouse.x = (event.clientX - rect.left) * 2 / width - 1;
  mouse.y = - (event.clientY - rect.top) * 2 / height + 1;

  raycaster.setFromCamera(mouse, camera);

  const intersects = raycaster.intersectObject(targetmesh);

  for (let intersect of intersects) {
    waterSimulation.addDrop(renderer, intersect.point.x, intersect.point.y, 0.005, 0.001);
  }
}

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
