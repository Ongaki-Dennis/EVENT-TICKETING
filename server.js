try {
  const compiled = require("./dist/src/server.js");
  module.exports = compiled.default || compiled;
} catch (error) {
  require("tsx/cjs");
  const source = require("./src/server.ts");
  module.exports = source.default || source;
}
