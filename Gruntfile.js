const fs = require('fs');
const path = require('path');

const buildDir = path.join(process.cwd(), 'build');

module.exports = function (grunt) {
  grunt.initConfig({
    run: {
      install: {
        options: { cwd: 'build' },
        exec: 'yarn install --prod',
      },
      prettier: {
        exec: 'yarn prettier',
      },
      lint: {
        exec: 'yarn lint',
      },
      test: {
        exec: 'yarn test',
      },
    },
    compress: {
      main: {
        options: {
          archive: 'dist/lambda-timestamp.zip',
          mode: 'zip',
        },
        files: [
          {
            expand: true,
            cwd: 'build/',
            src: ['node_modules/**'],
            dest: '/',
          },
          {
            expand: true,
            cwd: 'src/',
            src: ['*'],
            dest: '/',
          },
        ],
      },
    },
  });

  grunt.loadNpmTasks('grunt-run');
  grunt.loadNpmTasks('grunt-contrib-compress');

  grunt.registerTask('remove build folder', () => {
    if (fs.existsSync(buildDir)) fs.rmdirSync(buildDir, { recursive: true });
  });

  grunt.registerTask('create build folder', () => {
    fs.mkdirSync(buildDir);
  });

  grunt.registerTask('copy package.json', () => {
    fs.copyFileSync('./package.json', path.join(buildDir, 'package.json'));
  });

  grunt.registerTask('default', [
    'run:prettier',
    'run:lint',
    'run:test',
    'remove build folder',
    'create build folder',
    'copy package.json',
    'run:install',
    'compress',
    'remove build folder',
  ]);
};
