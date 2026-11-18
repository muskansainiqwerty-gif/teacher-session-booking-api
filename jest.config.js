module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  testTimeout: 60000,
  transform: { "^.+\\.ts$": ["ts-jest", { tsconfig: { rootDir: ".", esModuleInterop: true, strict: true } }] },
};
