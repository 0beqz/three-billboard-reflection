import { terser } from "rollup-plugin-terser";
import { babel } from "@rollup/plugin-babel";
import cleanup from "rollup-plugin-cleanup";
import compiler from "@ampproject/rollup-plugin-closure-compiler";

// from https://github.com/mrdoob/three.js/blob/dev/utils/build/rollup.config.js (modified)
function glsl() {

    return {

        transform(code) {
            code = code.replace(/\/\* glsl \*\/\`((.|\r|\n)*)\`/, function (match, p1) {

                return '`' + (
                    p1
                        .trim()
                        .replace(/\r/g, '\n')
                        .replace(/[ \t]*\/\/.*\n/g, '') // remove //
                        .replace(/[ \t]*\/\*[\s\S]*?\*\//g, '') // remove /* */
                        .replace(/\n{2,}/g, '\n') // # \n+ to \n
                ) + '`';

            });

            return {
                code: code,
                map: null
            };

        }

    };

}

export default [
    // UMD
    {
        input: "./src/billboard-reflection/BillboardReflection.js",
        plugins: [
            glsl(),
            cleanup(),
            babel({ babelHelpers: "bundled", plugins: ["@babel/plugin-proposal-class-properties", "@babel/plugin-proposal-private-methods"] })
        ],
        output: [
            {
                file: "dist/BillboardReflection.js",
                name: "BillboardReflection",
                format: "umd"
            }
        ]
    },
    // ESM
    {
        input: "./src/billboard-reflection/BillboardReflection.js",
        plugins: [
            glsl(),
            cleanup(),
            babel({ babelHelpers: "bundled", plugins: ["@babel/plugin-proposal-class-properties", "@babel/plugin-proposal-private-methods"] })
        ],
        output: [
            {
                file: "dist/BillboardReflection.module.js",
                format: "esm"
            }
        ]
    }
]