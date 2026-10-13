'use strict';
const svgNS = 'http://www.w3.org/2000/svg';
const message = document.getElementById('message');
let messageVersion = 0;
async function renderMessage(text, response) {
  const version = ++messageVersion;
  await document.fonts.load('700 40px "PixelFriend Rounded"');
  if (version !== messageVersion) return;
  const lines = text.split('\n');
  const measuring = document.createElement('canvas').getContext('2d');
  measuring.font = '700 40px "PixelFriend Rounded", "Segoe UI Emoji", sans-serif';
  const widest = Math.max(...lines.map(line => measuring.measureText(line).width), 1);
  const fontSize = Math.min(response ? 23.8 : 22.4, 40 * 432 / widest);
  const lineHeight = fontSize * 1.25;
  const effectScale = fontSize / 40;
  const height = Math.ceil(lines.length * lineHeight + 12);
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', `0 0 456 ${height}`);
  svg.setAttribute('width', '456'); svg.setAttribute('height', String(height));
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('reminder-lettering');
  // Draw solid extruded shadows first, then the outlined golden face.
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
      node.setAttribute('fill', layer.fill); node.setAttribute('stroke', layer.stroke);
      node.setAttribute('stroke-width', String(layer.width * effectScale));
      node.setAttribute('stroke-linejoin', 'round'); node.setAttribute('paint-order', 'stroke fill');
      node.textContent = line; svg.appendChild(node);
    });
  }
  message.replaceChildren(svg); message.setAttribute('aria-label', text.replace(/\n/g, ' '));
}
window.pixelFriend.onReminder(data => {
  renderMessage(data.response || `Hey, ${data.name}\nDid you drink water?`, Boolean(data.response));
  document.getElementById('actions').hidden = Boolean(data.response);
  for (const button of document.querySelectorAll('button')) button.disabled = false;
});
for (const action of ['drink', 'snooze']) document.getElementById(action).addEventListener('click', () => { for (const button of document.querySelectorAll('button')) button.disabled = true; window.pixelFriend.action(action); });




