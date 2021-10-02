import fs from 'fs/promises'
import esbuild from 'esbuild'
import { glsl } from 'esbuild-plugin-glsl'
import browserSync from 'browser-sync'
import openBrowser from 'react-dev-utils/openBrowser.js'
import compile from 'babel-plugin-glsl/lib/compile.js'
import { devLogger, prodLogger } from './logging-utils.mjs'

const HTTPS = false // enable https here
const PORT = '8080'

const isDevelopment = process.env.NODE_ENV === 'development'

let local
let external
if (isDevelopment) {
  // start the development server
  const server = browserSync.create()
  server.init({
    server: './public',
    watch: true,
    https: HTTPS,
    port: PORT,

    open: false, // don't open automatically
    notify: false, // don't show the browser notification
    minify: false, // don't minify files
    logLevel: 'silent', // no logging to console
  })

  const urlOptions = server.instance.utils.getUrlOptions(server.instance.options)
  local = urlOptions.get('local')
  external = urlOptions.get('external')
}

const result = await esbuild
  .build({
    entryPoints: ['src/index.js'],
    bundle: true,
    format: 'iife',
    logLevel: 'silent', // sssh...
    legalComments: 'none', // don't include licenses txt file
    sourcemap: true,
    ...(isDevelopment
      ? //
        //  $$$$$$\    $$$$$$$$\     $$$$$$\     $$$$$$$\    $$$$$$$$\
        // $$  __$$\   \__$$  __|   $$  __$$\    $$  __$$\   \__$$  __|
        // $$ /  \__|     $$ |      $$ /  $$ |   $$ |  $$ |     $$ |
        // \$$$$$$\       $$ |      $$$$$$$$ |   $$$$$$$  |     $$ |
        //  \____$$\      $$ |      $$  __$$ |   $$  __$$<      $$ |
        // $$\   $$ |     $$ |      $$ |  $$ |   $$ |  $$ |     $$ |
        // \$$$$$$  |     $$ |      $$ |  $$ |   $$ |  $$ |     $$ |
        //  \______/      \__|      \__|  \__|   \__|  \__|     \__|
        //
        {
          outfile: 'public/app.js',
          watch: true,
          plugins: [
            glslify(),
            glsl(),
            devLogger({
              localUrl: local,
              networkUrl: external,
              onFisrtBuild() {
                openBrowser(local)
              },
            }),
          ],
        }
      : //
        // $$$$$$$\     $$\   $$\    $$$$$$\    $$\          $$$$$$$\
        // $$  __$$\    $$ |  $$ |   \_$$  _|   $$ |         $$  __$$\
        // $$ |  $$ |   $$ |  $$ |     $$ |     $$ |         $$ |  $$ |
        // $$$$$$$\ |   $$ |  $$ |     $$ |     $$ |         $$ |  $$ |
        // $$  __$$\    $$ |  $$ |     $$ |     $$ |         $$ |  $$ |
        // $$ |  $$ |   $$ |  $$ |     $$ |     $$ |         $$ |  $$ |
        // $$$$$$$  |   \$$$$$$  |   $$$$$$\    $$$$$$$$\    $$$$$$$  |
        // \_______/     \______/    \______|   \________|   \_______/
        //
        {
          outfile: 'build/app.js',
          minify: true,
          plugins: [glslify(), glsl({ minify: true }), prodLogger({ outDir: 'build/' })],
          metafile: true,
          entryNames: '[name]-[hash]', // add the contenthash to the filename
        }),
  })
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })

if (!isDevelopment) {
  // inject the hash into the index.html
  const jsFilePath = Object.keys(result.metafile.outputs).find((o) => o.endsWith('.js'))
  const jsFileName = jsFilePath.slice('build/'.length) // --> app-Y4WC7QZS.js

  let indexHtml = await fs.readFile('./build/index.html', 'utf-8')
  indexHtml = indexHtml.replace('src="app.js"', `src="${jsFileName}"`)
  await fs.writeFile('./build/index.html', indexHtml)
}

function glslify() {
  return {
    name: 'glslify',
    setup(build) {
      const cache = {}

      build.onLoad({ filter: /\.(js|ts|jsx|tsx)$/ }, async (args) => {
        if (args.path.includes('/node_modules/')) {
          return
        }

        let text = await fs.readFile(args.path, 'utf8')

        if (!text.includes('#pragma glslify')) {
          return
        }

        // remove the unnecessary import
        text = text.replace(/import glsl from ('|")glslify('|");?/, '')

        // remove the unnecessary glsl function call
        text = text.replaceAll('glsl`', '`')

        // resolve glslify imports
        text = text.replace(/^(\s*)#pragma glslify(.*)/gm, (match) => {
          const glslifyImport = match.trim()

          if (cache[glslifyImport]) {
            return cache[glslifyImport]
          }

          const contents = compile(glslifyImport)
          cache[glslifyImport] = contents
          return contents
        })

        return {
          contents: text,
        }
      })
    },
  }
}
