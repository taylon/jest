/**
 * Copyright (c) 2014-present, Facebook, Inc. All rights reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

'use strict';

import chalk from 'chalk';
import TestWatcher from '../test_watcher';
import {KEYS} from '../constants';

const runJestMock = jest.fn();

const watchPluginPath = `${__dirname}/__fixtures__/watch_plugin`;
const watchPlugin2Path = `${__dirname}/__fixtures__/watch_plugin2`;

jest.doMock('chalk', () => new chalk.constructor({enabled: false}));
jest.doMock(
  '../run_jest',
  () =>
    function() {
      const args = Array.from(arguments);
      const [{onComplete}] = args;
      runJestMock.apply(null, args);

      // Call the callback
      onComplete({snapshot: {}});

      return Promise.resolve();
    },
);

jest.doMock(
  watchPluginPath,
  () => ({
    enter: jest.fn(),
    key: 's'.codePointAt(0),
    prompt: 'do nothing',
  }),
  {virtual: true},
);

jest.doMock(
  watchPlugin2Path,
  () => ({
    enter: jest.fn(),
    key: 'u'.codePointAt(0),
    prompt: 'do something else',
  }),
  {virtual: true},
);

const watch = require('../watch').default;
afterEach(runJestMock.mockReset);

describe('Watch mode flows', () => {
  let pipe;
  let hasteMapInstances;
  let globalConfig;
  let contexts;
  let stdin;

  beforeEach(() => {
    const config = {roots: [], testPathIgnorePatterns: [], testRegex: ''};
    pipe = {write: jest.fn()};
    globalConfig = {watch: true};
    hasteMapInstances = [{on: () => {}}];
    contexts = [{config}];
    stdin = new MockStdin();
  });

  it('Correctly passing test path pattern', () => {
    globalConfig.testPathPattern = 'test-*';

    watch(globalConfig, contexts, pipe, hasteMapInstances, stdin);

    expect(runJestMock.mock.calls[0][0]).toMatchObject({
      contexts,
      globalConfig,
      onComplete: expect.any(Function),
      outputStream: pipe,
      testWatcher: new TestWatcher({isWatchMode: true}),
    });
  });

  it('Correctly passing test name pattern', () => {
    globalConfig.testNamePattern = 'test-*';

    watch(globalConfig, contexts, pipe, hasteMapInstances, stdin);

    expect(runJestMock.mock.calls[0][0]).toMatchObject({
      contexts,
      globalConfig,
      onComplete: expect.any(Function),
      outputStream: pipe,
      testWatcher: new TestWatcher({isWatchMode: true}),
    });
  });

  it('Runs Jest once by default and shows usage', () => {
    // jest.resetModules();
    // jest.doMock('is-ci', () => false);
    jest.unmock('jest-util');
    const util = require('jest-util');
    util.isInteractive = true;

    const ci_watch = require('../watch').default;
    ci_watch(globalConfig, contexts, pipe, hasteMapInstances, stdin);
    expect(runJestMock.mock.calls[0][0]).toMatchObject({
      contexts,
      globalConfig,
      onComplete: expect.any(Function),
      outputStream: pipe,
      testWatcher: new TestWatcher({isWatchMode: true}),
    });
    expect(pipe.write.mock.calls.reverse()[0]).toMatchSnapshot();
  });

  it('Runs Jest in a non-interactive environment not showing usage', () => {
    // jest.resetModules();
    // jest.doMock('is-ci', () => true);
    jest.unmock('jest-util');
    const util = require('jest-util');
    util.isInteractive = false;

    const ci_watch = require('../watch').default;
    ci_watch(globalConfig, contexts, pipe, hasteMapInstances, stdin);
    expect(runJestMock.mock.calls[0][0]).toMatchObject({
      contexts,
      globalConfig,
      onComplete: expect.any(Function),
      outputStream: pipe,
      testWatcher: new TestWatcher({isWatchMode: true}),
    });
    expect(pipe.write.mock.calls.reverse()[0]).toMatchSnapshot();
  });

  it('resolves relative to the package root', () => {
    expect(async () => {
      await watch(
        Object.assign({}, globalConfig, {
          rootDir: __dirname,
          watchPlugins: [watchPluginPath],
        }),
        contexts,
        pipe,
        hasteMapInstances,
        stdin,
      );
    }).not.toThrow();
  });

  it('shows prompts for WatchPlugins in alphabetical order', async () => {
    // jest.resetModules();
    // jest.doMock('is-ci', () => false);
    jest.unmock('jest-util');
    const util = require('jest-util');
    util.isInteractive = true;

    const ci_watch = require('../watch').default;
    ci_watch(
      Object.assign({}, globalConfig, {
        rootDir: __dirname,
        watchPlugins: [watchPlugin2Path, watchPluginPath],
      }),
      contexts,
      pipe,
      hasteMapInstances,
      stdin,
    );

    const pipeMockCalls = pipe.write.mock.calls;

    const determiningTestsToRun = pipeMockCalls.findIndex(
      ([c]) => c === 'Determining test suites to run...',
    );

    expect(pipeMockCalls.slice(determiningTestsToRun + 1)).toMatchSnapshot();
  });

  it('triggers enter on a WatchPlugin when its key is pressed', () => {
    const plugin = require(watchPluginPath);

    watch(
      Object.assign({}, globalConfig, {
        rootDir: __dirname,
        watchPlugins: [watchPluginPath],
      }),
      contexts,
      pipe,
      hasteMapInstances,
      stdin,
    );

    stdin.emit(plugin.key.toString(16));

    expect(plugin.enter).toHaveBeenCalled();
  });

  it('prevents Jest from handling keys when active and returns control when end is called', () => {
    const plugin = require(watchPluginPath);
    const plugin2 = require(watchPlugin2Path);

    let pluginEnd;
    plugin.enter = jest.fn((globalConfig, end) => (pluginEnd = end));

    watch(
      Object.assign({}, globalConfig, {
        rootDir: __dirname,
        watchPlugins: [watchPluginPath, watchPlugin2Path],
      }),
      contexts,
      pipe,
      hasteMapInstances,
      stdin,
    );

    stdin.emit(plugin.key.toString(16));
    expect(plugin.enter).toHaveBeenCalled();
    stdin.emit(plugin2.key.toString(16));
    expect(plugin2.enter).not.toHaveBeenCalled();
    pluginEnd();
    stdin.emit(plugin2.key.toString(16));
    expect(plugin2.enter).toHaveBeenCalled();
  });

  it('Pressing "o" runs test in "only changed files" mode', () => {
    watch(globalConfig, contexts, pipe, hasteMapInstances, stdin);
    runJestMock.mockReset();

    stdin.emit(KEYS.O);

    expect(runJestMock).toBeCalled();
    expect(runJestMock.mock.calls[0][0].globalConfig).toMatchObject({
      onlyChanged: true,
      watch: true,
      watchAll: false,
    });
  });

  it('Pressing "a" runs test in "watch all" mode', () => {
    watch(globalConfig, contexts, pipe, hasteMapInstances, stdin);
    runJestMock.mockReset();

    stdin.emit(KEYS.A);

    expect(runJestMock).toBeCalled();
    expect(runJestMock.mock.calls[0][0].globalConfig).toMatchObject({
      onlyChanged: false,
      watch: false,
      watchAll: true,
    });
  });

  it('Pressing "ENTER" reruns the tests', () => {
    watch(globalConfig, contexts, pipe, hasteMapInstances, stdin);
    expect(runJestMock).toHaveBeenCalledTimes(1);
    stdin.emit(KEYS.ENTER);
    expect(runJestMock).toHaveBeenCalledTimes(2);
  });

  it('Pressing "u" reruns the tests in "update snapshot" mode', () => {
    watch(globalConfig, contexts, pipe, hasteMapInstances, stdin);
    runJestMock.mockReset();

    stdin.emit(KEYS.U);

    expect(runJestMock.mock.calls[0][0].globalConfig).toMatchObject({
      updateSnapshot: 'all',
      watch: true,
    });

    stdin.emit(KEYS.A);
    // updateSnapshot is not sticky after a run.
    expect(runJestMock.mock.calls[1][0].globalConfig).toMatchObject({
      updateSnapshot: 'none',
      watch: false,
    });
  });
  it('passWithNoTest should be set to true in watch mode', () => {
    globalConfig.passWithNoTests = false;
    watch(globalConfig, contexts, pipe, hasteMapInstances, stdin);
    globalConfig.passWithNoTests = true;
    expect(runJestMock.mock.calls[0][0]).toMatchObject({
      globalConfig,
    });
  });
});

class MockStdin {
  constructor() {
    this._callbacks = [];
  }

  setRawMode() {}

  resume() {}

  setEncoding() {}

  on(evt, callback) {
    this._callbacks.push(callback);
  }

  emit(key) {
    this._callbacks.forEach(cb => cb(key));
  }
}
