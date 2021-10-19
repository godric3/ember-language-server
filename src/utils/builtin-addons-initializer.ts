import TemplateLintFixesCodeAction from '../builtin-addons/core/code-actions/template-lint-fixes';
import TemplateLintCommentsCodeAction from '../builtin-addons/core/code-actions/template-lint-comments';
import TypedTemplatesCodeAction from '../builtin-addons/core/code-actions/typed-template-comments';
import CoreScriptDefinitionProvider from './../builtin-addons/core/script-definition-provider';
import CoreTemplateDefinitionProvider from './../builtin-addons/core/template-definition-provider';
import ScriptCompletionProvider from './../builtin-addons/core/script-completion-provider';
import TemplateCompletionProvider from './../builtin-addons/core/template-completion-provider';
import IntlCompletionProvider from '../builtin-addons/core/intl-completion-provider';
import { AddonMeta, ProjectProviders } from './addon-api';
import { logInfo } from './logger';

export function initBuiltinProviders(addonsMeta: AddonMeta[]): ProjectProviders {
  const scriptDefinition = new CoreScriptDefinitionProvider();
  const templateDefinition = new CoreTemplateDefinitionProvider();
  const scriptCompletion = new ScriptCompletionProvider();
  const templateCompletion = new TemplateCompletionProvider();

  const templateLintFixesCodeAction = new TemplateLintFixesCodeAction();
  const templateLintCommentsCodeAction = new TemplateLintCommentsCodeAction();
  const typedTemplatesCodeAction = new TypedTemplatesCodeAction();

  const definitionProviders = [scriptDefinition.onDefinition.bind(scriptDefinition), templateDefinition.onDefinition.bind(templateDefinition)];
  const referencesProviders: any[] = [];
  const codeActionProviders = [
    templateLintFixesCodeAction.onCodeAction.bind(templateLintFixesCodeAction),
    templateLintCommentsCodeAction.onCodeAction.bind(templateLintCommentsCodeAction),
    typedTemplatesCodeAction.onCodeAction.bind(typedTemplatesCodeAction),
  ];
  const initFunctions = [
    templateLintFixesCodeAction.onInit.bind(templateLintFixesCodeAction),
    templateLintCommentsCodeAction.onInit.bind(templateLintCommentsCodeAction),
    typedTemplatesCodeAction.onInit.bind(typedTemplatesCodeAction),
    templateCompletion.initRegistry.bind(templateCompletion),
    scriptCompletion.initRegistry.bind(scriptCompletion),
    templateDefinition.onInit.bind(templateDefinition),
    scriptDefinition.onInit.bind(scriptDefinition),
  ];
  const completionProviders = [scriptCompletion.onComplete.bind(scriptCompletion), templateCompletion.onComplete.bind(templateCompletion)];

  if (!addonsMeta.find((addon) => addon.name == 'els-intl-addon')) {
    const intlCompletion = new IntlCompletionProvider();

    initFunctions.push(intlCompletion.onInit.bind(intlCompletion));
    completionProviders.push(intlCompletion.onComplete.bind(intlCompletion));
  } else {
    logInfo('Detected project installed `els-intl-addon`, builtin intl addon will be disabled');
  }

  return {
    definitionProviders,
    referencesProviders,
    codeActionProviders,
    initFunctions,
    info: [],
    addonsMeta: [],
    completionProviders,
  };
}
