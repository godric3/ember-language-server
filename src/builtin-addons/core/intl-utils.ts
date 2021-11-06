import * as flat from 'flat';
import * as parseJson from 'json-to-ast';
import * as path from 'path';
import * as YAML from 'yaml';
import { Location, Range } from 'vscode-languageserver-types';
import { URI } from 'vscode-uri';
import { Server } from '../..';
import { logDebugInfo } from '../../utils/logger';

type Translations = {
  locale: string;
  text: string;
  location?: Location;
};
type TranslationsHashMap = Record<string, Translations[]>;

type TranslationFile = {
  json?: unknown;
  jsonAst?: parseJson.ValueNode;
  yamlAst?: YAML.ParsedNode;
  yamlLineCounter?: YAML.LineCounter;
};

export async function getTranslations(root: string, server: Server): Promise<TranslationsHashMap> {
  const hashMap = {};
  const intlEntry = path.join(root, 'translations');

  const intlEntryExists = await server.fs.exists(intlEntry);

  if (intlEntryExists) {
    await recursiveIntlTranslationsSearch(server, hashMap, intlEntry);
  }

  return hashMap;
}

async function recursiveIntlTranslationsSearch(server: Server, hashMap: TranslationsHashMap, startPath: string) {
  const localizations = await server.fs.readDirectory(startPath);

  for (const [fileName] of localizations) {
    const extName = path.extname(fileName);
    const localization = path.basename(fileName, extName);
    const filePath = path.join(startPath, fileName);

    try {
      const fileStats = await server.fs.stat(filePath);

      if (fileStats.isDirectory()) {
        await recursiveIntlTranslationsSearch(server, hashMap, filePath);
      } else {
        const translationFile = await objFromFile(server, filePath);

        if (!translationFile.json) {
          return;
        }

        addToHashMap(hashMap, translationFile, localization, filePath);
      }
    } catch (e) {
      logDebugInfo('error', e);
    }
  }
}

async function objFromFile(server: Server, filePath: string): Promise<TranslationFile> {
  const ext = path.extname(filePath);

  if (ext === '.yaml') {
    const content = await server.fs.readFile(filePath);

    if (content == null) {
      return {};
    }

    const lineCounter = new YAML.LineCounter();
    const ast = YAML.parseDocument(content, { lineCounter }).contents;

    return { json: YAML.parse(content), yamlAst: ast as YAML.ParsedNode, yamlLineCounter: lineCounter };
  } else if (ext === '.json') {
    const content = await server.fs.readFile(filePath);

    if (content == null) {
      return {};
    }

    const ast = parseJson(content);

    return { json: JSON.parse(content), jsonAst: ast };
  }

  return {};
}

function addToHashMap(hash: TranslationsHashMap, translationFile: TranslationFile, locale: string, filePath: string) {
  const items: Record<string, string> = flat(translationFile.json);
  const extension = path.extname(filePath);

  Object.keys(items).forEach((p) => {
    if (!(p in hash)) {
      hash[p] = [];
    }

    const uri = URI.file(filePath).toString();

    const keys = p.split('.');
    let keypos = 0;
    let position;

    function traverseJsonAst(node: parseJson.ValueNode): parseJson.Location | undefined {
      if (node.type === 'Object') {
        for (let i = 0; i < node.children.length; i++) {
          const prop = node.children[i];

          if (keys[keypos] === prop.key.value) {
            keypos++;

            if (keypos == keys.length) {
              return prop.loc;
            }

            return traverseJsonAst(prop.value);
          }
        }
      }
    }

    function traverseYamlAst(node: YAML.YAMLMap<YAML.Scalar, YAML.Scalar | YAML.YAMLMap>): { start?: number; end?: number } | void {
      for (let i = 0; i < node.items.length; i++) {
        const item: YAML.Pair<YAML.Scalar, YAML.Scalar | YAML.YAMLMap> = node.items[i];

        if (keys[keypos] === item.key.value) {
          keypos++;

          if (keypos == keys.length) {
            return { start: item.key.range?.[0], end: item.value?.range?.[1] };
          }

          return traverseYamlAst(item.value as YAML.YAMLMap<YAML.Scalar, YAML.Scalar | YAML.YAMLMap>);
        }
      }
    }

    if (extension === '.json' && translationFile.jsonAst) {
      position = traverseJsonAst(translationFile.jsonAst);
    } else if (extension === '.yaml' && translationFile.yamlAst) {
      const yamlPosition = traverseYamlAst(translationFile.yamlAst as YAML.YAMLMap<YAML.Scalar, YAML.Scalar | YAML.YAMLMap>);

      if (yamlPosition && yamlPosition.start != null && yamlPosition.end != null) {
        const startPos = translationFile.yamlLineCounter?.linePos(yamlPosition.start);
        const endPos = translationFile.yamlLineCounter?.linePos(yamlPosition.end);

        if (startPos && endPos) {
          position = { start: { line: startPos.line, column: startPos.col }, end: { line: endPos.line, column: endPos.col } };
        }
      }
    }

    const startLine = position ? position.start.line - 1 : 0;
    const endLine = position ? position.end.line - 1 : 0;
    const startColumn = position ? position.start.column - 1 : 0;
    const endColumn = position ? position.end.column - 1 : 0;
    const range = Range.create(startLine, startColumn, endLine, endColumn);

    hash[p].push({ locale, text: items[p], location: Location.create(uri, range) });
  });
}
