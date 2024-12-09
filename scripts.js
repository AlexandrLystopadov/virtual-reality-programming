import * as THREE from 'three';
import { Wireframe } from '/node_modules/three/examples/jsm/Addons.js';
import { OrbitControls } from '/node_modules/three/examples/jsm/Addons.js';
import { PointerLockControls } from '/node_modules/three/examples/jsm/controls/PointerLockControls.js';
import { GUI } from '/node_modules/three/examples/jsm/libs/lil-gui.module.min.js'

class PerlinNoise {
    constructor() {
        this.gradients = {};
    }

	// генерує напрямок та інтенсивність значень у вузлах
    randomGradient(ix, iy) {
        const angle = Math.random() * Math.PI * 2;
        return {
            x: Math.cos(angle),
            y: Math.sin(angle)
        };
    }

    // скалярний твір, як сильно впливає градієнт у конкретній точці
    dotGridGradient(ix, iy, x, y) {
        const gradient = this.gradients[`${ix},${iy}`] || this.randomGradient(ix, iy);
        const dx = x - ix;
        const dy = y - iy;
        return (dx * gradient.x + dy * gradient.y);
    }

    // інтерполяція, плавний перехід між значеннями у різних вузлах
    lerp(a, b, t) {
        return a + t * (b - a);
    }

    // плавно згладжує переходи
    fade(t) {
        return t * t * t * (t * (t * 6 - 15) + 10);
    }

    // шум Перлина
    noise(x, y) {
        // координати осередків сітки
        const x0 = Math.floor(x);
        const x1 = x0 + 1;
        const y0 = Math.floor(y);
        const y1 = y0 + 1;

        // інтерполяційні ваги
        const sx = this.fade(x - x0);
        const sy = this.fade(y - y0);

        // Інтерполяція між градієнтами точок сітки
        const n0 = this.dotGridGradient(x0, y0, x, y);
        const n1 = this.dotGridGradient(x1, y0, x, y);
        const ix0 = this.lerp(n0, n1, sx);

        const n2 = this.dotGridGradient(x0, y1, x, y);
        const n3 = this.dotGridGradient(x1, y1, x, y);
        const ix1 = this.lerp(n2, n3, sx);

        const value = this.lerp(ix0, ix1, sy);
        return value;
	}
}

class Sky {
    constructor(scene) {
        this.scene = scene;

        // ініціалізація шейдера
        this.material = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0.0 }
            },
            vertexShader: `
                varying vec3 vWorldPosition;
                void main() {
                    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                    vWorldPosition = worldPosition.xyz;
                    gl_Position = projectionMatrix * viewMatrix * worldPosition;
                }
            `,
            fragmentShader: `
                uniform float time; // Отримуємо значення часу
                varying vec3 vWorldPosition;

                void main() {
                    vec3 up = normalize(vec3(0.0, 1.0, 0.0));

                    // Цикл дня та ночі
                    float dayNightCycle = 0.5 + 0.5 * sin(time);

                    // Кольори для дня та ночі
                    vec3 dayColor = vec3(0.5, 0.7, 1.0); // Синє небо
                    vec3 nightColor = vec3(0.05, 0.05, 0.2); // Темне небо

                    // Градієнт кольору (лінійна інтерполяція)
                    vec3 skyColor = mix(nightColor, dayColor, dayNightCycle);

                    gl_FragColor = vec4(skyColor, 1.0);
                }
            `,
            side: THREE.BackSide
        });

        this.geometry = new THREE.SphereGeometry(500, 32, 32);
        this.skyMesh = new THREE.Mesh(this.geometry, this.material);

        this.scene.add(this.skyMesh);

        // світло
        this.sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
        this.scene.add(this.sunLight);

		// глобальне висвітлення
		this.ambientLight = new THREE.AmbientLight(0xFFFFFF, 2);
		this.scene.add(this.ambientLight);
		
    }

    // оновлення часу та освітлення
    update(deltaTime) {
        this.material.uniforms.time.value += deltaTime;

        // обмежуємо значення часу для циклу
        if (this.material.uniforms.time.value > Math.PI * 2) {
            this.material.uniforms.time.value -= Math.PI * 2;
        }
		
        // інтенсивність світла
        const intensity = 1 + 0.5 * Math.sin(this.material.uniforms.time.value);
        this.sunLight.intensity = intensity;
		
        // міняємо колір світла (день, ніч)
        this.sunLight.color.setHSL(0.6, 0.8, intensity * 0.8 + 0.2);
    }
}

class Cloud {
    constructor(scene, textureUrl) {
        this.scene = scene;

        const textureLoader = new THREE.TextureLoader();
        this.cloudTexture = textureLoader.load(textureUrl);

        this.material = new THREE.MeshStandardMaterial({
            map: this.cloudTexture,
            transparent: true,
            opacity: 0.8,
            depthWrite: false,
            side: THREE.DoubleSide
        });

        this.geometry = new THREE.SphereGeometry(480, 32, 32);
        this.cloudMesh = new THREE.Mesh(this.geometry, this.material);

        this.scene.add(this.cloudMesh);
    }

    // плавне обертання хмар
    update(deltaTime) {
        this.cloudMesh.rotation.y += deltaTime * 0.02;
    }
}

function main() {

	const canvas = document.querySelector( '#c' );
	const renderer = new THREE.WebGLRenderer( { antialias: true, canvas } );
	//camera
	const fov = 40;
	const aspect = 2; // the canvas default
	const near = 0.1;
	const far = 1000;
	const camera = new THREE.PerspectiveCamera( fov, aspect, near, far );

	document.body.appendChild(renderer.domElement);

	// підключаємо PointerLockControls
	const controls = new PointerLockControls(camera, document.body);
	// подія для активації Pointer Lock на кліку
	document.addEventListener('click', () => controls.lock());

	// налаштування змінних для керування камерою
	const speed = 0.4;
	const move = {
		forward: false,
		backward: false,
		left: false,
		right: false
	};

	// функції для керування натисканням та відпусканням клавіш
	document.addEventListener('keydown', (event) => {
		switch (event.code) {
			case 'KeyW': move.forward = true; break;
			case 'KeyS': move.backward = true; break;
			case 'KeyA': move.left = true; break;
			case 'KeyD': move.right = true; break;
		}
	});

	document.addEventListener('keyup', (event) => {
		switch (event.code) {
			case 'KeyW': move.forward = false; break;
			case 'KeyS': move.backward = false; break;
			case 'KeyA': move.left = false; break;
			case 'KeyD': move.right = false; break;
		}
	});

	// функція оновлення позиції камери
	function updateCameraPosition() {
		const direction = new THREE.Vector3();
		if (move.forward) direction.z -= speed;
		if (move.backward) direction.z += speed;
		if (move.left) direction.x -= speed;
		if (move.right) direction.x += speed;
		direction.applyQuaternion(camera.quaternion);
		camera.position.add(direction);
	}

	//scene
	const scene = new THREE.Scene();
	const gui = new GUI();

	class FogGUIHelper {
		constructor(fog) {
		  this.fog = fog;
		}
		get density() {
		  return this.fog.density;
		}
		set density(v) {
		  this.fog.density = v;
		}
	}

	//туман fogexp2
	{
		const color = 0xAAAAAA;
		const density = 0.02;
		scene.fog = new THREE.FogExp2(color, density);
		scene.background = new THREE.Color(0xAAAAAA);

		const fogGUIHelper = new FogGUIHelper(scene.fog);
		gui.add(fogGUIHelper, 'density', 0, 0.1).name('fog').listen();
	}

	const sky = new Sky(scene);

	const cloudTextureUrl = '/textures/cloud.png';
	const clouds = new Cloud(scene, cloudTextureUrl);

	const planeWidth = 1000;
	const planeHeight = 1000;
	const geometryPlane = new THREE.PlaneGeometry(planeWidth, planeHeight, 40, 40);

	const objects = [];
	const spread = 1;

	function addObject( x, y, obj ) {

		obj.position.x = x * spread;
		obj.position.y = y * spread;

		scene.add( obj );
		objects.push( obj );

	}

	function createMaterial() {

		const material = new THREE.MeshPhongMaterial({
			map: new THREE.TextureLoader().load('/textures/old-wall-texture.jpg'),
			color: 0x7a4b22,
			flatShading: false,
		  });

		return material;
	}
	
	function addSolidGeometry( x = 0, y = 0, geometry ) {
		const mesh = new THREE.Mesh( geometry, createMaterial() );
		addObject( x, -15, mesh );

	}

	function addLineGeometry(x, y, geometry) {
		const material = new THREE.MeshNormalMaterial({color: 0xff0000, wireframe: true});
		const mesh = new THREE.Mesh(geometry, material);
		addObject(x, y, mesh);
	}
	
	{
		addSolidGeometry(0, 0, geometryPlane)
	}

	const myObject = {
		x: 2,
		y: 2,
		nv: 8
	};

	// gui.add( myObject, 'x', 1, 30, 1 ).name('x').onChange(pNoise);
	// gui.add( myObject, 'y', 1, 30, 1 ).name('y').onChange(pNoise);
	gui.add( myObject, 'nv', 1, 100, 1 ).name('noise').onChange(pNoise);

	function pNoise(){
		const perlin = new PerlinNoise();
		const vertices = geometryPlane.attributes.position.array;
	
		for (let i = 0; i < vertices.length; i += 3) {
			const x = vertices[i];
			const y = vertices[i + 1];
			const z = vertices[i + 2];
	
			// z
			const noiseValue = perlin.noise(x / myObject.x, y / myObject.y);  // масштаб
			vertices[i + 2] = noiseValue * myObject.nv;  // значення шуму | висота рельєфу
		}
	
		// Update geometry to reflect new vertex positions
		geometryPlane.attributes.position.needsUpdate = true;
	}
	pNoise();

	function resizeRendererToDisplaySize( renderer ) {

		const canvas = renderer.domElement;
		const pixelRatio = window.devicePixelRatio;
		const width = Math.floor( canvas.clientWidth * pixelRatio );
		const height = Math.floor( canvas.clientHeight * pixelRatio );
		const needResize = canvas.width !== width || canvas.height !== height;
		if ( needResize )
			renderer.setSize( width, height, false );

		return needResize;
	}
	
	function render(time) {
		time *= 0.001;  // конвертувати час у секунди
		sky.update(0.01);
		clouds.update(0.1);

		if ( resizeRendererToDisplaySize( renderer ) ) {
			const canvas = renderer.domElement;
			camera.aspect = canvas.clientWidth / canvas.clientHeight;
			camera.updateProjectionMatrix();
		}

		objects.forEach( ( obj, ndx ) => {
			obj.rotation.x = 4.68;
		} );
		
		// оновлюємо позицію камери в залежності від натиснених клавіш
		updateCameraPosition();

		renderer.render(scene, camera);

		requestAnimationFrame(render);
	}

	requestAnimationFrame(render);

}

main();
