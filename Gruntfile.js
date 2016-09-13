module.exports = function(grunt) {
  grunt.initConfig({
    licenseString: '/* jQuery Bracket | Copyright (c) Teijo Laine 2011-<%= grunt.template.today("yyyy") %> | Licenced under the MIT licence */',
    pkg: grunt.file.readJSON('package.json'),
    watch: {
      scripts: {
        files: ['src/jquery.bracket.sass', 'src/jquery.bracket.ts'],
        tasks: ['default']
      }
    },
    shell: {
      compass: {
        command: 'compass compile'
      }
    },
    cssmin: {
      options: {
        banner: '<%= licenseString %>'
      },
      dist: {
        files: {
          'dist/jquery.bracket.min.css': 'dist/jquery.bracket.css'
        }
      }
    },
    uglify: {
      options: {
        compress: true,
        banner: '<%= licenseString %>\n'
      },
      dist: {
        files: {
          'dist/jquery.bracket.min.js': ['dist/jquery.bracket.js']
        }
      }
    },
    tslint: {
      options: {
        configuration: grunt.file.readJSON("tslint.json")
      },
      files: {
        src: ['src/*.ts']
      }
    },
    typescript: {
      base: {
        src: ['src/*.ts'],
        dest: 'dist/jquery.bracket.js'
      }
    }
  });

  grunt.loadNpmTasks('grunt-contrib-uglify');
  grunt.loadNpmTasks('grunt-contrib-watch');
  grunt.loadNpmTasks('grunt-shell');
  grunt.loadNpmTasks('grunt-typescript');
  grunt.loadNpmTasks('grunt-tslint');
  grunt.loadNpmTasks('grunt-css');

  grunt.registerTask('default', ['tslint', 'shell', 'typescript', 'uglify', 'cssmin']);
};
