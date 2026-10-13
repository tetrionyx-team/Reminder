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

function showCompanionPopup(payload) {
  const existing = document.getElementById('webCompanionTestPopup');
  if (existing) existing.remove();

  const char = payload?.character || settings.reminderCharacter || 'character1';
  const charNum = String(char).replace(/[^0-9]/g, '') || '1';
  const name = payload?.userName || settings.userName || 'Friend';
  const cheer = payload?.cheerMessage || settings.cheerMessage || 'Nice! 💙';

  const entryVideo = `../assets/ReminderVideos/Character${charNum}/entry.webm`;
  const successVideo = `../assets/ReminderVideos/Character${charNum}/success-out.webm`;
  const disappointVideo = `../assets/ReminderVideos/Character${charNum}/disappointed-out.webm`;

  const popup = document.createElement('div');
  popup.id = 'webCompanionTestPopup';
  popup.className = 'web-companion-popup animate-popup-in';
  popup.innerHTML = `
    <div class="web-companion-bubble-wrapper" id="webBubbleWrap">
      <div class="web-companion-bubble">
        <div class="web-bubble-text" id="webBubbleText">Hey ${escapeHtml(name)}!<br>Did you drink water? 💧</div>
        <div class="web-bubble-actions" id="webBubbleActions">
          <button type="button" class="btn-web-bubble-yes" id="btnWebBubbleYes">YES</button>
          <button type="button" class="btn-web-bubble-snooze" id="btnWebBubbleSnooze">Remind me later</button>
        </div>
      </div>
      <div class="web-bubble-tip"></div>
    </div>
    <div class="web-companion-video-wrap">
      <video id="webCompVideo" class="web-companion-video ${['5', '7'].includes(charNum) ? 'keyed-video' : ''}" playsinline autoplay muted preload="auto" src="${entryVideo}"></video>
    </div>
  `;
  document.body.appendChild(popup);

  const videoEl = popup.querySelector('#webCompVideo');
  const bubbleWrap = popup.querySelector('#webBubbleWrap');
  const bubbleText = popup.querySelector('#webBubbleText');
  const bubbleActions = popup.querySelector('#webBubbleActions');
  const btnYes = popup.querySelector('#btnWebBubbleYes');
  const btnSnooze = popup.querySelector('#btnWebBubbleSnooze');

  const CHAR_RATIOS = {
    '1': 0.201,
    '2': 0.113,
    '3': 0.908,
    '4': 0.812,
    '5': 0.500,
    '6': 0.500,
    '7': 0.500,
    '8': 0.378
  };

  const updateVideoPosition = () => {
    if (!videoEl) return;
    const ratio = CHAR_RATIOS[charNum] ?? 0.5;
    const wrapWidth = 260;
    const wrapHeight = 330;
    const aspect = (videoEl.videoWidth && videoEl.videoHeight) ? (videoEl.videoWidth / videoEl.videoHeight) : (16 / 9);
    const renderedWidth = wrapHeight * aspect;
    const charCenterX = renderedWidth * ratio;
    const leftOffset = Math.round((wrapWidth / 2) - charCenterX);
    videoEl.style.left = `${leftOffset}px`;
    videoEl.style.width = `${Math.round(renderedWidth)}px`;
    videoEl.style.height = `${wrapHeight}px`;
  };

  // Play entry video immediately
  if (videoEl) {
    updateVideoPosition();
    videoEl.src = entryVideo;
    videoEl.load();
    videoEl.play().catch(e => console.warn('Autoplay notice:', e));
    videoEl.addEventListener('loadedmetadata', updateVideoPosition);
    videoEl.addEventListener('loadeddata', () => {
      updateVideoPosition();
      console.log('COMPANION VIDEO LOADED DATA OK');
    });
    videoEl.addEventListener('ended', () => {
      if (bubbleWrap) bubbleWrap.classList.add('visible');
    });
  }

  // Ensure speech bubble pops up smoothly
  setTimeout(() => {
    if (bubbleWrap) bubbleWrap.classList.add('visible');
  }, 1800);

  btnYes.addEventListener('click', (e) => {
    e.stopPropagation();
    bubbleActions.style.display = 'none';
    bubbleText.innerHTML = `<b>${escapeHtml(cheer)}</b>`;
    
    // Switch to success-out celebration video!
    if (videoEl) {
      videoEl.src = successVideo;
      videoEl.play().catch(() => {});
      videoEl.onended = () => {
        popup.classList.add('animate-popup-out');
        setTimeout(() => popup.remove(), 400);
      };
    }

    setTimeout(() => {
      if (document.body.contains(popup)) {
        popup.classList.add('animate-popup-out');
        setTimeout(() => popup.remove(), 400);
      }
    }, 4500);
  });

  btnSnooze.addEventListener('click', (e) => {
    e.stopPropagation();
    bubbleWrap.style.display = 'none';

    // Switch to disappointed-out walk-off video!
    if (videoEl) {
      videoEl.src = disappointVideo;
      videoEl.play().catch(() => {});
      videoEl.onended = () => {
        popup.classList.add('animate-popup-out');
        setTimeout(() => popup.remove(), 400);
      };
    }

    setTimeout(() => {
      if (document.body.contains(popup)) {
        popup.classList.add('animate-popup-out');
        setTimeout(() => popup.remove(), 400);
      }
    }, 4500);
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
    } else if (act === 'quit') {
      showStatus('✕ Vara closed. You can close this tab.', 'info');
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
  createShortcut: null
};
const $ = id => document.getElementById(id);
let settings = {
  userName: '',
  interval: 45,
  customIntervalMinutes: 75,
  reminderTime: '10:00',
  pauseWhenInactive: true,
  inactivityThresholdMinutes: 12,
  reminderCharacter: 'character2',
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

    // B. Also generate 1-Click Windows Desktop Setup Launcher (.bat) that creates true .lnk on Desktop
    const batContent = `@echo off\r\ntitle Installing Vara 3D Companion Desktop Shortcut\r\necho ========================================================\r\necho        Installing Vara 3D Companion on Desktop\r\necho ========================================================\r\npowershell -NoProfile -Command "$wsh = New-Object -ComObject WScript.Shell; $d = [System.Environment]::GetFolderPath('Desktop'); $lnk = $wsh.CreateShortcut($d + '\\Vara - 3D Companion.lnk'); $lnk.TargetPath = 'cmd.exe'; $lnk.Arguments = '/c start chrome --app=\\"${currentUrl}\\" || start \\"\\" \\"${currentUrl}\\"'; $lnk.Description = 'Vara - 3D Companion & Reminder'; $lnk.Hotkey = 'Ctrl+Alt+V'; $lnk.Save(); Write-Host '[SUCCESS] Vara Desktop Shortcut created on your Desktop!' -ForegroundColor Green;"\r\necho.\r\necho [OK] Vara 3D Companion shortcut added to your Desktop!\r\necho Press Ctrl+Alt+V anytime to launch!\r\ntimeout /t 4\r\n`;
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

    showStatus('📥 Downloaded in Chrome! Check your browser downloads.', 'success');
  } catch (err) {
    showStatus('⚠️ Error: ' + err.message, 'error');
  }
}

// In-window hotkey support
window.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    api.action('close');
  }
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
