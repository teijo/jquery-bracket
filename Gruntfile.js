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
    jshint: {
      options: {
        jshintrc: '.jshintrc'
      },
      with_overrides: {
        options: {
          asi: true,
          curly: false,
          strict: false,
          predef : ['jQuery', 'console'],
        },
        files: {
          src: ['src/jquery.bracket.ts']
        }
      }
    },
    cssmin: {
      options: {
        banner: '<%= licenseString %>'
      },
      dist: {
        files: {
          'dist/<%= pkg.name %>.min.css': 'dist/<%= pkg.name %>.css'
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
          'dist/<%= pkg.name %>.min.js': ['dist/<%= pkg.name %>.js']
        }
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
  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks('grunt-shell');
  grunt.loadNpmTasks('grunt-typescript');
  grunt.loadNpmTasks('grunt-css');

  grunt.registerTask('default', ['shell', 'typescript', 'uglify', 'cssmin']);
};
