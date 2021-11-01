import { Definition } from 'vscode-languageserver-types';
import { DefinitionFunctionParams, Server } from '../..';
import { isLocalizationHelperTranslataionName } from '../../utils/ast-helpers';
import { getTranslations } from './intl-utils';

export default class IntlDefinitionProvider {
  server: Server;

  async onInit(server: Server) {
    this.server = server;
  }

  async onDefinition(root: string, params: DefinitionFunctionParams): Promise<Definition | null> {
    const { focusPath, type, results, position } = params;

    if (isLocalizationHelperTranslataionName(focusPath, type)) {
      const items = await getTranslations(root, this.server);
      const PLACEHOLDER = 'ELSCompletionDummy';
      const node = focusPath.node as any;
      let indexOfPlaceholder = node.value.indexOf(PLACEHOLDER);

      if (indexOfPlaceholder === -1 && focusPath.parent && focusPath.parent.callee && focusPath.parent.callee.property) {
        indexOfPlaceholder = position.character - focusPath.parent.callee.property.loc.start.column - 3; // column start of `t` call + `t("` (3 symbols)
      }

      const key = node.value.slice(0, indexOfPlaceholder);

      Object.keys(items).forEach((tr) => {
        const keystr = tr + items[tr].map((t) => t.text);

        if (!keystr.toLowerCase().includes(key.toLowerCase())) {
          return;
        }

        if (tr.includes(key)) {
          items[tr].forEach((t) => {
            if (t.location) {
              results.push(t.location);
            }
          });
        }
      });
    }

    return results;
  }
}
