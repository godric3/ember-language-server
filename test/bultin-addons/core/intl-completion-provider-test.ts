import * as cp from 'child_process';
import * as path from 'path';
import { Readable, Writable } from 'stream';
import { createMessageConnection, Disposable, Logger, MessageConnection } from 'vscode-jsonrpc';
import { StreamMessageReader, StreamMessageWriter } from 'vscode-jsonrpc/node';
import { Project, Server } from '../../../src';
import IntlCompletionProvider from '../../../src/builtin-addons/core/intl-completion-provider';
import { fsProvider } from '../../../src/fs-provider';
import { asyncFSProvider, registerCommandExecutor, startServer } from '../../test_helpers/integration-helpers';

const testCaseAsyncFsOptions = [false, true];

for (const asyncFsEnabled of testCaseAsyncFsOptions) {
  describe(`Intl - async fs enabled: ${asyncFsEnabled.toString()}`, function () {
    let connection: MessageConnection;
    let serverProcess: cp.ChildProcess;
    let asyncFSProviderInstance!: any;
    const disposables: Disposable[] = [];

    beforeAll(async () => {
      serverProcess = startServer(asyncFsEnabled);
      connection = createMessageConnection(
        new StreamMessageReader(serverProcess.stdout as Readable),
        new StreamMessageWriter(serverProcess.stdin as Writable),
        <Logger>{
          error(msg) {
            console.log('error', msg);
          },
          log(msg) {
            console.log('log', msg);
          },
          info(msg) {
            console.log('info', msg);
          },
          warn(msg) {
            console.log('warn', msg);
          },
        }
      );
      connection.listen();

      if (asyncFsEnabled) {
        asyncFSProviderInstance = asyncFSProvider();
        disposables.push(await registerCommandExecutor(connection, asyncFSProviderInstance));
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    });

    afterAll(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1000));

      for (const item of disposables) {
        await item.dispose();
      }

      if (asyncFsEnabled) {
        asyncFSProviderInstance = null;
      }

      await connection.dispose();
      await serverProcess.kill();
    });

    describe('empty autocomplete', () => {
      let intlCompletionProvider: IntlCompletionProvider;

      beforeEach(() => {
        intlCompletionProvider = new IntlCompletionProvider();
        const server = {
          fs: fsProvider(),
        };
        const project = {
          addonsMeta: [],
        };

        intlCompletionProvider.onInit(server as Server, (project as unknown) as Project);
      });

      it('should not autocomplete if no data', async () => {
        expect(
          await intlCompletionProvider.onComplete('', {
            results: [],
            type: 'template',
            position: {
              character: 1,
              line: 1,
            },
            focusPath: {
              node: {
                type: 'StringLiteral',
                value: '',
              },
              parent: {
                type: 'MustacheStatement',
                path: {
                  original: 't',
                },
              },
            },
          } as any)
        ).toEqual([]);
      });

      it('should not autocomplete if `els-intl-addon` installed', async () => {
        const server = {
          fs: fsProvider(),
        };
        const project = {
          addonsMeta: [{ name: 'els-intl-addon' }],
        };

        intlCompletionProvider.onInit(server as Server, (project as unknown) as Project);
        expect(
          await intlCompletionProvider.onComplete(path.join(__dirname, '../../../test/fixtures'), {
            results: [],
            type: 'template',
            position: {
              character: 19,
              line: 1,
            },
            focusPath: {
              node: {
                type: 'StringLiteral',
                value: 'rootFileTranslaELSCompletionDummy',
              },
              parent: {
                type: 'MustacheStatement',
                path: {
                  original: 't',
                },
              },
            },
          } as any)
        ).toEqual([]);
      });
    });

    describe('provide completion', () => {
      let intlCompletionProvider: IntlCompletionProvider;

      beforeEach(() => {
        intlCompletionProvider = new IntlCompletionProvider();
        const server = {
          fs: fsProvider(),
        };

        const project = {
          addonsMeta: [],
        };

        intlCompletionProvider.onInit(server as Server, (project as unknown) as Project);
      });

      it('should autocomplete root translation in handlebars', async () => {
        expect(
          await intlCompletionProvider.onComplete(path.join(__dirname, '../../../test/fixtures'), {
            results: [],
            type: 'template',
            position: {
              character: 19,
              line: 1,
            },
            focusPath: {
              node: {
                type: 'StringLiteral',
                value: 'rootFileTranslaELSCompletionDummy',
              },
              parent: {
                type: 'MustacheStatement',
                path: {
                  original: 't',
                },
              },
            },
          } as any)
        ).toEqual([
          {
            detail: 'en-us : text 1',
            kind: 12,
            label: 'rootFileTranslation',
            textEdit: {
              newText: 'rootFileTranslation',
              range: {
                end: {
                  character: 4,
                  line: 1,
                },
                start: {
                  character: 4,
                  line: 1,
                },
              },
            },
          },
        ]);
      });

      it('should respect placeholder position in handlebars', async () => {
        expect(
          await intlCompletionProvider.onComplete(path.join(__dirname, '../../../test/fixtures'), {
            results: [],
            type: 'template',
            position: {
              character: 19,
              line: 1,
            },
            focusPath: {
              node: {
                type: 'StringLiteral',
                value: 'rootFilELSCompletionDummyeTransla',
              },
              parent: {
                type: 'MustacheStatement',
                path: {
                  original: 't',
                },
              },
            },
          } as any)
        ).toEqual([
          {
            detail: 'en-us : text 1',
            kind: 12,
            label: 'rootFileTranslation',
            textEdit: {
              newText: 'rootFileTranslation',
              range: {
                end: {
                  character: 12,
                  line: 1,
                },
                start: {
                  character: 12,
                  line: 1,
                },
              },
            },
          },
        ]);
      });

      it('should autocomplete sub folder translation in handlebars', async () => {
        expect(
          await intlCompletionProvider.onComplete(path.join(__dirname, '../../../test/fixtures'), {
            results: [],
            type: 'template',
            position: {
              character: 19,
              line: 1,
            },
            focusPath: {
              node: {
                type: 'StringLiteral',
                value: 'subFolderTranslatELSCompletionDummy',
              },
              parent: {
                type: 'MustacheStatement',
                path: {
                  original: 't',
                },
              },
            },
          } as any)
        ).toEqual([
          {
            detail: 'en-us : text 2',
            kind: 12,
            label: 'subFolderTranslation.subTranslation',
            textEdit: {
              newText: 'subFolderTranslation.subTranslation',
              range: {
                end: {
                  character: 2,
                  line: 1,
                },
                start: {
                  character: 2,
                  line: 1,
                },
              },
            },
          },
          {
            detail: 'en-us : another text',
            kind: 12,
            label: 'subFolderTranslation.anotherTranslation',
            textEdit: {
              newText: 'subFolderTranslation.anotherTranslation',
              range: {
                end: {
                  character: 2,
                  line: 1,
                },
                start: {
                  character: 2,
                  line: 1,
                },
              },
            },
          },
        ]);
      });

      it('should autocomplete in JS files when in the end of expression', async () => {
        const focusPathNode = {
          type: 'StringLiteral',
          value: 'subFolderTranslation.another',
        };

        expect(
          await intlCompletionProvider.onComplete(path.join(__dirname, '../../../test/fixtures'), {
            results: [],
            type: 'script',
            position: {
              character: 28 + 5 + 3, // subFolderTranslation.another|
              line: 1,
            },
            focusPath: {
              node: focusPathNode,
              parent: {
                type: 'CallExpression',
                arguments: [focusPathNode],
                callee: {
                  type: 'MemberExpression',
                  property: {
                    type: 'Identifier',
                    name: 't',
                    loc: {
                      start: { column: 5 },
                    },
                  },
                },
              },
            },
          } as any)
        ).toEqual([
          {
            detail: 'en-us : another text',
            kind: 12,
            label: 'subFolderTranslation.anotherTranslation',
            textEdit: {
              newText: 'subFolderTranslation.anotherTranslation',
              range: {
                end: {
                  character: 8,
                  line: 1,
                },
                start: {
                  character: 8,
                  line: 1,
                },
              },
            },
          },
        ]);
      });

      it('should autocomplete in JS files when in the middle of expression', async () => {
        const focusPathNode = {
          type: 'StringLiteral',
          value: 'subFolderTranslation.another',
        };
        const result = await intlCompletionProvider.onComplete(path.join(__dirname, '../../../test/fixtures'), {
          results: [],
          type: 'script',
          position: {
            character: 5 + 5 + 3, // subFo|lderTranslation.another
            line: 1,
          },
          focusPath: {
            node: focusPathNode,
            parent: {
              type: 'CallExpression',
              arguments: [focusPathNode],
              callee: {
                type: 'MemberExpression',
                property: {
                  type: 'Identifier',
                  name: 't',
                  loc: {
                    start: { column: 5 },
                  },
                },
              },
            },
          },
        } as any);

        expect(result).toEqual([
          {
            detail: 'en-us : text 2',
            kind: 12,
            label: 'subFolderTranslation.subTranslation',
            textEdit: {
              newText: 'subFolderTranslation.subTranslation',
              range: {
                end: {
                  character: 8,
                  line: 1,
                },
                start: {
                  character: 8,
                  line: 1,
                },
              },
            },
          },
          {
            detail: 'en-us : another text',
            kind: 12,
            label: 'subFolderTranslation.anotherTranslation',
            textEdit: {
              newText: 'subFolderTranslation.anotherTranslation',
              range: {
                end: {
                  character: 8,
                  line: 1,
                },
                start: {
                  character: 8,
                  line: 1,
                },
              },
            },
          },
        ]);
      });
    });
  });
}
