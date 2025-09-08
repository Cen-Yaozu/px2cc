"use strict";

const importString = require("./importString.js");
const { normalizeContext } = require("./global.js");

/** @typedef {import("./global.js").FromMemOptions} FromMemOptions */
/** @typedef {[string, string, FromMemOptions, string, string|undefined]} Message */

process.on("message", async (/** @type {Message} */ msg) => {
  const [code, dirname, options] = msg;
  try {
    normalizeContext(options);
    const result = await importString(code, dirname, options);
    delete options.consoleOutput?.capture;
    process.send?.({
      result,
      consoleOutput: options.consoleOutput,
    }, () => process.exit(0));
  } catch (error) {
    delete options.consoleOutput?.capture;
    process.send?.({
      error,
      consoleOutput: options.consoleOutput,
    }, () => process.exit(0));
  }
});
