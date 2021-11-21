import { Definition, Location } from 'vscode-languageserver';
import { DefinitionFunctionParams, Server } from '../..';
import { isLocalizationHelperTranslataionName } from '../../utils/ast-helpers';
import { getTranslations2 } from '../../utils/intl-utils';

export default class IntlDefinitionProvider {
  server: Server;

  async onInit(server: Server) {
    this.server = server;
  }

  async onDefinition(root: string, params: DefinitionFunctionParams): Promise<Definition[]> {
    const { focusPath, type, results } = params;

    if (isLocalizationHelperTranslataionName(focusPath, type)) {
      const items = getTranslations2();
      const node = focusPath.node as any;
      const key = node.value;

      Object.keys(items)
        .filter((k) => k === key)
        .forEach((tr) => {
          items[tr].locales.forEach((locale) => {
            results.push(Location.create(locale.file, locale.range));
          });
        });
    }

    return results;
  }
}
