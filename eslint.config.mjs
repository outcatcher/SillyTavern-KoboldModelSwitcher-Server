import eslint from '@eslint/js';
import stylisticTs from '@stylistic/eslint-plugin-ts';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    {
        ignores: [
            'node_modules/*',
            'dist/*',
            'webpack.config.js',
        ],
    },
    {
        extends: [
            eslint.configs.all,
        ],
        rules: {
            'no-warning-comments': 'warn',
            'max-statements': ['warn', { max: 12 }],
            'max-lines-per-function': 'warn',
            // Ugly
            'one-var': 'off',
            // Ha-ha, ternary power
            'no-ternary': 'off',
            // Sort by meaning
            'sort-keys': 'off',
            // Better imports with fixs
            'sort-imports': 'off',
            'simple-import-sort/imports': 'error',
            'simple-import-sort/exports': 'error',
            // I use _ for unused arguments and vars
            'id-length': ['error', {
                exceptions: ['_'],
            }],
            'no-magic-numbers': ['error', {
                ignore: [0, 1],
            }],
            'no-unused-vars': 'off',
            // Let's trust in humanity
            'no-undefined': 'off',
            'arrow-body-style': ['error', 'as-needed', { 'requireReturnForObjectLiteral': true }],
            'max-params': ['error', { max: 4 }],
        },
        plugins: {
            'simple-import-sort': simpleImportSort,
            '@stylistic/ts': stylisticTs,
        },
    },
    {
        files: [
            '**/*.ts'
        ],
        extends: [
            tseslint.configs.strictTypeChecked,
            tseslint.configs.stylisticTypeChecked,
        ],
        rules: {
            '@typescript-eslint/no-unused-vars': ['error', {
                argsIgnorePattern: '_+',
                varsIgnorePattern: '_+',
            }],
            // Too stupid of async, only false-positives so far
            '@typescript-eslint/no-unnecessary-condition': 'off'
        },
    },
    {
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
    },
);
