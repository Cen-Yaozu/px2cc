"use strict";

const { Module } = require("node:module");
const { evalAsync } = require("./utils.js");
const vm = require("node:vm");

/** @typedef {import("./global.js").FromMemOptions} FromMemOptions */
/** @typedef {import("./global.js").NormalizedOptions} NormalizedOptions */

/**
 * Treat the given code as a node module as if require() had been called
 * on a file containing the code.
 *
 * @param {string} code Source code in commonjs format.
 * @param {string} dirname Used for __dirname.
 * @param {FromMemOptions} options
 * @returns {unknown} The module exported from code, or the result from exec.
 */
function requireString(code, dirname, options) {
  // @ts-expect-error This isn't correct.
  const m = new Module(options.filename, module); // Current module is parent.
  // This is the function that will be called by `require()` in the parser.
  m.require = Module.createRequire(options.filename);

  // Ensure runInNewContext returns the correct thing, even if code doesn't
  // end in a newline or semi.  'bare' has the needed bits as the last thing
  // before returning already.
  switch (options.format) {
    case "amd":
      code = `\
${code}

;function define(id, dependencies, factory) {
  if (typeof id === "function") {
    factory = id;
  } else if (typeof dependencies === "function") {
    factory = dependencies;
  }
  module.exports = factory();
}

module.exports;
`;
      break;
    case "bare":
      break;
    case "globals":
      if (!options.exportVar) {
        throw new Error("exportVar required for format globals");
      }
      code = `\
${code}

;this.${options.exportVar};
`;
      break;
    default:
      code = `\
${code}

;module.exports;
`;
      break;
  }

  const script = new vm.Script(code, {
    filename: options.filename,
    lineOffset: options.lineOffset,
    columnOffset: options.columnOffset,
  });
  try {
    const mod = script.runInNewContext({
      module: m,
      exports: m.exports,
      require: m.require,
      __dirname: dirname,
      __filename: options.filename,
      ...options.context,
    });
    if (options.exec) {
      return evalAsync(mod, options);
    }
    return mod;
  } finally {
    options.consoleOutput?.capture?.();
  }
}

module.exports = requireString;
