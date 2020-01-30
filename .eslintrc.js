'use strict';

module.exports = {
  root: true,
  parserOptions: {
    ecmaVersion: 2018
  },
  env: {
    es6: true
  },
  extends: [
    'sane-node'
  ],
  overrides: [
    {
      files: [
        'lib/**/*.js',
        'test/acceptance/**/*.js',
        'test/fixtures/client-error.js',
        'test/helpers/**/*.js'
      ],
      parserOptions: {
        sourceType: 'module'
      },
      rules: {
        'node/no-unsupported-features/es-syntax': 'off'
      }
    },
    {
      files: [
        'lib/**/*.js'
      ],
      rules: {
        'no-process-exit': 'off'
      }
    },
    {
      files: [
        'test/fixtures/client-error.js'
      ],
      rules: {
        'node/no-missing-import': 'off'
      }
    },
    {
      files: [
        'test/**/*-test.js'
      ],
      env: {
        mocha: true
      },
      plugins: [
        'mocha'
      ],
      extends: [
        'plugin:mocha/recommended'
      ],
      rules: {
        'mocha/no-exclusive-tests': 'error',
        'mocha/no-setup-in-describe': 'off',
        'mocha/no-sibling-hooks': 'off'
      }
    }
  ]
};
