import * as path from 'path';
import * as t from '@babel/types';
import { Definition, Location } from 'vscode-languageserver/node';
import { DefinitionFunctionParams } from './../../utils/addon-api';
import { pathsToLocations, getAddonPathsForType, getAddonImport } from '../../utils/definition-helpers';
import {
  isRouteLookup,
  isTransformReference,
  isModelReference,
  isImportPathDeclaration,
  isServiceInjection,
  isNamedServiceInjection,
  isTemplateElement,
  isImportSpecifier,
} from './../../utils/ast-helpers';
import { normalizeServiceName } from '../../utils/normalizers';
import { asyncFilter, podModulePrefixForRoot } from './../../utils/layout-helpers';
import { provideRouteDefinition } from './template-definition-provider';
import { logInfo } from '../../utils/logger';
import { Project } from '../../project';
import Server from '../../server';
import { IRegistry } from '../../utils/registry-api';

type ItemType = 'Model' | 'Transform' | 'Service';

// barking on 'LayoutCollectorFn' is defined but never used  @typescript-eslint/no-unused-vars
// eslint-disable-line
type LayoutCollectorFn = (root: string, itemName: string, podModulePrefix?: string) => string[];
type AsyncLayoutCollectorFn = (root: string, itemName: string, podModulePrefix?: string) => Promise<string[]>;

function joinPaths(...args: string[]) {
  return ['.ts', '.js'].map((extName: string) => {
    const localArgs = args.slice(0);
    const lastArg = localArgs.pop() + extName;

    return path.join.apply(path, [...localArgs, lastArg]);
  });
}

class PathResolvers {
  [key: string]: LayoutCollectorFn | AsyncLayoutCollectorFn;
  muModelPaths(root: string, modelName: string) {
    return joinPaths(root, 'src', 'data', 'models', modelName, 'model');
  }
  muTransformPaths(root: string, transformName: string) {
    return joinPaths(root, 'src', 'data', 'transforms', transformName);
  }
  muServicePaths(root: string, transformName: string) {
    return joinPaths(root, 'src', 'services', transformName);
  }
  classicModelPaths(root: string, modelName: string) {
    return joinPaths(root, 'app', 'models', modelName);
  }
  classicTransformPaths(root: string, transformName: string) {
    return joinPaths(root, 'app', 'transforms', transformName);
  }
  classicServicePaths(root: string, modelName: string) {
    return joinPaths(root, 'app', 'services', modelName);
  }
  podTransformPaths(root: string, transformName: string, podPrefix: string) {
    return joinPaths(root, 'app', podPrefix, transformName, 'transform');
  }
  podModelPaths(root: string, modelName: string, podPrefix: string) {
    return joinPaths(root, 'app', podPrefix, modelName, 'model');
  }
  podServicePaths(root: string, modelName: string, podPrefix: string) {
    return joinPaths(root, 'app', podPrefix, modelName, 'service');
  }
  async addonServicePaths(root: string, serviceName: string): Promise<string[]> {
    return await getAddonPathsForType(root, 'services', serviceName);
  }
  async addonImportPaths(root: string, pathName: string) {
    return await getAddonImport(root, pathName);
  }
  classicImportPaths(root: string, pathName: string) {
    const pathParts = pathName.split('/');

    pathParts.shift();
    const appParams = [root, 'app', ...pathParts];

    return joinPaths(...appParams);
  }

  resolveTestScopeImport(root: string, pathName: string) {
    return joinPaths(path.join(root, pathName));
  }

  muImportPaths(root: string, pathName: string) {
    const pathParts = pathName.split('/');

    pathParts.shift();
    const params = [root, ...pathParts];

    return joinPaths(...params);
  }
}

export default class CoreScriptDefinitionProvider {
  private resolvers!: PathResolvers;
  constructor() {
    this.resolvers = new PathResolvers();
  }
  get registry(): IRegistry {
    return this.project.registry;
  }
  server!: Server;
  project!: Project;
  async onInit(server: Server, project: Project) {
    this.server = server;
    this.project = project;
  }
  async guessPathForImport(root: string, uri: string, importPath: string) {
    if (!uri) {
      return null;
    }

    const guessedPaths: string[] = [];
    const fnName = 'Import';

    (await this.resolvers[`classic${fnName}Paths`](root, importPath)).forEach((pathLocation: string) => {
      guessedPaths.push(pathLocation);
    });

    const addonImports = await this.resolvers.addonImportPaths(root, importPath);

    addonImports.forEach((pathLocation: string) => {
      guessedPaths.push(pathLocation);
    });

    const existingPaths = await asyncFilter(guessedPaths, this.server.fs.exists);

    return pathsToLocations(...existingPaths);
  }
  async guessPathsForType(root: string, fnName: ItemType, typeName: string) {
    const guessedPaths: string[] = [];

    (await this.resolvers[`classic${fnName}Paths`](root, typeName)).forEach((pathLocation: string) => {
      guessedPaths.push(pathLocation);
    });
    const podPrefix = podModulePrefixForRoot(root);

    if (podPrefix) {
      (await this.resolvers[`pod${fnName}Paths`](root, typeName, podPrefix)).forEach((pathLocation: string) => {
        guessedPaths.push(pathLocation);
      });
    }

    if (fnName === 'Service') {
      const paths = await this.resolvers.addonServicePaths(root, typeName);

      paths.forEach((item: string) => {
        guessedPaths.push(item);
      });
    }

    const existingPaths = await asyncFilter(guessedPaths, this.server.fs.exists);

    return pathsToLocations(...existingPaths);
  }
  async onDefinition(root: string, params: DefinitionFunctionParams): Promise<Definition | null> {
    const { textDocument, focusPath, type, results, server, position } = params;

    if (type !== 'script') {
      return results;
    }

    const uri = textDocument.uri;
    let definitions: Location[] = results;
    const astPath = focusPath;

    const project = server.projectRoots.projectForUri(uri);

    if (!project) {
      return results;
    }

    if (isTemplateElement(astPath)) {
      const templateResults = await server.definitionProvider.template.handle(
        {
          textDocument,
          position,
        },
        project
      );

      if (Array.isArray(templateResults)) {
        definitions = templateResults;
      }
    } else if (isModelReference(astPath)) {
      const modelName = ((astPath.node as unknown) as t.StringLiteral).value;

      definitions = await this.guessPathsForType(root, 'Model', modelName);
    } else if (isTransformReference(astPath)) {
      const transformName = ((astPath.node as unknown) as t.StringLiteral).value;

      definitions = await this.guessPathsForType(root, 'Transform', transformName);
    } else if (isImportPathDeclaration(astPath)) {
      definitions = (await this.guessPathForImport(root, uri, ((astPath.node as unknown) as t.StringLiteral).value)) || [];
    } else if (isImportSpecifier(astPath)) {
      logInfo(`Handle script import for Project "${project.name}"`);
      const pathName: string = ((astPath.parentFromLevel(2) as unknown) as t.ImportDeclaration).source.value;
      const pathParts = pathName.split('/');
      let maybeAppName = pathParts.shift();

      if (maybeAppName && maybeAppName.startsWith('@')) {
        maybeAppName = maybeAppName + '/' + pathParts.shift();
      }

      let potentialPaths: Location[];
      const addonInfo = project.addonsMeta.find(({ name }) => pathName.startsWith(name + '/tests'));

      // If the start of the pathname is same as the project name, then use that as the root.
      if (project.name === maybeAppName && pathName.startsWith(project.name + '/tests')) {
        const importPaths = this.resolvers.resolveTestScopeImport(project.root, pathParts.join(path.sep));
        const existingPaths = await asyncFilter(importPaths, this.server.fs.exists);

        potentialPaths = pathsToLocations(...existingPaths);
      } else if (addonInfo) {
        const importPaths = this.resolvers.resolveTestScopeImport(addonInfo.root, pathName);
        const existingPaths = await asyncFilter(importPaths, this.server.fs.exists);

        potentialPaths = pathsToLocations(...existingPaths);
      } else {
        potentialPaths = (await this.guessPathForImport(project.root, uri, pathName)) || [];
      }

      definitions = definitions.concat(potentialPaths);
    } else if (isServiceInjection(astPath)) {
      let serviceName = ((astPath.node as unknown) as t.Identifier).name;
      const args = astPath.parent.value.arguments;

      if (args.length && args[0].type === 'StringLiteral') {
        serviceName = args[0].value;
      }

      definitions = await this.guessPathsForType(root, 'Service', normalizeServiceName(serviceName));
    } else if (isNamedServiceInjection(astPath)) {
      const serviceName = ((astPath.node as unknown) as t.StringLiteral).value;

      definitions = await this.guessPathsForType(root, 'Service', normalizeServiceName(serviceName));
    } else if (isRouteLookup(astPath)) {
      const routePath = ((astPath.node as unknown) as t.StringLiteral).value;

      definitions = await provideRouteDefinition(this.registry, routePath, this.server.fs);
    }

    return definitions || [];
  }
}
