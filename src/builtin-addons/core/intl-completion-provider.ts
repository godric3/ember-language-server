import * as flat from 'flat';
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';
import { CompletionItem, CompletionItemKind } from 'vscode-languageserver-types';
import { CompletionFunctionParams } from '../..';
import ASTPath from '../../glimmer-utils';
import { logDebugInfo } from '../../utils/logger';

type TranslationsHashMap = Record<string, [string, string][]>;

export default class IntlCompletionProvider {
  addToHashMap(hash: TranslationsHashMap, obj: unknown, locale: string) {
    const items: Record<string, string> = flat(obj);

    Object.keys(items).forEach((p) => {
      if (!(p in hash)) {
        hash[p] = [];
      }

      hash[p].push([locale, items[p]]);
    });
  }

  objFromFile(filePath: string): unknown {
    const ext = path.extname(filePath);

    if (ext === '.yaml') {
      return yaml.load(fs.readFileSync(filePath, 'utf8'));
    } else if (ext === '.json') {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } else if (ext === '.js') {
      try {
        return require(filePath);
      } catch (e) {
        let content = fs.readFileSync(filePath, 'utf8').replace('export ', '').replace('default ', '').trim();

        if (content.endsWith(';')) {
          content = content.slice(0, content.lastIndexOf(';'));
        }

        return eval('[' + content + ']')[0];
      }
    }
  }

  recursiveIntlTranslationsSearch(hashMap: TranslationsHashMap, startPath: string) {
    const localizations = fs.readdirSync(startPath);

    localizations.forEach((fileName) => {
      const extName = path.extname(fileName);
      const localization = path.basename(fileName, extName);
      const filePath = path.join(startPath, fileName);

      try {
        if (fs.lstatSync(filePath).isDirectory()) {
          this.recursiveIntlTranslationsSearch(hashMap, filePath);
        } else {
          const file = this.objFromFile(filePath);

          this.addToHashMap(hashMap, file, localization);
        }
      } catch (e) {
        logDebugInfo('error', e);
      }
    });
  }
  getTranslations(root: string): TranslationsHashMap {
    const hashMap = {};
    const intlEntry = path.join(root, 'translations');
    const i18nEntry = path.join(root, 'app', 'locales');

    if (fs.existsSync(intlEntry)) {
      this.recursiveIntlTranslationsSearch(hashMap, intlEntry);
    } else if (fs.existsSync(i18nEntry)) {
      const localizations = fs.readdirSync(i18nEntry);

      localizations.forEach((locale) => {
        let possibleFilePath = path.join(i18nEntry, locale, 'translations.js');

        if (!fs.existsSync(possibleFilePath)) {
          possibleFilePath = path.join(i18nEntry, locale, 'translations.json');
        }

        if (fs.existsSync(possibleFilePath)) {
          try {
            const file = this.objFromFile(possibleFilePath);

            this.addToHashMap(hashMap, file, locale);
          } catch (e) {
            logDebugInfo('error', e);
          }
        }
      });
    }

    return hashMap;
  }
  isLocalizationHelperTranslataionName(focusPath: ASTPath, type: 'script' | 'template') {
    const p = focusPath.parent;

    if (!p) {
      return false;
    }

    if (type === 'script' && focusPath.node.type === 'StringLiteral') {
      const isMemberExp = p.type === 'CallExpression' && p.callee && p.callee.type === 'MemberExpression';
      const hasValidCallee = isMemberExp && p.callee.property && p.callee.property.type === 'Identifier' && p.callee.property.name === 't';

      return hasValidCallee && p.arguments.indexOf(focusPath.node) === 0;
    }

    return (
      type === 'template' &&
      focusPath.node.type === 'StringLiteral' &&
      (p.type === 'MustacheStatement' || p.type === 'SubExpression') &&
      p.path.original === 't'
    );
  }
  async onComplete(root: string, params: CompletionFunctionParams): Promise<CompletionItem[]> {
    const { focusPath, position, results, type } = params;

    if (this.isLocalizationHelperTranslataionName(focusPath, type)) {
      const items = this.getTranslations(root);
      const PLACEHOLDER = 'ELSCompletionDummy';
      const node = focusPath.node as any;
      let indexOfPlaceholder = node.value.indexOf(PLACEHOLDER);

      if (indexOfPlaceholder === -1 && focusPath.parent && focusPath.parent.callee && focusPath.parent.callee.property) {
        // in js call
        indexOfPlaceholder = position.character - focusPath.parent.callee.property.loc.start.column - 3; // column start of `t` call + `t("` (3 symbols)
      }

      const key = node.value.slice(0, indexOfPlaceholder);
      const startPosition = {
        character: position.character - key.length,
        line: position.line,
      };

      Object.keys(items).forEach((tr) => {
        const keystr = tr + items[tr].map(([_, txt]) => txt);
        const detail = items[tr].map(([_, txt]) => `${_} : ${txt}`).join('\n');

        if (!keystr.toLowerCase().includes(key.toLowerCase())) {
          return;
        }

        const endPosition = {
          character: startPosition.character,
          line: position.line,
        };

        if (tr.includes(key)) {
          results.push({
            label: tr,
            kind: CompletionItemKind.Value,
            textEdit: {
              newText: tr,
              range: {
                start: startPosition,
                end: endPosition,
              },
            },
            detail: detail,
          });
        }

        items[tr].forEach(([lang, text]) => {
          if (!text.toLowerCase().includes(key.toLowerCase())) {
            return;
          }

          results.push({
            label: text,
            kind: CompletionItemKind.Value,
            textEdit: {
              newText: tr,
              range: {
                start: startPosition,
                end: endPosition,
              },
            },
            filterText: text + ' ' + lang,
            detail: detail,
          });
        });
      });
    }

    return results;
  }
}
