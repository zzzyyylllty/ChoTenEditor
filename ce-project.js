/* CraftEngine 工程根回溯模块（纯 Node，无 electron 依赖，可独立 require 测试）
 * 从配置文件路径向上回溯目录树：
 *   pack 根   = 含 pack.yml（带 namespace: 字段）的最近祖先目录
 *   plugin 根 = 含 config.yml（带 config-version: 且存在 mappings.yml/commands.yml/translations/ 任一）的祖先目录
 * 内容目录名可自定义（如"工程内容"），不硬编码。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const MAX_LEVELS = 8;
const PACK_NS_RE = /^namespace:\s*(\S+)/m;
const PLUGIN_VER_RE = /config-version:/m;

async function fileExists(p) {
  try { return (await fs.promises.stat(p)).isFile(); } catch (e) { return false; }
}

async function dirExists(p) {
  try { return (await fs.promises.stat(p)).isDirectory(); } catch (e) { return false; }
}

async function readHead(p, bytes) {
  try {
    const fd = await fs.promises.open(p, 'r');
    try {
      const buf = Buffer.alloc(bytes);
      const { bytesRead } = await fd.read(buf, 0, bytes, 0);
      return buf.toString('utf8', 0, bytesRead);
    } finally { await fd.close(); }
  } catch (e) { return ''; }
}

/**
 * 从 filePath 向上回溯，定位 CE 工程根与所属 pack。
 * @param {string} filePath 打开的配置文件绝对路径
 * @returns {Promise<{found:boolean, pluginRoot?:string, packRoot?:string, namespace?:string, contentDirName?:string}>}
 */
async function resolveProjectRoot(filePath) {
  let dir = path.dirname(filePath);
  let packRoot = null;
  let namespace = null;
  let pluginRoot = null;

  for (let i = 0; i < MAX_LEVELS; i++) {
    let names = null;
    try { names = await fs.promises.readdir(dir); } catch (e) { break; }

    if (!packRoot && names.includes('pack.yml')) {
      const head = await readHead(path.join(dir, 'pack.yml'), 4096);
      const m = head.match(PACK_NS_RE);
      if (m) { packRoot = dir; namespace = m[1]; }
    }

    if (!pluginRoot && names.includes('config.yml')) {
      const head = await readHead(path.join(dir, 'config.yml'), 4096);
      if (PLUGIN_VER_RE.test(head)) {
        const hasBrother = names.includes('mappings.yml') ||
          names.includes('commands.yml') ||
          names.includes('translations');
        if (hasBrother) pluginRoot = dir;
      }
    }

    if (packRoot && pluginRoot) break;

    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  if (!packRoot && !pluginRoot) return { found: false };

  let contentDirName = null;
  if (packRoot && pluginRoot && path.dirname(packRoot) !== pluginRoot) {
    contentDirName = path.basename(path.dirname(packRoot));
  }

  return {
    found: true,
    pluginRoot,
    packRoot,
    namespace,
    contentDirName,
  };
}

module.exports = { resolveProjectRoot, MAX_LEVELS };
