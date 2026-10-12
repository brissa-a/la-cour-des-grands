export default {
  testRunner: "tap",
  plugins: ["@stryker-mutator/tap-runner"],
  tap: {
    testFiles: ["src/**/*.test.ts"],
    nodeArgs: ["--test", "--test-isolation=none", "--test-reporter=tap", "-r", "{{hookFile}}", "{{testFile}}"],
  },
  coverageAnalysis: "perTest",
  mutate: ["src/**/*.ts", "!src/**/*.test.ts", "!src/main.ts", "!src/renderer.ts"],
  // The service imports ../web/src, which a sandbox holding og/ alone cannot reach: run it in place, on a scratch copy of web/ and og/.
  inPlace: true,
  ignorePatterns: ["tsconfig.json", "cache"],
  reporters: ["clear-text", "progress", "json"],
}
