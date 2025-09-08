"use strict";

const semver = require("semver");
const url = require("node:url");
const vm = require("node:vm");
const { evalAsync, isImportSupported, resolveIfNeeded } = require("./utils.js");
const spawnChild = require("./parent.js");

/** @typedef {import("./global.js").FromMemOptions} FromMemOptions */
/** @typedef {import("./global.js").NormalizedOptions} NormalizedOptions */

/**
 * Treat the given code as a node module as if import had been called
 * on a file containing the code.
 *
 * @param {string} code Source code in es6 format.
 * @param {string} dirname Where the synthetic file would have lived.
 * @param {FromMemOptions} options
 * @returns {Promise<unknown>} The module exported from code, or results of exec.
 */
async function importString(code, dirname, options) {
  if (!semver.satisfies(process.version, ">=20.8")) {
    throw new Error("Requires node.js 20.8+ or 21.");
  }

  if (!isImportSupported()) {
    if (!options.exec) {
      throw new Error("Start node with `node --experimental-vm-modules` in order to import ES6 modules");
    }
    const res = await spawnChild(code, dirname, options);
    if (options.consoleOutput) {
      options.consoleOutput.out = res.consoleOutput?.out;
      options.consoleOutput.err = res.consoleOutput?.err;
    }
    if (res.error) {
      throw res.error;
    }
    return res.result;
  }

  const fileUrl = options.filename.startsWith("file:")
    ? options.filename
    : url.pathToFileURL(options.filename).toString();
  const dirUrl = dirname.startsWith("file:")
    ? dirname + "/"
    : url.pathToFileURL(dirname).toString() + "/";

  const mod = new vm.SourceTextModule(code, {
    identifier: fileUrl,
    lineOffset: options.lineOffset,
    columnOffset: options.columnOffset,
    context: vm.createContext(options.context),
    initializeImportMeta(meta) {
      meta.url = fileUrl;
    },
    importModuleDynamically(specifier) {
      return import(
        /* webpackIgnore: true */ resolveIfNeeded(dirUrl, specifier)
      );
    },
  });

  await mod.link(async (specifier, referencingModule) => {
    const resolvedSpecifier = resolveIfNeeded(dirUrl, specifier);
    const targetModule = await import(
      /* webpackIgnore: true */ resolvedSpecifier
    );
    const exports = Object.keys(targetModule);

    // DO NOT change function to () =>, or `this` will be wrong.
    return new vm.SyntheticModule(exports, function() {
      for (const e of exports) {
        this.setExport(e, targetModule[e]);
      }
    }, {
      context: referencingModule.context,
    });
  });

  try {
    await mod.evaluate();
    const ns = mod.namespace;
    if (options.exec) {
      return evalAsync(ns, options);
    }
    // Only possible with --experimental-vm-modules
    return ns;
  } finally {
    options.consoleOutput?.capture?.();
  }
}

module.exports = importString;
