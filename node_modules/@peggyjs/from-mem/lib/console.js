"use strict";
const { Console } = require("node:console");
const { Transform } = require("node:stream");

/** @typedef {import("node:stream").TransformCallback} TransformCallback */

class Recorder extends Transform {
  /**
   * @param {any} chunk
   * @param {NodeJS.BufferEncoding} _encoding
   * @param {TransformCallback} callback
   */
  // eslint-disable-next-line class-methods-use-this
  _transform(chunk, _encoding, callback) {
    callback(null, chunk);
  }
}

class ConsoleOutput {
  #stdout = new Recorder();
  #stderr = new Recorder();
  #console;

  /**
   * @param {boolean | "auto" | undefined} [colorMode = "auto"]
   */
  constructor(colorMode = "auto") {
    this.#console = new Console({
      stdout: this.#stdout,
      stderr: this.#stderr,
      colorMode,
    });
  }

  /**
   * @returns {Console}
   */
  get console() {
    return this.#console;
  }

  /**
   * @returns {string}
   */
  get stdout() {
    return this.#stdout.read()?.toString() ?? "";
  }

  /**
   * @returns {string}
   */
  get stderr() {
    return this.#stderr.read()?.toString() ?? "";
  }
}

module.exports = ConsoleOutput;
