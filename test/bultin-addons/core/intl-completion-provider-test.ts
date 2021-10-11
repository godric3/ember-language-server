import { Project, Server } from '../../../src';
import IntlCompletionProvider from '../../../src/builtin-addons/core/intl-completion-provider';
import { fsProvider } from '../../../src/fs-provider';
import * as path from 'path';

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
});

describe('Intl translations', () => {
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

    expect(
      await intlCompletionProvider.onComplete(path.join(__dirname, '../../../test/fixtures'), {
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
