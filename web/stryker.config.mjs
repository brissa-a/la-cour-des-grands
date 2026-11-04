export default {
  testRunner: "tap",
  plugins: ["@stryker-mutator/tap-runner"],
  tap: {
    testFiles: ["src/**/*.test.ts"],
    // --test reports a test file that throws at import as "not ok" (killed, not a runtime error); --test-isolation=none keeps the tests in the process holding Stryker's coverage hook.
    nodeArgs: ["--test", "--test-isolation=none", "--test-reporter=tap", "-r", "{{hookFile}}", "{{testFile}}"],
  },
  coverageAnalysis: "perTest",
  mutate: ["src/**/*.{ts,tsx}", "!src/**/*.test.ts", "!src/**/*.d.ts"],
  // Stryker rewrites tsconfig.json in its sandbox through TypeScript's JS API, which TypeScript 7 does not ship; Node's type stripping does not read it.
  ignorePatterns: ["tsconfig.json", "dist"],
  reporters: ["clear-text", "progress", "html", "json"],
}
