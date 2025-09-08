"use strict";

const { fork } = require("node:child_process");
const path = require("node:path");
const { denormalizeContext } = require("./global.js");

/** @typedef {import("./global.js").FromMemOptions} FromMemOptions */
/** @typedef {import("./global.js").ConsoleOutErr} ConsoleOutErr */

/**
 * @typedef {object} SpawnResult
 * @prop {Error|undefined} [error]
 * @prop {unknown} [result]
 * @prop {ConsoleOutErr} [consoleOutput]
 */

/**
 * Treat the given code as a node module as if import had been called on a
 * file containing the code.  Creates a child process with
 * --experimental-vm-modules.  Slightly better security than running
 * in-process, but slower and will not pass non-serializable types adequately
 * across the boundary correctly.
 *
 * @param {string} code Source code in es6 format.
 * @param {string} dirname Where the synthetic file would have lived.
 * @param {FromMemOptions} options
 * @returns {Promise<SpawnResult>} The module exports from code
 */
function spawnChild(code, dirname, options) {
  return new Promise((resolve, reject) => {
    const execArgv = [
      ...process.execArgv,
      "--experimental-vm-modules",
      "--no-warnings",
    ];

    const child = fork(path.join(__dirname, "child.js"), {
      execArgv,
      serialization: "advanced",
    });

    child.on("spawn", () => {
      // Ensure that global variables are not passed across the send boundary.
      // The will be re-added in child.js.
      denormalizeContext(options);
      child.send([code, dirname, options]);
    });
    child.on("error", reject);
    child.on("message", (/** @type {SpawnResult} */msg) => {
      resolve(msg);
    });
  });
}

module.exports = spawnChild;
