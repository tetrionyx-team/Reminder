'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const JavaScriptObfuscator = require('javascript-obfuscator');

const MASTER_PASSWORD = 'siva';
const PROJECT_ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(PROJECT_ROOT, 'src');
const VAULT_FILE = path.join(SRC_DIR, '.vault.enc');

const SOURCE_FILES = [
  'main.js',
  'engine.js',
  'control.js',
  'character.js',
  'bubble.js',
  'preload.js'
];

/**
 * AES-256-GCM encryption
 */
function encryptData(plaintext, password) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, 32);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([salt, iv, tag, encrypted]).toString('base64');
}

/**
 * AES-256-GCM decryption
 */
function decryptData(ciphertextBase64, password) {
  const buf = Buffer.from(ciphertextBase64, 'base64');
  if (buf.length < 48) throw new Error('Invalid cipher payload length');
  const salt = buf.subarray(0, 16);
  const iv = buf.subarray(16, 32);
  const tag = buf.subarray(32, 48);
  const encrypted = buf.subarray(48);
  const key = crypto.scryptSync(password, salt, 32);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

/**
 * Creates an encrypted backup of original source files
 */
function backupToVault(password = MASTER_PASSWORD) {
  const bundle = {};
  for (const filename of SOURCE_FILES) {
    const filePath = path.join(SRC_DIR, filename);
    if (fs.existsSync(filePath)) {
      bundle[filename] = fs.readFileSync(filePath, 'utf8');
    }
  }
  const encryptedPayload = encryptData(JSON.stringify(bundle), password);
  fs.writeFileSync(VAULT_FILE, encryptedPayload, 'utf8');
  console.log('✓ Encrypted backup created in vault:', VAULT_FILE);
  return bundle;
}

/**
 * Restores original source code from encrypted vault using password
 */
function restoreFromVault(password) {
  if (!fs.existsSync(VAULT_FILE)) {
    throw new Error('Encrypted vault file (.vault.enc) not found.');
  }
  const encryptedPayload = fs.readFileSync(VAULT_FILE, 'utf8');
  let bundle;
  try {
    const decryptedJson = decryptData(encryptedPayload, password);
    bundle = JSON.parse(decryptedJson);
  } catch (err) {
    throw new Error('Incorrect password! Cannot decrypt source vault.');
  }

  for (const [filename, content] of Object.entries(bundle)) {
    const filePath = path.join(SRC_DIR, filename);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('✓ Decrypted & restored:', filename);
  }
  console.log('✓ All source files successfully restored with password!');
}

/**
 * Obfuscates and locks all source files so they cannot be read or stolen
 */
function lockSourceFiles(password = MASTER_PASSWORD) {
  const mainPath = path.join(SRC_DIR, 'main.js');
  const isCurrentlyClean = fs.existsSync(mainPath) && !fs.readFileSync(mainPath, 'utf8').startsWith('/* 🔒');
  let bundle = {};

  if (isCurrentlyClean || !fs.existsSync(VAULT_FILE)) {
    bundle = backupToVault(password);
  } else {
    try {
      const decrypted = decryptData(fs.readFileSync(VAULT_FILE, 'utf8'), password);
      bundle = JSON.parse(decrypted);
    } catch {
      bundle = backupToVault(password);
    }
  }

  console.log('🔒 Locking and encrypting source files with military-grade protection...');

  for (const filename of SOURCE_FILES) {
    const rawCode = bundle[filename];
    if (!rawCode) continue;

    const isMainOrEngine = ['main.js', 'engine.js'].includes(filename);
    const obfResult = JavaScriptObfuscator.obfuscate(rawCode, {
      compact: true,
      controlFlowFlattening: true,
      controlFlowFlatteningThreshold: 0.75,
      deadCodeInjection: true,
      deadCodeInjectionThreshold: 0.35,
      stringArray: true,
      stringArrayEncoding: ['rc4'],
      stringArrayThreshold: 0.8,
      splitStrings: true,
      splitStringsChunkLength: 10,
      transformObjectKeys: true,
      selfDefending: true,
      target: isMainOrEngine ? 'node' : 'browser'
    });

    const header = `/* 🔒 VARA SECURITY LOCK - AES-256 PROTECTED CODE (AUTHENTICATION: SIVA)\n * UNAUTHORIZED EXTRACTION, COPYING, OR REVERSE ENGINEERING IS STRICTLY PROHIBITED.\n * TAMPERING OR BEAUTIFYING THIS CODE WILL TRIGGER SELF-DEFENDING SHUTDOWN.\n */\n`;
    const lockedCode = header + obfResult.getObfuscatedCode();
    const filePath = path.join(SRC_DIR, filename);
    fs.writeFileSync(filePath, lockedCode, 'utf8');
    console.log('🔒 Locked & Encrypted:', filename);
  }

  console.log('\n✅ ALL SOURCE CODE FILES ARE NOW LOCKED AND PROTECTED AGAINST HACKERS!');
  console.log('Original code is encrypted in src/.vault.enc with AES-256 (Password: siva).');
  console.log('To unlock original code for editing, run: npm run unlock -- siva');
}

if (require.main === module) {
  const cmd = process.argv[2] || 'lock';
  const pass = process.argv[3] || MASTER_PASSWORD;

  if (cmd === 'lock') {
    lockSourceFiles(pass);
  } else if (cmd === 'unlock') {
    restoreFromVault(pass);
  } else {
    console.log('Usage: node securityManager.js [lock|unlock] [password]');
  }
}

module.exports = { lockSourceFiles, restoreFromVault, encryptData, decryptData };
