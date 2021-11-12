import { Hover, HoverParams } from 'vscode-languageserver/node';
import Server from '../server';
import { queryELSAddonsAPIChain } from './../utils/addon-api';

export class HoverProvider {
  constructor(private server: Server) {}
  async provideHover({ textDocument, position }: HoverParams): Promise<Hover | null> {
    const project = this.server.projectRoots.projectForUri(textDocument.uri);

    if (!project) {
      return null;
    }

    const internalResults = await queryELSAddonsAPIChain(project.builtinProviders.hoverProviders, project.root, {
      textDocument,
      position,
      results: [],
      server: this.server,
    });

    const addonResults = await queryELSAddonsAPIChain(project.providers.hoverProviders, project.root, {
      textDocument,
      position,
      results: internalResults,
      server: this.server,
    });

    if (addonResults.length) {
      return addonResults[0];
    }

    return null;
  }
}
