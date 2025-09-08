"use strict";

const vm = require("node:vm");
const fs = require("node:fs/promises");
const path = require("node:path");
const AsyncFunction = Object.getPrototypeOf(async () => await 0).constructor;

/** @typedef {import("./global.js").FromMemOptions} FromMemOptions */

/**
 * Execute the given code in an Async function, passing in two parameters.
 * Usually the first will be an imported/required module, and the second
 * (optional) argument that is user-specific.
 *
 * @param {unknown} imported Imported module.
 * @param {FromMemOptions} options Second arg for `exec` code.
 * @returns
 */
function evalAsync(imported, options) {
  const f = new AsyncFunction("IMPORTED", "arg", "console", options.exec);
  return f(imported, options.arg, options?.context?.console ?? console);
}

/**
 * @typedef {"commonjs"|"es"} ModuleType
 */

/**
 * @type Record<string, ModuleType>
 */
let cache = {};

/**
 * Figure out the module type for the given file.  If no package.json is
 * found, default to "commonjs".
 *
 * @param {string} filename Fully-qualified filename to start from.
 * @returns {Promise<ModuleType>}
 * @throws On invalid package.json
 */
async function guessModuleType(filename) {
  const fp = path.parse(filename);
  switch (fp.ext) {
    case ".cjs": return "commonjs";
    case ".mjs": return "es";
    default:
      // Fall-through
  }

  /** @type {ModuleType} */
  let res = "commonjs";
  let dir = fp.dir;
  let prev = undefined;
  const pending = [];
  while (dir !== prev) {
    const cached = cache[dir];
    if (cached) {
      return cached;
    }
    pending.push(dir);
    try {
      const pkg = await fs.readFile(path.join(dir, "package.json"), "utf8");
      const pkgj = JSON.parse(pkg);
      res = (pkgj.type === "module") ? "es" : "commonjs";
      break;
    } catch (err) {
      // If the file just didn't exist, keep going.
      if (/** @type {NodeJS.ErrnoException} */ (err).code !== "ENOENT") {
        throw err;
      }
    }
    prev = dir;
    dir = path.dirname(dir);
  }
  for (const p of pending) {
    cache[p] = res;
  }
  return res;
}

function clearModuleTypeCache() {
  cache = {};
}

/**
 * Is importing from an ES6 module supported in the current environment?
 *
 * @returns {boolean}
 */
function isImportSupported() {
  return Boolean(vm.SourceTextModule);
}

/**
 * If the given specifier starts with a ".", path.resolve it to the given
 * directory.  Otherwise, it's a fully-qualified path, a node internal
 * module name, an npm-provided module name, or a URL.
 *
 * @param {string} dirname Owning directory
 * @param {string} specifier String from the rightmost side of an import statement
 * @returns {string} Resolved path name or original string
 */
function resolveIfNeeded(dirname, specifier) {
  if (specifier.startsWith(".")) {
    specifier = new URL(specifier, dirname).toString();
  }
  return specifier;
}

module.exports = {
  clearModuleTypeCache,
  evalAsync,
  guessModuleType,
  isImportSupported,
  resolveIfNeeded,
};
