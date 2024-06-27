import eslint from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    eslint.configs.recommended,
    tseslint.configs.base,
    tseslint.configs.eslintRecommended,
    {
        'ignores': [
            "/src/**/*.d.ts",
            "lib/",
            "examples/",
            "benchmarks/",
            "eslint.config.mjs"
        ]
    },
    {
        'languageOptions': {
            'globals': {
                ...globals.mocha,
                ...globals.node,
                ...globals.es2021
            },
            'parserOptions': { 'project': true }
        },
        'linterOptions': { 'reportUnusedDisableDirectives': true },
        'rules': {
            "@typescript-eslint/return-await": ["error", "always"],
            "no-var": "error",
            "prefer-const": ["error", { "ignoreReadBeforeAssign": true }],
            "prefer-rest-params": "error",
            "prefer-spread": "error",
            "accessor-pairs": "error",
            "array-callback-return": "error",
            "dot-notation": "error",
            "eqeqeq": ["error", "smart"],
            "func-name-matching": "error",
            "func-style": ["error", "declaration", { "allowArrowFunctions": true }],
            "no-delete-var": "error",
            "no-duplicate-imports": "error",
            "no-extra-boolean-cast": "error",
            "no-lonely-if": "error",
            "no-octal": "error",
            "no-proto": "error",
            "no-redeclare": "error",
            "no-restricted-syntax": ["error",
                {
                    "selector": "CallExpression[callee.name='setTimeout'][arguments.length<2]",
                    "message": "`setTimeout()` must be invoked with at least two arguments.",
                },
                {
                    "selector": "CallExpression[callee.name='setInterval'][arguments.length<2]",
                    "message": "`setInterval()` must be invoked with at least two arguments.",
                },
                {
                    "selector": "ThrowStatement > CallExpression[callee.name=/Error$/]",
                    "message": "Use `new` keyword when throwing an `Error`.",
                }
            ],
            "no-self-compare": "error",
            "no-template-curly-in-string": "error",
            "no-throw-literal": "error",
            "no-undef-init": "error",
            "no-unused-labels": "error",
            "no-unused-vars": "off",
            "@typescript-eslint/no-unused-vars": ["error", { args: "none", caughtErrors: "all" }],
            "no-use-before-define": "off",
            "@typescript-eslint/no-use-before-define": ["error", {
                "classes": true,
                "functions": false,
                "variables": false
            }],
            "no-useless-call": "error",
            "no-useless-catch": "error",
            "no-useless-concat": "error",
            "no-useless-constructor": "error",
            "no-useless-escape": "error",
            "no-useless-return": "error",
            "no-void": "error",
            "no-with": "error",
            "one-var": ["error", { "initialized": "never" }],
            "symbol-description": "error",
            "unicode-bom": "error"
        }
    }
);
