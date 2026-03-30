module.exports = {
  ...require("./jest.config"),
  testMatch: ["**/integration/**/*.test.ts"],
  globalSetup: "<rootDir>/test/integration/setup.ts",
  globalTeardown: "<rootDir>/test/integration/teardown.ts",
};
