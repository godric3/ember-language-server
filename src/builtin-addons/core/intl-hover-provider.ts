import { preprocess } from '@glimmer/syntax';
import { parseScriptFile } from 'ember-meta-explorer';
import { Hover } from 'vscode-languageserver';
import { Server } from '../..';
import { toPosition } from '../../estree-utils';
import ASTPath, { nodeLoc } from '../../glimmer-utils';
import { HoverFunctionParams } from '../../utils/addon-api';
import { isLocalizationHelperTranslataionName } from '../../utils/ast-helpers';
import { isScriptPath, isTemplatePath } from '../../utils/layout-helpers';
import { logDebugInfo } from '../../utils/logger';
import { getTranslations } from './intl-utils';

export default class IntlHoverProvider {
  server: Server;
  onInit(server: Server) {
    this.server = server;
  }

  async onHover(root: string, params: HoverFunctionParams): Promise<Hover[]> {
    const { textDocument, results, position } = params;

    const document = this.server.documents.get(textDocument.uri);
    const content = document?.getText();

    if (!content) {
      return results;
    }

    let ast = null;
    let filetype: 'script' | 'template';

    try {
      if (isScriptPath(textDocument.uri)) {
        ast = parseScriptFile(content);
        filetype = 'script';
      } else if (isTemplatePath(textDocument.uri)) {
        ast = preprocess(content);
        filetype = 'template';
      } else {
        return results;
      }
    } catch (e) {
      logDebugInfo('error', e);

      return results;
    }

    const focusPath: ASTPath = ASTPath.toPosition(ast, toPosition(position), content) as any;

    if (isLocalizationHelperTranslataionName(focusPath, filetype)) {
      const node = focusPath.node as any;
      const key = node.value;
      const translations = await getTranslations(root, this.server);
      const location = nodeLoc(node);

      Object.keys(translations).forEach((tr) => {
        if (tr === key) {
          const detail = translations[tr].map((t) => `${t.locale} : ${t.text}`).join('\n');

          results.push({
            contents: { kind: 'plaintext', value: detail },
            range: {
              start: { line: location.start.line - 1, character: location.start.column },
              end: { line: location.end.line - 1, character: location.end.column },
            },
          });
        }
      });
    }

    return results;
  }
}
