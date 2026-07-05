import angular from '@angular-eslint/eslint-plugin';
import angularTemplate from '@angular-eslint/eslint-plugin-template';
import angularTemplateParser from '@angular-eslint/template-parser';
import ts from 'typescript-eslint';
import tsParser from '@typescript-eslint/parser';

/** @type {import('eslint').Linter.Config[]} */
export default ts.config(
	// TypeScript files
	{
		files: ['**/*.ts'],
		ignores: ['dist/**', 'coverage/**', '**/generated/**', '**/*.worker.ts'],
		languageOptions: {
			parser: tsParser,
			parserOptions: {
				ecmaVersion: 2020,
				projectService: true,
				allowDefaultProject: ['**/*.ts'],
			},
		},
		plugins: {
			'@angular-eslint': angular,
			'@typescript-eslint': ts.plugin,
		},
		rules: {
			// @angular-eslint
			'@angular-eslint/component-class-suffix': 'error',
			'@angular-eslint/component-selector': 'off',
			'@angular-eslint/contextual-lifecycle': 'error',
			'@angular-eslint/directive-class-suffix': 'error',
			'@angular-eslint/directive-selector': 'off',
			'@angular-eslint/no-attribute-decorator': 'error',
			'@angular-eslint/no-empty-lifecycle-method': 'error',
			'@angular-eslint/no-forward-ref': 'error',
			'@angular-eslint/no-input-rename': 'error',
			'@angular-eslint/no-inputs-metadata-property': 'error',
			'@angular-eslint/no-lifecycle-call': 'error',
			'@angular-eslint/no-output-native': 'error',
			'@angular-eslint/no-output-on-prefix': 'error',
			'@angular-eslint/no-output-rename': 'error',
			'@angular-eslint/no-outputs-metadata-property': 'error',
			'@angular-eslint/no-pipe-impure': 'error',
			'@angular-eslint/no-queries-metadata-property': 'error',
			'@angular-eslint/pipe-prefix': 'off',
			'@angular-eslint/prefer-on-push-component-change-detection': 'off',
			'@angular-eslint/prefer-output-readonly': 'off',
			'@angular-eslint/prefer-standalone': 'off',
			'@angular-eslint/relative-url-prefix': 'off',
			'@angular-eslint/use-component-selector': 'off',
			'@angular-eslint/use-injectable-provided-in': 'error',
			'@angular-eslint/use-lifecycle-interface': 'error',
			'@angular-eslint/use-pipe-transform-interface': 'error',

			// @typescript-eslint recommended
			'@typescript-eslint/ban-ts-comment': 'error',
			'@typescript-eslint/no-explicit-any': 'warn',
			'@typescript-eslint/no-unnecessary-type-constraint': 'error',
			'@typescript-eslint/no-unsafe-function-type': 'error',
			'@typescript-eslint/no-wrapper-object-types': 'error',
			'@typescript-eslint/prefer-as-const': 'error',
			'@typescript-eslint/no-unused-expressions': 'error',

			// Project-specific rules
			eqeqeq: ['error', 'always'],
			'@typescript-eslint/ban-types': 'off',
			'@typescript-eslint/no-duplicate-enum-values': 'error',
			'@typescript-eslint/explicit-module-boundary-types': 'off',
			'@typescript-eslint/no-unused-vars': [
				'error',
				{
					args: 'all',
					argsIgnorePattern: '^_',
					caughtErrors: 'all',
					caughtErrorsIgnorePattern: '^_',
					destructuredArrayIgnorePattern: '^_',
					varsIgnorePattern: '^_',
					ignoreRestSiblings: true,
				},
			],
			'@typescript-eslint/no-empty-object-type': 'off',
			'no-useless-escape': 'off',
			'no-console': ['error', { allow: ['error'] }],
		},
	},
	// HTML template files
	{
		files: ['**/*.html'],
		ignores: ['dist/**', 'coverage/**'],
		languageOptions: {
			parser: angularTemplateParser,
		},
		plugins: {
			'@angular-eslint/template': angularTemplate,
		},
		rules: {
			'@angular-eslint/template/banana-in-box': 'error',
			'@angular-eslint/template/eqeqeq': 'error',
			'@angular-eslint/template/no-negated-async': 'error',
			'@angular-eslint/template/interactive-supports-focus': 'error',
			'@angular-eslint/template/click-events-have-key-events': 'off',
			'@angular-eslint/template/label-has-associated-control': 'off',
			'@angular-eslint/template/alt-text': 'off',
			'@angular-eslint/template/elements-content': 'error',
			'@angular-eslint/template/mouse-events-have-key-events': 'error',
			'@angular-eslint/template/no-autofocus': 'error',
			'@angular-eslint/template/no-distracting-elements': 'error',
			'@angular-eslint/template/no-positive-tabindex': 'error',
			'@angular-eslint/template/role-has-required-aria': 'error',
		},
	},
);
