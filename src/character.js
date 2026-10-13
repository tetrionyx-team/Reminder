'use strict';
console.log('CHARACTER.JS SCRIPT LOADED');
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
let role = 'entry', selected, movement, token = 0, canvasWidth = 540, originX = 0;
let gl, glProg, glBuf, glTex, renderRaf = null;

const KEYED_CHARACTERS = ['character5', 'character7'];
function isKeyedCharacter(char) {
  return KEYED_CHARACTERS.includes(char);
}

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
    '  // 1. Remove Gemini watermark in bottom-right corner',
    '  if (v_uv.x > 0.86 && v_uv.y < 0.25) {',
    '    discard;',
    '  }',
    '  float r = col.r;',
    '  float g = col.g;',
    '  float b = col.b;',
    '  float maxC = max(r, max(g, b));',
    '  float minC = min(r, min(g, b));',
    '  float chroma = maxC - minC;',
    '  // 2. Pure black background elimination',
    '  if (maxC < 0.015) {',
    '    discard;',
    '  }',
    '  // 3. Remove blurry floor smoke/mist on lower sides',
    '  if (v_uv.y < 0.40 && (v_uv.x < 0.38 || v_uv.x > 0.62)) {',
    '    if (chroma < 0.08 && maxC < 0.32) {',
    '      discard;',
    '    }',
    '  }',
    '  // 4. Smooth alpha edge',
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

  glBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, glBuf);
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
    if (isKeyedCharacter(selected) && !video.ended) {
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
  return isKeyedCharacter(selected) ? canvas : video;
}

window.pixelFriend.onReminder(async data => {
  console.log('CHARACTER ONREMINDER EVENT RECEIVED:', JSON.stringify(data));
  const current = ++token; role = data.role; selected = data.character; canvasWidth = data.canvasWidth || 540; originX = data.originX || 0;
  entryReadySent = false;
  stopRendering();
  if (movement) movement.cancel(); movement = null;

  video.style.transform = '';
  canvas.style.transform = '';

  const w = (data.videoWidth || 540) + 'px';
  video.style.position = 'absolute'; video.style.left = originX + 'px'; video.style.width = w;
  canvas.style.position = 'absolute'; canvas.style.left = originX + 'px'; canvas.style.width = w;

  if (isKeyedCharacter(selected)) {
    video.style.display = 'none';
    canvas.style.display = 'block';
    canvas.style.visibility = 'hidden';
  } else {
    canvas.style.display = 'none';
    canvas.style.visibility = 'hidden';
    video.style.display = 'block';
    video.style.visibility = 'hidden';
  }

  video.classList.toggle('corrected', selected === 'character2' && role === 'success-out');
  const videoSrc = `../assets/ReminderVideos/Character${selected.slice(-1)}/${role}.webm`;
  console.log('SETTING VIDEO SRC TO:', videoSrc);
  video.src = videoSrc;
  try {
    console.log('CALLING video.play()...');
    await video.play();
    console.log('VIDEO PLAY STARTED SUCCESSFULLY');
    if (current !== token) return;
    if (selected === 'character7' && role === 'success-out') {
      video.currentTime = 1.2;
    }
    if (isKeyedCharacter(selected)) startRendering();

    if (selected === 'character7') {
      const targetEl = getActiveElement();
      if (role === 'entry') {
        movement = targetEl.animate([
          { transform: 'translateX(-350px)' },
          { transform: 'translateX(0px)' }
        ], {
          duration: 2300,
          easing: 'linear',
          fill: 'forwards'
        });
      } else if (role === 'success-out') {
        const destX = canvasWidth + 270 - originX;
        const durationMs = Math.max(100, (video.duration - 1.2) * 1000);
        movement = targetEl.animate([
          { transform: 'translateX(0px)' },
          { transform: `translateX(${destX}px)` }
        ], {
          duration: durationMs,
          easing: 'ease-in',
          fill: 'forwards'
        });
      }
    }
  } catch (err) {
    console.error('VIDEO PLAY FAILED:', err);
    window.pixelFriend.action('video-error');
  }
});

video.addEventListener('loadeddata', () => {
  console.log('VIDEO LOADEDDATA FIRED');
  if (isKeyedCharacter(selected)) {
    canvas.style.visibility = 'visible';
    startRendering();
  } else {
    video.style.visibility = 'visible';
  }
});

video.addEventListener('timeupdate', () => {
  if (selected === 'character5') {
    if (role === 'entry' && video.currentTime >= 3.2 && !entryReadySent) {
      entryReadySent = true;
      video.pause();
      window.pixelFriend.action('entry-ready');
    }
    return;
  }

  // Character 6 specific fix only
  if (selected === 'character6') {
    if (role === 'entry' && video.currentTime >= 3.2 && !entryReadySent) {
      entryReadySent = true;
      video.pause();
      window.pixelFriend.action('entry-ready');
      return;
    }
    if (role === 'success-out' && !movement && video.currentTime >= 1.2) {
      const targetEl = getActiveElement();
      const destX = canvasWidth + 270 - originX;
      const durationMs = Math.max(100, (video.duration - video.currentTime) * 1000);
      movement = targetEl.animate([
        { transform: 'translateX(0)' },
        { transform: `translateX(${destX}px)` }
      ], {
        duration: durationMs,
        easing: 'ease-in',
        fill: 'forwards'
      });
      return;
    }
    if (role === 'disappointed-out' && !movement && video.currentTime >= 5.5) {
      const targetEl = getActiveElement();
      const destX = -560 - originX;
      const durationMs = Math.max(100, (video.duration - video.currentTime + 0.45) * 1000);
      movement = targetEl.animate([
        { transform: 'translateX(0)' },
        { transform: `translateX(${destX}px)` }
      ], {
        duration: durationMs,
        easing: 'ease-in',
        fill: 'forwards'
      });
      return;
    }
    return;
  }

  if (selected === 'character8') {
    if (role === 'success-out' && !movement && video.currentTime >= 5.8) {
      const targetEl = getActiveElement();
      const destX = -560 - originX;
      const durationMs = Math.max(100, (video.duration - video.currentTime) * 1000);
      movement = targetEl.animate([
        { transform: 'translateX(0px)' },
        { transform: `translateX(${destX}px)` }
      ], {
        duration: durationMs,
        easing: 'linear',
        fill: 'forwards'
      });
    }
    return;
  }

  if (selected === 'character7') {
    if (role === 'disappointed-out' && !movement && video.currentTime >= 6.2) {
      const targetEl = getActiveElement();
      const destX = -560 - originX;
      const durationMs = Math.max(100, (video.duration - video.currentTime + 0.45) * 1000);
      movement = targetEl.animate([
        { transform: 'translateX(0px)' },
        { transform: `translateX(${destX}px)` }
      ], {
        duration: durationMs,
        easing: 'ease-in',
        fill: 'forwards'
      });
    }
    return;
  }

  const animatedChars = ['character1'];
  if (!animatedChars.includes(selected) || role === 'entry' || movement) return;
  const lead = role === 'success-out' ? 2.1 : 7;
  if (video.currentTime >= lead) {
    const targetEl = getActiveElement();
    const destX = role === 'success-out' ? (canvasWidth + 270 - originX) : (-560 - originX);
    const durationMs = Math.max(100, (video.duration - video.currentTime + (role === 'disappointed-out' ? 0.45 : 0)) * 1000);
    movement = targetEl.animate([
      { transform: 'translateX(0)' },
      { transform: `translateX(${destX}px)` }
    ], {
      duration: durationMs,
      easing: 'ease-in',
      fill: 'forwards'
    });
  }
});

video.addEventListener('ended', async () => {
  stopRendering();
  if (role === 'entry') window.pixelFriend.action('entry-ready');
  else {
    if (movement) await movement.finished.catch(() => {});
    window.pixelFriend.action('exit-done');
  }
});

video.addEventListener('error', () => {
  stopRendering();
  window.pixelFriend.action('video-error');
});
