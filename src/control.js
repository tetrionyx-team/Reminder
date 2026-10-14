import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

'use strict';
const isElectron = Boolean(window.pixelFriend);
let deferredPwaPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPwaPrompt = e;
});

let browserTimer = null;
let browserRemaining = 45 * 60 * 1000;
let browserPaused = false;

function escapeHtml(str) {
  return String(str || '').replace(/[&<>'"]/g, tag => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[tag] || tag));
}

const svgNS = 'http://www.w3.org/2000/svg';

async function renderLetteringSvg(containerEl, text, isResponse = false) {
  try {
    await document.fonts.load('700 40px "PixelFriend Rounded"');
  } catch {}
  const lines = String(text || '').split('\n');
  const measuring = document.createElement('canvas').getContext('2d');
  measuring.font = '700 40px "PixelFriend Rounded", "Segoe UI Emoji", sans-serif';
  const widest = Math.max(...lines.map(line => measuring.measureText(line).width), 1);
  const fontSize = Math.min(isResponse ? 23.8 : 22.4, 40 * 432 / widest);
  const lineHeight = fontSize * 1.25;
  const effectScale = fontSize / 40;
  const height = Math.ceil(lines.length * lineHeight + 12);
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', `0 0 456 ${height}`);
  svg.setAttribute('width', '456');
  svg.setAttribute('height', String(height));
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('reminder-lettering');

  for (const layer of [
    { x: 6, y: 7, fill: '#e12e16', stroke: '#e12e16', width: 6 },
    { x: 3, y: 3, fill: '#f18a0a', stroke: '#f18a0a', width: 5 },
    { x: -1.5, y: -1.5, fill: '#3b1709', stroke: '#3b1709', width: 3 },
    { x: 0, y: 0, fill: '#f8d349', stroke: '#f8d349', width: 0 }
  ]) {
    lines.forEach((line, index) => {
      const node = document.createElementNS(svgNS, 'text');
      node.setAttribute('x', String(228 + layer.x * effectScale));
      node.setAttribute('y', String(fontSize + index * lineHeight + layer.y * effectScale));
      node.setAttribute('text-anchor', 'middle');
      node.setAttribute('font-size', String(fontSize));
      node.setAttribute('fill', layer.fill);
      node.setAttribute('stroke', layer.stroke);
      node.setAttribute('stroke-width', String(layer.width * effectScale));
      node.setAttribute('stroke-linejoin', 'round');
      node.setAttribute('paint-order', 'stroke fill');
      node.textContent = line;
      svg.appendChild(node);
    });
  }
  containerEl.replaceChildren(svg);
}

function showCompanionPopup(payload) {
  const existing = document.getElementById('webCompanionStage');
  if (existing) existing.remove();

  const selected = payload?.character || settings.reminderCharacter || 'character1';
  const charNum = String(selected).replace(/[^0-9]/g, '') || '1';
  const name = (payload?.userName || settings.userName || 'Friend').trim();
  const cheer = (payload?.cheerMessage || settings.cheerMessage || 'Nice! 💙').trim();

  const stage = document.createElement('div');
  stage.id = 'webCompanionStage';
  stage.className = 'web-companion-stage';

  const isKeyed = ['character5', 'character7'].includes(selected);
  const canvasWidth = window.innerWidth;
  const videoWidth = Math.min(540, canvasWidth);
  const videoHeight = Math.round(videoWidth * 304 / 540);
  const isRightSide = ['character3', 'character4'].includes(selected);
  const originX = isRightSide ? (canvasWidth - videoWidth) : 0;
  const bottomOffset = selected === 'character8' ? 0 : 20;

  stage.innerHTML = `
    <div class="web-bubble-container hidden" id="webBubbleContainer" style="width:${Math.min(480, canvasWidth - 20)}px; left:${Math.max(10, Math.min(canvasWidth - 480, originX + videoWidth / 2 - 240))}px; bottom:${bottomOffset + videoHeight + 14}px;">
      <div class="bubble">
        <div id="webMessage" class="message" role="status"></div>
        <div id="webActions" class="actions">
          <button type="button" id="webDrink">YES</button>
          <button type="button" id="webSnooze">Remind me later</button>
        </div>
      </div>
    </div>
    <div class="web-char-container" id="webCharContainer" style="left:${originX}px; bottom:${bottomOffset}px; width:${videoWidth}px; height:${videoHeight}px;">
      <video id="webCompVideo" class="media-comp" muted playsinline preload="auto" style="width:${videoWidth}px; height:${videoHeight}px; display:${isKeyed ? 'none' : 'block'};"></video>
      <canvas id="webCompCanvas" class="media-render" style="width:${videoWidth}px; height:${videoHeight}px; display:${isKeyed ? 'block' : 'none'};"></canvas>
    </div>
  `;
  document.body.appendChild(stage);

  const video = stage.querySelector('#webCompVideo');
  const canvas = stage.querySelector('#webCompCanvas');
  const bubbleContainer = stage.querySelector('#webBubbleContainer');
  const webMessage = stage.querySelector('#webMessage');
  const webActions = stage.querySelector('#webActions');
  const btnDrink = stage.querySelector('#webDrink');
  const btnSnooze = stage.querySelector('#webSnooze');

  let gl = null, glTex = null, glProg = null, renderRaf = null, movement = null;
  let entryReadySent = false;

  function initWebGL() {
    if (gl) return true;
    gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: true });
    if (!gl) return false;
    const vs = 'attribute vec2 a_pos; varying vec2 v_uv; void main() { v_uv = (a_pos + 1.0) * 0.5; v_uv.y = 1.0 - v_uv.y; gl_Position = vec4(a_pos, 0.0, 1.0); }';
    const fs = [
      'precision mediump float;',
      'varying vec2 v_uv;',
      'uniform sampler2D u_tex;',
      'void main() {',
      '  vec4 col = texture2D(u_tex, v_uv);',
      '  if (v_uv.x > 0.86 && v_uv.y < 0.25) discard;',
      '  float r = col.r; float g = col.g; float b = col.b;',
      '  float maxC = max(r, max(g, b));',
      '  float minC = min(r, min(g, b));',
      '  float chroma = maxC - minC;',
      '  if (maxC < 0.015) discard;',
      '  if (v_uv.y < 0.40 && (v_uv.x < 0.38 || v_uv.x > 0.62)) {',
      '    if (chroma < 0.08 && maxC < 0.32) discard;',
      '  }',
      '  float alpha = smoothstep(0.012, 0.035, maxC);',
      '  gl_FragColor = vec4(col.rgb, col.a * alpha);',
      '}'
    ].join('\n');
    function createShader(type, src) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    }
    glProg = gl.createProgram();
    gl.attachShader(glProg, createShader(gl.VERTEX_SHADER, vs));
    gl.attachShader(glProg, createShader(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(glProg);
    gl.useProgram(glProg);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    const aPos = gl.getAttribLocation(glProg, 'a_pos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    glTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, glTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return true;
  }

  function startRendering() {
    if (renderRaf) cancelAnimationFrame(renderRaf);
    if (!initWebGL()) return;
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    gl.viewport(0, 0, canvas.width, canvas.height);

    function render() {
      if (isKeyed && !video.ended) {
        if (video.readyState >= 2) {
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
          gl.bindTexture(gl.TEXTURE_2D, glTex);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }
        renderRaf = requestAnimationFrame(render);
      }
    }
    renderRaf = requestAnimationFrame(render);
  }

  function stopRendering() {
    if (renderRaf) {
      cancelAnimationFrame(renderRaf);
      renderRaf = null;
    }
  }

  function getActiveElement() {
    return isKeyed ? canvas : video;
  }

  function showBubble() {
    if (entryReadySent) return;
    entryReadySent = true;
    renderLetteringSvg(webMessage, `Hey, ${name}\nDid you drink water?`, false);
    bubbleContainer.classList.remove('hidden');
    bubbleContainer.classList.add('visible');
  }

  // Set initial video src
  video.src = `../assets/ReminderVideos/Character${charNum}/entry.webm`;
  video.load();
  video.play().catch(e => console.warn('Video play warning:', e));

  video.addEventListener('loadeddata', () => {
    if (isKeyed) {
      startRendering();
    }
  });

  // Entry animation for character7 (walk in from -350px)
  if (selected === 'character7') {
    const targetEl = getActiveElement();
    movement = targetEl.animate([
      { transform: 'translateX(-350px)' },
      { transform: 'translateX(0px)' }
    ], {
      duration: 2300,
      easing: 'linear',
      fill: 'forwards'
    });
  }

  video.addEventListener('timeupdate', () => {
    if (['character5', 'character6'].includes(selected)) {
      if (video.currentTime >= 3.2 && !entryReadySent) {
        video.pause();
        showBubble();
      }
    }
  });

  video.addEventListener('ended', () => {
    showBubble();
  });

  btnDrink.addEventListener('click', (e) => {
    e.stopPropagation();
    btnDrink.disabled = true;
    btnSnooze.disabled = true;
    webActions.style.display = 'none';
    renderLetteringSvg(webMessage, cheer, true);

    setTimeout(() => {
      bubbleContainer.classList.remove('visible');
      bubbleContainer.classList.add('hidden');

      // Start success-out
      video.classList.toggle('corrected', selected === 'character2');
      video.src = `../assets/ReminderVideos/Character${charNum}/success-out.webm`;
      video.load();
      video.play().then(() => {
        if (selected === 'character7') video.currentTime = 1.2;
        if (isKeyed) startRendering();

        // Walk off animations on success
        const destX = canvasWidth + 270 - originX;
        const targetEl = getActiveElement();

        if (selected === 'character7') {
          const dur = Math.max(100, (video.duration - 1.2) * 1000);
          movement = targetEl.animate([
            { transform: 'translateX(0px)' },
            { transform: `translateX(${destX}px)` }
          ], { duration: dur, easing: 'ease-in', fill: 'forwards' });
        }

        const handleSuccessTimeupdate = () => {
          if (selected === 'character6' && !movement && video.currentTime >= 1.2) {
            const dur = Math.max(100, (video.duration - video.currentTime) * 1000);
            movement = targetEl.animate([
              { transform: 'translateX(0)' },
              { transform: `translateX(${destX}px)` }
            ], { duration: dur, easing: 'ease-in', fill: 'forwards' });
          } else if (selected === 'character8' && !movement && video.currentTime >= 5.8) {
            const destLeft = -560 - originX;
            const dur = Math.max(100, (video.duration - video.currentTime) * 1000);
            movement = targetEl.animate([
              { transform: 'translateX(0px)' },
              { transform: `translateX(${destLeft}px)` }
            ], { duration: dur, easing: 'linear', fill: 'forwards' });
          } else if (selected === 'character1' && !movement && video.currentTime >= 2.1) {
            const dur = Math.max(100, (video.duration - video.currentTime) * 1000);
            movement = targetEl.animate([
              { transform: 'translateX(0)' },
              { transform: `translateX(${destX}px)` }
            ], { duration: dur, easing: 'ease-in', fill: 'forwards' });
          }
        };

        video.addEventListener('timeupdate', handleSuccessTimeupdate);

        video.onended = async () => {
          stopRendering();
          if (movement) await movement.finished.catch(() => {});
          stage.remove();
        };
      }).catch(() => stage.remove());
    }, 1200);
  });

  btnSnooze.addEventListener('click', (e) => {
    e.stopPropagation();
    btnDrink.disabled = true;
    btnSnooze.disabled = true;
    bubbleContainer.classList.remove('visible');
    bubbleContainer.classList.add('hidden');

    // Start disappointed-out
    video.src = `../assets/ReminderVideos/Character${charNum}/disappointed-out.webm`;
    video.load();
    video.play().then(() => {
      if (isKeyed) startRendering();

      const destX = -560 - originX;
      const targetEl = getActiveElement();

      const handleDisappointTimeupdate = () => {
        if (selected === 'character6' && !movement && video.currentTime >= 5.5) {
          const dur = Math.max(100, (video.duration - video.currentTime + 0.45) * 1000);
          movement = targetEl.animate([
            { transform: 'translateX(0)' },
            { transform: `translateX(${destX}px)` }
          ], { duration: dur, easing: 'ease-in', fill: 'forwards' });
        } else if (selected === 'character7' && !movement && video.currentTime >= 6.2) {
          const dur = Math.max(100, (video.duration - video.currentTime + 0.45) * 1000);
          movement = targetEl.animate([
            { transform: 'translateX(0px)' },
            { transform: `translateX(${destX}px)` }
          ], { duration: dur, easing: 'ease-in', fill: 'forwards' });
        } else if (selected === 'character1' && !movement && video.currentTime >= 7) {
          const dur = Math.max(100, (video.duration - video.currentTime + 0.45) * 1000);
          movement = targetEl.animate([
            { transform: 'translateX(0)' },
            { transform: `translateX(${destX}px)` }
          ], { duration: dur, easing: 'ease-in', fill: 'forwards' });
        }
      };

      video.addEventListener('timeupdate', handleDisappointTimeupdate);

      video.onended = async () => {
        stopRendering();
        if (movement) await movement.finished.catch(() => {});
        stage.remove();
      };
    }).catch(() => stage.remove());
  });
}

const api = window.pixelFriend || {
  getState: async () => {
    try {
      const saved = localStorage.getItem('vara_settings');
      const loaded = saved ? JSON.parse(saved) : settings;
      return {
        settings: loaded,
        status: browserPaused ? 'paused' : (loaded.reminders && loaded.reminders.length > 0 ? 'active' : 'empty'),
        remaining: browserRemaining,
        active: false
      };
    } catch {
      return { settings, status: 'active', remaining: browserRemaining, active: false };
    }
  },
  save: async val => {
    try {
      localStorage.setItem('vara_settings', JSON.stringify(val));
    } catch {}
    return { settings: val, status: 'active', remaining: browserRemaining, active: false };
  },
  action: (act, payload) => {
    console.log('Action:', act, payload);
    if (act === 'test') {
      showCompanionPopup(payload || {
        character: settings.reminderCharacter || 'character1',
        userName: settings.userName || 'Friend',
        cheerMessage: settings.cheerMessage || 'Keep going! 💙'
      });
      showStatus('🔔 Reminder test previewed!', 'info');
    } else if (act === 'pause') {
      browserPaused = !browserPaused;
      showStatus(browserPaused ? '⏸ Reminders paused' : '▶ Reminders resumed', 'info');
    } else if (act === 'quit' || act === 'close') {
      showStatus('✕ Vara closed. You can close this tab or minimize.', 'info');
      try { window.close(); } catch {}
    }
  },
  onState: cb => {
    if (!browserTimer) {
      browserTimer = setInterval(() => {
        if (!browserPaused && browserRemaining > 0) {
          browserRemaining = Math.max(0, browserRemaining - 1000);
          if (browserRemaining === 0) {
            const firstRem = (settings.reminders && settings.reminders[0]) || settings;
            showCompanionPopup({
              character: firstRem.reminderCharacter || settings.reminderCharacter || 'character1',
              userName: firstRem.userName || 'Friend',
              cheerMessage: firstRem.cheerMessage || 'Stay hydrated & refreshed! 💧'
            });
            const mins = firstRem.interval === 'custom' ? (Number(firstRem.customIntervalMinutes) || 10) : (Number(firstRem.interval) || 45);
            browserRemaining = mins * 60000;
          }
        }
        api.getState().then(cb);
      }, 1000);
    }
    api.getState().then(cb);
  },
  createShortcut: () => handleCreateShortcut()
};
const $ = id => document.getElementById(id);
let settings = {
  userName: '',
  interval: 45,
  customIntervalMinutes: 75,
  reminderTime: '10:00',
  pauseWhenInactive: true,
  inactivityThresholdMinutes: 12,
  reminderCharacter: 'character1',
  cheerMessage: '',
  autoStartOnBoot: true,
  reminders: []
};
let initialized = false, saveChain = Promise.resolve(), lastRenderedState = null;

const canvas = $('threeCanvas');
const stage2d = $('stage3d');
const hint = $('previewHint');
const btnAutoSpin = $('btnAutoSpin');
const btnResetView = $('btnResetView');

const screenWelcome = $('screenWelcome');
const screenSetup = $('screenSetup');
const stepIndicator1 = $('stepIndicator1');
const stepIndicator2 = $('stepIndicator2');
const stepIndicator3 = $('stepIndicator3');
const stepLine2 = $('stepLine2');

let scene, camera, renderer, controls, current3DModel = null;
let autoSpin = true;

function initThree() {
  if (!canvas || scene) return;
  const rect = canvas.getBoundingClientRect();
  const width = rect.width || 460;
  const height = rect.height || 540;

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 50);
  camera.position.set(0, 1.15, 3.2);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setSize(width, height, false);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;

  // Lights
  const ambient = new THREE.AmbientLight(0xffffff, 1.4);
  scene.add(ambient);

  const mainLight = new THREE.DirectionalLight(0xffffff, 2.4);
  mainLight.position.set(2.5, 4, 3);
  scene.add(mainLight);

  const fillLight = new THREE.DirectionalLight(0x77aaff, 1.5);
  fillLight.position.set(-3, 2, -1.5);
  scene.add(fillLight);

  const rimLight = new THREE.DirectionalLight(0x00d4ff, 2.0);
  rimLight.position.set(0, 3, -3);
  scene.add(rimLight);

  // Glowing Neon Pedestal Stage
  const pedestalGroup = new THREE.Group();

  // Outer vibrant neon blue ring
  const ringGeo = new THREE.RingGeometry(0.88, 0.98, 64);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x00d4ff, side: THREE.DoubleSide });
  const ringMesh = new THREE.Mesh(ringGeo, ringMat);
  ringMesh.rotation.x = -Math.PI / 2;
  pedestalGroup.add(ringMesh);

  // Inner subtle secondary glow ring
  const innerRingGeo = new THREE.RingGeometry(0.78, 0.84, 64);
  const innerRingMat = new THREE.MeshBasicMaterial({ color: 0x2563eb, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
  const innerRingMesh = new THREE.Mesh(innerRingGeo, innerRingMat);
  innerRingMesh.rotation.x = -Math.PI / 2;
  pedestalGroup.add(innerRingMesh);

  // Center dark reflective disc
  const discGeo = new THREE.CircleGeometry(0.88, 64);
  const discMat = new THREE.MeshBasicMaterial({ color: 0x0a1326, side: THREE.DoubleSide });
  const discMesh = new THREE.Mesh(discGeo, discMat);
  discMesh.rotation.x = -Math.PI / 2;
  discMesh.position.y = -0.002;
  pedestalGroup.add(discMesh);

  // Neon point light shining up from the pedestal
  const pedestalLight = new THREE.PointLight(0x00d4ff, 2.5, 4.5);
  pedestalLight.position.set(0, 0.25, 0);
  scene.add(pedestalLight);

  scene.add(pedestalGroup);

  // OrbitControls
  controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.autoRotate = autoSpin;
  controls.autoRotateSpeed = 2.5;
  controls.minDistance = 1.0;
  controls.maxDistance = 5.0;
  controls.maxPolarAngle = Math.PI / 2 + 0.08;
  controls.target.set(0, 0.88, 0);

  const ro = new ResizeObserver(() => {
    const r = canvas.getBoundingClientRect();
    if (r.width && r.height) {
      camera.aspect = r.width / r.height;
      camera.updateProjectionMatrix();
      renderer.setSize(r.width, r.height, false);
    }
  });
  ro.observe(canvas);

  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();
}

const gltfLoader = new GLTFLoader();
gltfLoader.setMeshoptDecoder(MeshoptDecoder);
const textureLoader = new THREE.TextureLoader();
let activeLoadId = 0;

function load3DCharacter(characterId) {
  if (!scene) initThree();
  const loadId = ++activeLoadId;
  const glbPath = `../assets/${characterId}.glb`;
  if (hint) hint.textContent = '⏳ Loading Character…';

  gltfLoader.load(
    glbPath,
    gltf => {
      if (loadId !== activeLoadId) return;
      console.log('3D MODEL LOADED AND PARSED SUCCESSFULLY:', characterId);
      if (current3DModel) scene.remove(current3DModel);
      current3DModel = gltf.scene;

      current3DModel.traverse(node => {
        if (node.isMesh && (!node.material || !node.material.map)) {
          node.material = new THREE.MeshStandardMaterial({
            color: 0xdce5f2,
            roughness: 0.35,
            metalness: 0.15,
            side: THREE.DoubleSide
          });
        }
      });

      if (['character3', 'character4', 'character7', 'character8'].includes(characterId)) {
        current3DModel.rotation.y = -Math.PI / 2;
      }

      const box = new THREE.Box3().setFromObject(current3DModel);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const targetHeight = 1.75;
      const scale = targetHeight / maxDim;

      current3DModel.scale.setScalar(scale);
      current3DModel.position.x = -center.x * scale;
      current3DModel.position.y = -box.min.y * scale;
      current3DModel.position.z = -center.z * scale;

      scene.add(current3DModel);

      canvas.style.display = 'block';
      if (stage2d) stage2d.style.display = 'none';
      if (hint) hint.textContent = '🎮 Real 3D Model · Drag to Rotate';
    },
    progress => {
      if (loadId !== activeLoadId) return;
      if (progress.total) {
        const pct = Math.round((progress.loaded / progress.total) * 100);
        if (hint) hint.textContent = `⏳ Loading 3D Model (${pct}%)…`;
      }
    },
    err => {
      if (loadId !== activeLoadId) return;
      console.log(`No GLB found for ${characterId}. Showing 2D preview standee in 3D scene.`);
      if (current3DModel) scene.remove(current3DModel);
      current3DModel = null;

      const imgPath = `../assets/ReminderVideos/PreviewImages/${characterId}.png`;
      textureLoader.load(
        imgPath,
        tex => {
          if (loadId !== activeLoadId) return;
          tex.colorSpace = THREE.SRGBColorSpace;
          const aspect = (tex.image && tex.image.width && tex.image.height)
            ? (tex.image.width / tex.image.height)
            : 0.75;
          const height = 1.7;
          const width = height * aspect;
          const geo = new THREE.PlaneGeometry(width, height);
          const mat = new THREE.MeshStandardMaterial({
            map: tex,
            transparent: true,
            roughness: 0.4,
            metalness: 0.05,
            side: THREE.DoubleSide,
            alphaTest: 0.01
          });
          const standee = new THREE.Mesh(geo, mat);
          standee.position.y = height / 2;

          current3DModel = standee;
          scene.add(current3DModel);

          canvas.style.display = 'block';
          if (stage2d) stage2d.style.display = 'none';
          if (hint) hint.textContent = `⏳ 3D Model Pending · Drag to Rotate Preview`;
        },
        undefined,
        texErr => {
          if (loadId !== activeLoadId) return;
          console.error('Failed to load fallback preview texture:', texErr);
          canvas.style.display = 'none';
          if (stage2d) stage2d.style.display = 'flex';
          if (hint) hint.textContent = `Preview (Add ${characterId}.glb for Real 3D)`;
        }
      );
    }
  );
}




function showStatus(msg, type = 'info') {
  const el = $('saveStatus');
  if (!el) return;
  el.textContent = msg;
  el.className = type === 'error' ? 'status-error' : type === 'success' ? 'success-highlight' : '';
  if (type !== 'error') {
    setTimeout(() => { if (el.textContent === msg) el.textContent = ''; }, 4500);
  }
}

function renderSavedRemindersList() {
  const container = $('savedRemindersList');
  if (!container) return;

  if (!Array.isArray(settings.reminders)) {
    settings.reminders = [];
  }

  const countEl = $('savedCount');
  if (countEl) countEl.textContent = settings.reminders.length;

  const badgeEl = $('savedStatusBadge');
  if (badgeEl) {
    if (settings.reminders.length > 0) {
      badgeEl.className = 'saved-status-badge active';
      badgeEl.innerHTML = '<span class="saved-status-dot"></span> Active';
    } else {
      badgeEl.className = 'saved-status-badge inactive';
      badgeEl.innerHTML = '<span class="saved-status-dot"></span> No Reminders';
    }
  }

  if (settings.reminders.length === 0) {
    container.innerHTML = `
      <div class="empty-reminders-msg">
        <div style="font-size:24px; margin-bottom:6px;">🔔</div>
        <strong>No reminders added yet</strong>
        <span>Enter your name & cheer message on the left,<br>then click <b>＋ Add Reminder</b>!</span>
      </div>`;
    return;
  }

  container.innerHTML = '';
  settings.reminders.forEach((r, idx) => {
    const item = document.createElement('div');
    const isDueNext = (lastRenderedState?.currentReminder && lastRenderedState.currentReminder.id === r.id) || (idx === (lastRenderedState?.currentReminderIndex ?? 0));
    item.className = 'saved-reminder-item' + (isDueNext ? ' active-reminder' : '');
    item.dataset.id = r.id;

    const charSrc = `../assets/ReminderVideos/PreviewImages/${r.reminderCharacter}.png`;
    const freqText = (r.interval === 'time')
      ? `⏰ At ${r.reminderTime || '10:00'}`
      : (r.interval === 'custom' ? `⏱ Every ${r.customIntervalMinutes || 10}m` : `⏱ Every ${r.interval}m`);
    const charName = (r.reminderCharacter || 'character1').replace('character', 'Character ');

    item.innerHTML = `
      <div class="item-left">
        <div class="item-char-wrap">
          <img src="${charSrc}" alt="${charName}" class="item-char-img">
        </div>
        <div class="item-info">
          <div class="item-header-line">
            <span class="item-name">Hey ${escapeHtml(r.userName)}!</span>
            <span class="item-msg">"${escapeHtml(r.cheerMessage)}"</span>
          </div>
          <div class="item-meta-line">
            <span class="item-tag">${freqText}</span>
            <span class="item-tag">🎭 ${charName}</span>
            ${isDueNext ? '<span class="item-tag current-due-tag">🎯 Active / Due Next</span>' : ''}
          </div>
        </div>
      </div>
      <div class="item-actions">
        <button type="button" class="btn-item-test" title="Test this reminder" data-action="test" data-id="${r.id}">▶ Test</button>
        <button type="button" class="btn-item-delete" title="Delete reminder" data-action="delete" data-id="${r.id}">✕</button>
      </div>
    `;

    // Test button
    item.querySelector('[data-action="test"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      api.action('test', {
        character: r.reminderCharacter || settings.reminderCharacter || 'character1',
        userName: r.userName || settings.userName || 'Friend',
        cheerMessage: r.cheerMessage || settings.cheerMessage || 'Nice! 💙'
      });
      showStatus(`▶ Testing reminder: "${r.userName}"`, 'info');
    });

    // Delete button
    item.querySelector('[data-action="delete"]').addEventListener('click', (e) => {
      e.stopPropagation();
      settings.reminders = settings.reminders.filter(rem => rem.id !== r.id);
      save();
      renderSavedRemindersList();
      if (settings.reminders.length === 0) {
        if (stepIndicator3) stepIndicator3.classList.remove('active');
        if (stepLine2) stepLine2.classList.remove('active');
        $('status').textContent = 'No reminders active';
        $('countdown').textContent = 'Add a reminder below to start the timer.';
        const pulse = document.querySelector('.status-pulse-dot');
        if (pulse) pulse.className = 'status-pulse-dot empty';
        const pauseBtn = $('pause');
        if (pauseBtn) {
          pauseBtn.textContent = '⏸ Pause reminders';
          pauseBtn.classList.add('disabled-action');
        }
      }
      showStatus('🗑 Reminder removed', 'info');
    });

    // Item click selects character preview
    item.addEventListener('click', () => {
      settings.reminderCharacter = r.reminderCharacter;
      showSelection();
    });

    container.appendChild(item);
  });
}

function render(state) {
  const hasRem = Array.isArray(settings.reminders) && settings.reminders.length > 0;
  const statusEl = $('status');
  const countdownEl = $('countdown');
  const pulseDot = document.querySelector('.status-pulse-dot');
  const pauseBtn = $('pause');

  function formatRemaining(ms) {
    const totalSec = (typeof ms === 'number' && Number.isFinite(ms) && ms > 0) ? Math.ceil(ms / 1000) : 0;
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}m ${s}s`;
  }

  let remainingMs = typeof state.remaining === 'number' && Number.isFinite(state.remaining) ? state.remaining : null;
  if (remainingMs === null && hasRem) {
    const firstRem = settings.reminders[0];
    const mins = firstRem.interval === 'custom' ? (Number(firstRem.customIntervalMinutes) || 10) : (Number(firstRem.interval) || 45);
    remainingMs = mins * 60000;
  }

  if (!hasRem || state.status === 'empty') {
    statusEl.textContent = 'No reminders active';
    countdownEl.textContent = 'Add a reminder below to start the timer.';
    if (pulseDot) pulseDot.className = 'status-pulse-dot empty';
    if (pauseBtn) {
      pauseBtn.textContent = '⏸ Pause reminders';
      pauseBtn.classList.add('disabled-action');
    }
    if (stepIndicator3) stepIndicator3.classList.remove('active');
    if (stepLine2) stepLine2.classList.remove('active');
  } else if (state.status === 'paused') {
    statusEl.textContent = 'Reminders paused';
    countdownEl.textContent = `Paused with ${formatRemaining(remainingMs)}`;
    if (pulseDot) pulseDot.className = 'status-pulse-dot paused';
    if (pauseBtn) {
      pauseBtn.textContent = '▶ Resume reminders';
      pauseBtn.classList.remove('disabled-action');
    }
    if (stepIndicator3) stepIndicator3.classList.add('active');
    if (stepLine2) stepLine2.classList.add('active');
  } else if (state.status === 'inactive') {
    statusEl.textContent = 'Waiting for activity';
    countdownEl.textContent = 'Timing will continue when you return to your PC.';
    if (pulseDot) pulseDot.className = 'status-pulse-dot inactive';
    if (pauseBtn) {
      pauseBtn.textContent = '⏸ Pause reminders';
      pauseBtn.classList.remove('disabled-action');
    }
    if (stepIndicator3) stepIndicator3.classList.add('active');
    if (stepLine2) stepLine2.classList.add('active');
  } else {
    statusEl.textContent = 'Reminders are active';
    countdownEl.textContent = `Next reminder in ${formatRemaining(remainingMs)}${state.active ? ' · Reminder on screen' : ''}`;
    if (pulseDot) pulseDot.className = 'status-pulse-dot active';
    if (pauseBtn) {
      pauseBtn.textContent = '⏸ Pause reminders';
      pauseBtn.classList.remove('disabled-action');
    }
    if (stepIndicator3) stepIndicator3.classList.add('active');
    if (stepLine2) stepLine2.classList.add('active');
  }

  if (!initialized) {
    if (state.settings) {
      settings = {
        ...settings,
        ...state.settings,
        reminders: Array.isArray(state.settings.reminders) ? state.settings.reminders : []
      };
    }
    syncFormToSettings();
    initialized = true;
    showSelection();
  }
  renderSavedRemindersList();
}

function showSelection() {
  const imgSrc = `../assets/ReminderVideos/PreviewImages/${settings.reminderCharacter}.png`;
  if ($('preview')) $('preview').src = imgSrc;
  if ($('previewBack')) $('previewBack').src = imgSrc;
  for (const button of document.querySelectorAll('[data-character]')) {
    const isSelected = button.dataset.character === settings.reminderCharacter;
    button.setAttribute('aria-pressed', String(isSelected));
    button.classList.toggle('selected', isSelected);
  }
  $('customRow').hidden = settings.interval !== 'custom';
  $('idleRow').hidden = !settings.pauseWhenInactive;
  load3DCharacter(settings.reminderCharacter);
  renderSavedRemindersList();
}

function save() {
  const snapshot = { ...settings };
  saveChain = saveChain
    .catch(() => {})
    .then(() => api.save(snapshot))
    .then(() => {
      // Background save confirmed
    })
    .catch(() => {
      showStatus('Could not save settings. Please try again.', 'error');
    });
}

function goToScreen(screenName) {
  console.log('TRANSITION TRIGGERED TO:', screenName);
  if (screenName === 'welcome') {
    screenWelcome.classList.add('active');
    screenSetup.classList.remove('active');
    screenWelcome.style.display = 'flex';
    screenSetup.style.display = 'none';
    if (stepIndicator1) stepIndicator1.classList.add('active');
    if (stepIndicator2) stepIndicator2.classList.remove('active');
    if (stepIndicator3) stepIndicator3.classList.remove('active');
    if (stepLine2) stepLine2.classList.remove('active');
  } else if (screenName === 'setup') {
    screenWelcome.classList.remove('active');
    screenSetup.classList.add('active');
    screenWelcome.style.display = 'none';
    screenSetup.style.display = 'flex';
    if (stepIndicator1) stepIndicator1.classList.add('active');
    if (stepIndicator2) stepIndicator2.classList.add('active');
    if (stepIndicator3) stepIndicator3.classList.remove('active');
  }
}
window.goToScreen = goToScreen;

// Character button selection
for (const button of document.querySelectorAll('[data-character]')) {
  button.addEventListener('click', () => {
    settings.reminderCharacter = button.dataset.character;
    showSelection();
    save();
  });
}

function syncFormToSettings() {
  if ($('userName')) $('userName').value = settings.userName || '';
  if ($('cheerMessage')) $('cheerMessage').value = settings.cheerMessage || '';
  if ($('interval')) $('interval').value = String(settings.interval || 45);
  if ($('customIntervalMinutes')) $('customIntervalMinutes').value = settings.customIntervalMinutes || 75;
  if ($('reminderTime')) $('reminderTime').value = settings.reminderTime || '10:00';
  if ($('customRow')) $('customRow').hidden = settings.interval !== 'custom';
  if ($('timeRow')) $('timeRow').hidden = settings.interval !== 'time';
  if ($('pauseWhenInactive')) $('pauseWhenInactive').checked = Boolean(settings.pauseWhenInactive ?? true);
  if ($('inactivityThresholdMinutes')) $('inactivityThresholdMinutes').value = settings.inactivityThresholdMinutes || 12;
  if ($('idleRow')) $('idleRow').hidden = !Boolean(settings.pauseWhenInactive ?? true);
  if ($('autoStartOnBoot')) $('autoStartOnBoot').checked = Boolean(settings.autoStartOnBoot ?? true);
}

function resetForm() {
  if ($('userName')) {
    $('userName').value = '';
    $('userName').classList.remove('input-error');
  }
  if ($('cheerMessage')) {
    $('cheerMessage').value = '';
    $('cheerMessage').classList.remove('input-error');
  }
  if ($('interval')) $('interval').value = '45';
  if ($('customIntervalMinutes')) $('customIntervalMinutes').value = '';
  if ($('reminderTime')) {
    const d = new Date();
    const curH = String(d.getHours()).padStart(2, '0');
    const curM = String(d.getMinutes()).padStart(2, '0');
    $('reminderTime').value = `${curH}:${curM}`;
  }
  if ($('customRow')) $('customRow').hidden = true;
  if ($('timeRow')) $('timeRow').hidden = true;
  if ($('pauseWhenInactive')) $('pauseWhenInactive').checked = Boolean(settings.pauseWhenInactive ?? true);
  if ($('inactivityThresholdMinutes')) $('inactivityThresholdMinutes').value = settings.inactivityThresholdMinutes || 12;
  if ($('idleRow')) $('idleRow').hidden = !Boolean(settings.pauseWhenInactive ?? true);
}

// Manual Form Reset Button
$('btnResetForm')?.addEventListener('click', () => {
  resetForm();
  showStatus('↺ Form fields cleared', 'info');
});

// Clear validation errors on typing
$('userName')?.addEventListener('input', () => $('userName').classList.remove('input-error'));
$('cheerMessage')?.addEventListener('input', () => $('cheerMessage').classList.remove('input-error'));

function handleAddReminder() {
  const nameInput = $('userName');
  const msgInput = $('cheerMessage');
  const nameVal = nameInput ? nameInput.value.trim() : '';
  const msgVal = msgInput ? msgInput.value.trim() : '';

  let hasError = false;
  if (!nameVal) {
    if (nameInput) nameInput.classList.add('input-error');
    hasError = true;
  }
  if (!msgVal) {
    if (msgInput) msgInput.classList.add('input-error');
    hasError = true;
  }

  if (hasError) {
    showStatus('⚠️ Please enter both your name and cheer message before adding!', 'error');
    if (!nameVal && nameInput) nameInput.focus();
    else if (!msgVal && msgInput) msgInput.focus();
    return false;
  }

  const intervalVal = $('interval')?.value || '45';
  const customMins = Number($('customIntervalMinutes')?.value) || 10;
  const timeVal = $('reminderTime')?.value || '10:00';
  const pauseVal = $('pauseWhenInactive')?.checked ?? true;
  const idleMins = Number($('inactivityThresholdMinutes')?.value) || 12;

  const newRem = {
    id: 'rem_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    userName: nameVal,
    cheerMessage: msgVal,
    interval: (intervalVal === 'custom' || intervalVal === 'time') ? intervalVal : Number(intervalVal),
    customIntervalMinutes: customMins,
    reminderTime: timeVal,
    pauseWhenInactive: pauseVal,
    inactivityThresholdMinutes: idleMins,
    reminderCharacter: settings.reminderCharacter || 'character1',
    enabled: true
  };

  if (!Array.isArray(settings.reminders)) settings.reminders = [];
  settings.reminders.push(newRem);
  settings.userName = newRem.userName;
  settings.cheerMessage = newRem.cheerMessage;
  settings.interval = newRem.interval;
  settings.customIntervalMinutes = newRem.customIntervalMinutes;
  settings.reminderTime = newRem.reminderTime;
  settings.pauseWhenInactive = newRem.pauseWhenInactive;
  settings.inactivityThresholdMinutes = newRem.inactivityThresholdMinutes;

  save();
  renderSavedRemindersList();
  resetForm();
  if (stepIndicator3) stepIndicator3.classList.add('active');
  if (stepLine2) stepLine2.classList.add('active');
  const statusEl = $('status');
  const countdownEl = $('countdown');
  const pulseDot = document.querySelector('.status-pulse-dot');
  const pauseBtn = $('pause');
  if (statusEl) statusEl.textContent = 'Reminders are active';
  if (countdownEl) {
    const mins = newRem.interval === 'custom' ? newRem.customIntervalMinutes : newRem.interval;
    countdownEl.textContent = `Next reminder scheduled (${newRem.interval === 'time' ? 'At ' + newRem.reminderTime : mins + 'm'})`;
  }
  if (pulseDot) pulseDot.className = 'status-pulse-dot active';
  if (pauseBtn) {
    pauseBtn.textContent = '⏸ Pause reminders';
    pauseBtn.classList.remove('disabled-action');
  }
  showStatus(`✓ Added reminder for "${nameVal}"! (Total: ${settings.reminders.length})`, 'success');
  return true;
}

// Add Reminder Button
$('btnAddReminder')?.addEventListener('click', handleAddReminder);

// Form listeners
$('settings')?.addEventListener('submit', event => {
  event.preventDefault();
  handleAddReminder();
});

$('settings')?.addEventListener('change', event => {
  const { id, value, checked } = event.target;
  if (id === 'pauseWhenInactive') {
    settings[id] = checked;
    if ($('idleRow')) $('idleRow').hidden = !checked;
    save();
  } else if (id === 'autoStartOnBoot') {
    settings.autoStartOnBoot = checked;
    api?.setAutoStart?.(checked);
    save();
    showStatus(checked ? '✓ Auto-start on Windows boot enabled' : 'Auto-start disabled', 'info');
  } else if (id === 'interval') {
    settings[id] = (value === 'custom' || value === 'time') ? value : Number(value);
    if ($('customRow')) $('customRow').hidden = value !== 'custom';
    if ($('timeRow')) $('timeRow').hidden = value !== 'time';
    save();
  } else if (id === 'reminderTime') {
    settings.reminderTime = value;
    save();
  } else if (['customIntervalMinutes', 'inactivityThresholdMinutes'].includes(id)) {
    const max = id === 'customIntervalMinutes' ? 1440 : 120;
    settings[id] = Math.min(max, Math.max(1, Math.round(Number(value) || 1)));
    $(id).value = settings[id];
    save();
  }
});

$('inactivityThresholdMinutes')?.addEventListener('input', e => {
  const n = Number(e.target.value);
  if (n >= 1 && n <= 120) {
    settings.inactivityThresholdMinutes = Math.round(n);
    save();
  }
});

// Reminder Actions
for (const action of ['pause', 'quit']) $(action)?.addEventListener('click', () => api.action(action));

// Helper for triggering reliable file download in all browsers (Chrome, Edge, etc.)
function triggerBrowserDownload(filename, blobOrUrl) {
  const a = document.createElement('a');
  const isString = typeof blobOrUrl === 'string';
  a.href = isString ? blobOrUrl : URL.createObjectURL(blobOrUrl);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    try { document.body.removeChild(a); } catch {}
    if (!isString) URL.revokeObjectURL(a.href);
  }, 1000);
}

// Desktop Shortcut Actions (Supports both Local Electron & Deployed Web App in Chrome)
async function handleCreateShortcut() {
  try {
    // Case 1: Running locally inside Electron desktop app
    if (isElectron && typeof window.pixelFriend?.createShortcut === 'function') {
      showStatus('⏳ Placing shortcut on your Desktop...', 'info');
      const res = await window.pixelFriend.createShortcut();
      if (res && res.success) {
        showStatus('✓ Vara shortcut placed on your Desktop! (Press Ctrl+Alt+V anytime to launch)', 'success');
        return;
      } else {
        showStatus('⚠️ Notice: ' + (res?.error || 'Could not create shortcut'), 'error');
        return;
      }
    }

    // Case 2: Running as Web Application in Chrome browser (Deployed Link)
    showStatus('⏳ Preparing desktop download in Chrome...', 'info');
    const currentUrl = window.location.href;
    const iconUrl = new URL('../assets/icon.ico', window.location.href).href;

    // A. Generate and trigger direct download of Windows Internet Shortcut (.url)
    const urlContent = `[InternetShortcut]\r\nURL=${currentUrl}\r\nIconIndex=0\r\nIconFile=${iconUrl}\r\nHotKey=1622\r\n[{000214A0-0000-0000-C000-000000000046}]\r\nProp3=19,11\r\n`;
    const urlBlob = new Blob([urlContent], { type: 'text/plain' });
    triggerBrowserDownload('Vara - 3D Companion.url', urlBlob);

    // B. Also generate 1-Click Windows Desktop Setup Launcher (.bat) that creates true .lnk on Desktop & Start Menu
    const batContent = `@echo off\r\ntitle Installing Vara 3D Companion Desktop Shortcut\r\necho ========================================================\r\necho        Installing Vara 3D Companion on Desktop\r\necho ========================================================\r\npowershell -NoProfile -Command "$wsh = New-Object -ComObject WScript.Shell; $d = [System.Environment]::GetFolderPath('Desktop'); $lnk = $wsh.CreateShortcut($d + '\\\\Vara - 3D Companion.lnk'); $lnk.TargetPath = 'cmd.exe'; $lnk.Arguments = '/c start chrome --app=\\"${currentUrl}\\" || start \\"\\" \\"${currentUrl}\\"'; $lnk.Description = 'Vara - 3D Companion & Reminder'; $lnk.Hotkey = 'Ctrl+Alt+V'; $lnk.Save(); $prog = [System.Environment]::GetFolderPath('Programs'); if ($prog) { Copy-Item $lnk.FullName ($prog + '\\\\Vara - 3D Companion.lnk') -Force }; Write-Host '[SUCCESS] Vara Desktop Shortcut created on Desktop and Start Menu!' -ForegroundColor Green;"\r\necho.\r\necho [OK] Vara 3D Companion shortcut added to your Desktop!\r\necho Press Ctrl+Alt+V anytime from anywhere in Windows to launch!\r\ntimeout /t 4\r\n`;
    const batBlob = new Blob([batContent], { type: 'text/plain' });
    setTimeout(() => {
      triggerBrowserDownload('Install-Vara-Desktop.bat', batBlob);
    }, 450);

    // C. If Chrome supports PWA native desktop installation prompt, trigger it
    if (deferredPwaPrompt) {
      deferredPwaPrompt.prompt();
      deferredPwaPrompt.userChoice.then(choice => {
        if (choice.outcome === 'accepted') {
          showStatus('✓ Vara installed to Chrome Desktop successfully!', 'success');
        }
      });
    }

    showStatus('📥 Desktop launcher downloaded! (Press Ctrl+Alt+V or run .bat)', 'success');
  } catch (err) {
    showStatus('⚠️ Error: ' + err.message, 'error');
  }
}

// In-window hotkey support (Escape, Ctrl+Shift+Space, Ctrl+Shift+V, Ctrl+Alt+V)
window.addEventListener('keydown', e => {
  const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName);
  if (e.key === 'Escape') {
    e.preventDefault();
    api.action('close');
  } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.code === 'Space' || e.key === ' ' || e.keyCode === 32)) {
    e.preventDefault();
    api.action('test', {
      character: settings.reminderCharacter || 'character1',
      userName: settings.userName || 'Friend',
      cheerMessage: settings.cheerMessage || 'Keep going! 💙'
    });
    showStatus('🎮 3D Companion summoned via shortcut (Ctrl+Shift+Space)!', 'success');
  } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'v' || e.key === 'V')) {
    e.preventDefault();
    if (screenWelcome && screenWelcome.classList.contains('active')) {
      goToScreen('setup');
    } else {
      goToScreen('welcome');
    }
    showStatus('🔀 Switched view via shortcut (Ctrl+Shift+V)!', 'info');
  } else if ((e.ctrlKey || e.metaKey) && e.altKey && (e.key === 'v' || e.key === 'V')) {
    e.preventDefault();
    handleCreateShortcut();
  }
});

// Clickable Shortcut Buttons & Badges
$('btnCreateDesktopShortcut')?.addEventListener('click', e => {
  e.preventDefault();
  handleCreateShortcut();
});
$('shortcutItemDesktop')?.addEventListener('click', e => {
  e.preventDefault();
  handleCreateShortcut();
});
$('shortcutItemCompanion')?.addEventListener('click', e => {
  e.preventDefault();
  api.action('test', {
    character: settings.reminderCharacter || 'character1',
    userName: settings.userName || 'Friend',
    cheerMessage: settings.cheerMessage || 'Keep going! 💙'
  });
  showStatus('🎮 3D Companion summoned (Ctrl+Shift+Space)!', 'success');
});
$('shortcutItemWindow')?.addEventListener('click', e => {
  e.preventDefault();
  if (screenWelcome && screenWelcome.classList.contains('active')) {
    goToScreen('setup');
  } else {
    goToScreen('welcome');
  }
  showStatus('🔀 Switched view (Ctrl+Shift+V)!', 'info');
});

// Windows App Download Modal Listeners
const modalDownload = $('modalDownloadApp');
$('btnDownloadAppHeader')?.addEventListener('click', e => {
  e.preventDefault();
  if (modalDownload) modalDownload.style.display = 'flex';
});
$('btnCloseDownloadModal')?.addEventListener('click', e => {
  e.preventDefault();
  if (modalDownload) modalDownload.style.display = 'none';
});
modalDownload?.addEventListener('click', e => {
  if (e.target === modalDownload) modalDownload.style.display = 'none';
});

// Prevent right-click context menu (blocks inspect element, save page, etc.)
window.addEventListener('contextmenu', e => e.preventDefault());

// Screen Navigation
$('btnNext')?.addEventListener('click', () => goToScreen('setup'));
$('btnTopBack')?.addEventListener('click', () => goToScreen('welcome'));
stepIndicator1?.addEventListener('click', () => goToScreen('welcome'));
stepIndicator2?.addEventListener('click', () => goToScreen('setup'));

// Companion Character Switching (< and > chevrons)
const COMPANIONS = ['character1', 'character2', 'character3', 'character4', 'character5', 'character6', 'character7', 'character8'];

function stepCompanionCharacter(step) {
  let idx = COMPANIONS.indexOf(settings.reminderCharacter);
  if (idx === -1) idx = 0;
  idx = (idx + step + COMPANIONS.length) % COMPANIONS.length;
  settings.reminderCharacter = COMPANIONS[idx];
  showSelection();
  save();
}

$('btnPrevChar')?.addEventListener('click', e => {
  e.stopPropagation();
  e.preventDefault();
  stepCompanionCharacter(-1);
});

$('btnNextChar')?.addEventListener('click', e => {
  e.stopPropagation();
  e.preventDefault();
  stepCompanionCharacter(1);
});

// Test Currently Selected Character (Testing only, does not alter saved reminders)
$('btnTestCharacter')?.addEventListener('click', e => {
  e.stopPropagation();
  e.preventDefault();
  api.action('test', {
    character: settings.reminderCharacter || 'character1',
    userName: settings.userName || 'Friend',
    cheerMessage: settings.cheerMessage || 'Keep going! 💙'
  });
});

// OrbitControls Toolbar
if (btnAutoSpin) {
  btnAutoSpin.classList.toggle('active', autoSpin);
  btnAutoSpin.addEventListener('click', e => {
    e.stopPropagation();
    autoSpin = !autoSpin;
    if (controls) controls.autoRotate = autoSpin;
    btnAutoSpin.classList.toggle('active', autoSpin);
  });
}

if (btnResetView) {
  btnResetView.addEventListener('click', e => {
    e.stopPropagation();
    if (controls && camera) {
      controls.reset();
      controls.target.set(0, 0.88, 0);
      camera.position.set(0, 1.15, 3.2);
    }
  });
}

console.log('CONTROL SCRIPT LOADED');
syncFormToSettings();
showSelection();
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('screen') === 'setup') {
  goToScreen('setup');
}
if (api && api.onState) {
  api.onState(render);
  api.getState().then(s => {
    console.log('CONTROL RECEIVED STATE:', s);
    render(s);
  }).catch(err => console.error('GET STATE FAILED:', err));
}
