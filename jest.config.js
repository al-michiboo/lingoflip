module.exports = {
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['**/tests/**/*.js'],
  testPathIgnorePatterns: ['/workspace/language-reactor-ext/node_modules/'],
  modulePathIgnorePatterns: ['<rootDir>/node_modules/'],
};
