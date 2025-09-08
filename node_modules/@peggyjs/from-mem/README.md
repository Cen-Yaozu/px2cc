# @peggyjs/from-mem

Execute some text in memory as if it was a file with a given name, so that all
of the imports/require's happen out of that directory's associated
node_modules directory or relative to where the file would have been.

This is NOT intended to be a security boundary.  In particular, all files
will be required or imported through the node module cache.

This code was originally a part of [peggy](https://peggyjs.org/), but was
refactored out when it was needed in a related project.  Several ideas in this
code came from the
[module-from-string](https://github.com/exuanbo/module-from-string) and
[eval](https://github.com/pierrec/node-eval) modules -- thanks to those authors.

## Installation

```sh
npm install @peggyjs/from-mem
```

## Usage

```js
import fromMem from "@peggyjs/from-mem"; // or require("@peggyjs/from-mem")
const consoleOutput = {};
const result = await fromMem(`
import foo from "../foo.js"; // Loads ./test/foo.js

console.log("hi");
export async function bar() {
  return await foo() + 2;
}
`, {
  filename: path.join(__dirname, "test", "fixtures", "test.js"),
  format: "es",
  consoleOutput,
  exec: `
console.log("there");
const b = await IMPORTED.bar();
return b + arg;
`;
  arg: 12,
});

// consoleOutput.out === "hi\nthere\n"
```

`filename` is the only required option, unless you are processing an ES6
module and your runtime does not have --experimental_vm_modules set.  In that
case, you must pass in an `exec` option, and may pass in an `arg` also.

Full [API docs](http://peggyjs.github.io/from-mem/) are available.

## Caveats

- This module has a strong requirement for node 20.8+ at runtime when using
  the es6 format, due to a bug that crashes node in node's vm module that got
  fixed there and in 21.0.  There is a runtime check to prevent the crash.

[![Tests](https://github.com/peggyjs/from-mem/actions/workflows/node.js.yml/badge.svg)](https://github.com/peggyjs/from-mem/actions/workflows/node.js.yml)
[![codecov](https://codecov.io/gh/peggyjs/from-mem/graph/badge.svg?token=CWQ7GSH0ZI)](https://codecov.io/gh/peggyjs/from-mem)
