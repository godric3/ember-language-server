'use strict';

import * as path from 'path';
import { uriToFilePath } from 'vscode-languageserver/lib/files';
import { logError, logInfo } from './utils/logger';
import * as walkSync from 'walk-sync';
import {
  isGlimmerNativeProject,
  isGlimmerXProject,
  getPodModulePrefix,
  addToRegistry,
  removeFromRegistry,
  normalizeRoutePath,
  REGISTRY_KIND
} from './utils/layout-helpers';
import { ProjectProviders, collectProjectProviders, initBuiltinProviders } from './utils/addon-api';
import Server from './server';
import { TextDocument, Diagnostic, FileChangeType } from 'vscode-languageserver';
import { PodMatcher, ClassicPathMatcher } from './utils/path-matcher';
export type Eexcutor = (server: Server, command: string, args: any[]) => any;
export type Linter = (document: TextDocument) => Diagnostic[];
export type Watcher = (uri: string, change: FileChangeType) => any;
export interface Executors {
  [key: string]: Eexcutor;
}

export class Project {
  private classicMatcher!: ClassicPathMatcher;
  private podMatcher!: PodMatcher;
  providers!: ProjectProviders;
  builtinProviders!: ProjectProviders;
  executors: Executors = {};
  watchers: Watcher[] = [];
  linters: Linter[] = [];
  files: Map<string, { version: number }> = new Map();
  podModulePrefix: string = '';
  matchPathToType(filePath: string) {
    return this.classicMatcher.metaFromPath(filePath) || this.podMatcher.metaFromPath(filePath);
  }
  trackChange(uri: string, change: FileChangeType) {
    // prevent leaks
    if (this.files.size > 10000) {
      logError('too many files for project ' + this.root);
      this.files.clear();
    }
    const rawPath = uriToFilePath(uri);
    if (!rawPath) {
      return;
    }
    const filePath = path.resolve(rawPath);
    const item = this.matchPathToType(filePath);
    if (item) {
      if (['template', 'controller', 'route'].includes(item.type)) {
        item.type = 'routePath';
        item.name = normalizeRoutePath(item.name);
      }
    }
    if (change === 3) {
      this.files.delete(filePath);
      if (item) {
        removeFromRegistry(item.name, item.type as REGISTRY_KIND, [filePath]);
      }
    } else {
      if (item) {
        addToRegistry(item.name, item.type as REGISTRY_KIND, [filePath]);
      }
      if (!this.files.has(filePath)) {
        this.files.set(filePath, { version: 0 });
      }
      let file = this.files.get(filePath);
      if (file) {
        file.version++;
      }
    }
    this.watchers.forEach((cb) => cb(uri, change));
  }
  addCommandExecutor(key: string, cb: Eexcutor) {
    this.executors[key] = cb;
  }
  addLinter(cb: Linter) {
    this.linters.push(cb);
  }
  addWatcher(cb: Watcher) {
    this.watchers.push(cb);
  }
  constructor(public readonly root: string) {
    this.providers = collectProjectProviders(root);
    this.builtinProviders = initBuiltinProviders();
    const maybePrefix = getPodModulePrefix(root);
    if (maybePrefix) {
      this.podModulePrefix = maybePrefix;
    }
    this.classicMatcher = new ClassicPathMatcher();
    this.podMatcher = new PodMatcher();
  }
  init(server: Server) {
    this.builtinProviders.initFunctions.forEach((initFn) => initFn(server, this));
    this.providers.initFunctions.forEach((initFn) => initFn(server, this));
    if (this.providers.info.length) {
      logInfo('--------------------');
      logInfo('loded language server addons:');
      this.providers.info.forEach((addonName) => {
        logInfo('    ' + addonName);
      });
      logInfo('--------------------');
    }
  }
}

export default class ProjectRoots {
  constructor(private server: Server) {}
  workspaceRoot: string;

  projects = new Map<string, Project>();

  findProjectsInsideRoot(workspaceRoot: string) {
    const roots = walkSync(workspaceRoot, {
      directories: false,
      globs: ['**/ember-cli-build.js', '**/package.json'],
      ignore: ['**/.git/**', '**/bower_components/**', '**/dist/**', '**/node_modules/**', '**/tmp/**']
    });

    roots.forEach((rootPath: string) => {
      const filePath = path.join(workspaceRoot, rootPath);
      const fullPath = path.dirname(filePath);
      if (filePath.endsWith('package.json')) {
        try {
          if (isGlimmerNativeProject(fullPath) || isGlimmerXProject(fullPath)) {
            this.onProjectAdd(fullPath);
          }
        } catch (e) {
          logError(e);
        }
      } else {
        this.onProjectAdd(fullPath);
      }
    });
  }

  async initialize(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;

    this.findProjectsInsideRoot(this.workspaceRoot);
  }

  onProjectAdd(path: string) {
    if (this.projects.has(path)) {
      return;
    }
    try {
      const project = new Project(path);
      this.projects.set(path, project);
      logInfo(`Ember CLI project added at ${path}`);
      project.init(this.server);
    } catch (e) {
      logError(e);
    }
  }

  projectForUri(uri: string): Project | undefined {
    let path = uriToFilePath(uri);

    if (!path) return;
    return this.projectForPath(path);
  }

  projectForPath(path: string): Project | undefined {
    let root = (Array.from(this.projects.keys()) || []).filter((root) => path!.indexOf(root) === 0).reduce((a, b) => (a.length > b.length ? a : b), '');
    return this.projects.get(root);
  }
}
