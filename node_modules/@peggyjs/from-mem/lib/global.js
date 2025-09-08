"use strict";

const vm = require("node:vm");
const ConsoleOutput = require("./console.js");

/**
 * @typedef {"amd"
 * | "bare"
 * | "cjs"
 * | "commonjs"
 * | "es"
 * | "es6"
 * | "esm"
 * | "globals"
 * | "guess"
 * | "mjs"
 * | "module"
 * | "umd" } SourceFormat
 */

/**
 * @typedef {object} ConsoleOutErr
 * @prop {string|undefined} [out] Stdout.
 * @prop {string|undefined} [err] Stdout.
 * @prop {() => void} [capture] Call this to snapshot out and err.  Will
 *   be added to the empty object you provide.
 */

/**
 * Options for how to process code.
 *
 * @typedef {object} FromMemOptions
 * @property {SourceFormat} [format="guess"] What format does the code have?
 *   "guess" means to read the closest package.json file looking for the
 *   "type" key.  "globals", "amd", and "bare" are not actually supported.
 * @property {Record<string, any>} [env] If specified, use this instead of the
 *   current values in process.env.  Works if includeGlobals is false by
 *   creating an otherwise-empty process instance.
 * @property {string} filename What is the fully-qualified synthetic filename
 *   for the code?  Most important is the directory, which is used to find
 *   modules that the code import's or require's.
 * @property {Record<string, any>} [context={}] Variables to make availble in
 *   the global scope while code is being evaluated.  Overwrites global
 *   properties as needed.
 * @property {boolean} [includeGlobals=true] Include the typical global
 *   properties that node gives to all modules.  (e.g. Buffer, process).
 * @property {number} [lineOffset=0] Specifies the line number offset that is
 *   displayed in stack traces produced by this script.
 * @property {number} [columnOffset=0] Specifies the first-line column number
 *   offset that is displayed in stack traces produced by this script.
 * @property {string} [exec] If specified, execute this code on the resulting
 *   module in an async context, with `IMPORTED` being the imported module,
 *   and `arg` being the value of the arg option.
 * @property {unknown} [arg] Will be available as "arg" in the exec code.
 * @property {ConsoleOutErr} [consoleOutput] If specified, will be filled in
 *   with output from the console.* functions.
 * @property {boolean | "auto" | undefined} [colorMode = "auto"] Set color
 *   support for this Console instance. Setting to true enables coloring while
 *   inspecting values. Setting to false disables coloring while inspecting
 *   values. Setting to 'auto' makes color support depend on the value of the
 *   isTTY property and the value returned by getColorDepth() on the
 *   respective stream.  Ignored if consoleOutput is not set.
 * @property {string} [exportVar] If format is "globals", use this as the
 *   export variable.
 */

// These already exist in a new, blank VM.  Date, JSON, NaN, etc.
// Things from the core language.
const vmGlobals = new Set(new vm
  .Script("Object.getOwnPropertyNames(globalThis)")
  .runInNewContext());
vmGlobals.add("global");
vmGlobals.add("globalThis");
vmGlobals.add("sys");

// These are the things that are normally in the environment, that vm doesn't
// make available.  This that you expect to be available in a node environment
// that aren't in the laguage itself.  There are a lot more things in this list
// than you expect, like setTimeout and structuredClone.
const neededKeys = Object
  .getOwnPropertyNames(global)
  .filter(k => !vmGlobals.has(k))
  .sort();
const globalContext = Object.fromEntries(
  neededKeys.map(k => [k, global[
    /** @type {keyof typeof global} */ (k)
  ]])
);

globalContext.console = console;

/**
 * @typedef {object} NormalizedOptions
 * @property {Record<string, any>} [originalContext]
 * @property {ConsoleOutput} [console]
 */

/**
 * Fix up context as needed.
 *
 * @param {FromMemOptions & NormalizedOptions} options
 */
function normalizeContext(options) {
  options.originalContext = options.context;

  if (options.includeGlobals) {
    options.context = {
      ...globalContext,
      ...options.context,
    };
  } else {
    // Put this here instead of in the defaults above so that typescript
    // can see it.
    options.context = options.context || {};
  }

  // Make sure env changes don't stick.  This isn't a security measure, it's
  // to prevent mistakes.  There are probably a few other places where
  // mistakes are likely, and the same treatment should be given.
  if (options.context.process) {
    if (options.context.process === process) {
      options.context.process = { ...process };
    }
    options.context.process.env = options.env || {
      ...options.context.process.env,
    };
  } else if (options.env) {
    options.context.process = {
      version: process.version,
      env: { ...options.env },
    };
  }

  if (options.consoleOutput) {
    const co = options.consoleOutput;
    options.console = new ConsoleOutput(options.colorMode);
    options.consoleOutput.capture = () => {
      co.out = (co.out ?? "") + options.console?.stdout;
      co.err = (co.err ?? "") + options.console?.stderr;
    };
    options.context.console = options.console.console;
  }

  options.context.global = options.context;
  options.context.globalThis = options.context;
}

/**
 * Revert normalizeOptions.
 *
 * @param {FromMemOptions & NormalizedOptions} options
 */
function denormalizeContext(options) {
  options.context = options.originalContext;
  delete options.originalContext;
  delete options.console;
  delete options.consoleOutput?.capture;
}

module.exports = {
  normalizeContext,
  denormalizeContext,
  globalContext,
};
