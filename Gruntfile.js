module.exports = function(grunt) {
  grunt.initConfig({
    licenseString:
      '/* jQuery Bracket | Copyright (c) Teijo Laine 2011-<%= grunt.template.today("yyyy") %> | Licenced under the MIT licence */',
    pkg: grunt.file.readJSON("package.json"),
    watch: {
      scripts: {
        files: ["src/jquery.bracket.scss", "src/jquery.bracket.ts"],
        tasks: ["default"]
      }
    },
    sass: {
      dist: {
        files: {
          "dist/jquery.bracket.css": "src/jquery.bracket.scss"
        }
      }
    },
    cssmin: {
      options: {
        banner: "<%= licenseString %>"
      },
      dist: {
        files: {
          "dist/jquery.bracket.min.css": "dist/jquery.bracket.css"
        }
      }
    },
    uglify: {
      options: {
        compress: true,
        banner: "<%= licenseString %>\n"
      },
      dist: {
        files: {
          "dist/jquery.bracket.min.js": ["dist/jquery.bracket.js"]
        }
      }
    },
    tslint: {
      options: {
        configuration: grunt.file.readJSON("tslint.json")
      },
      files: {
        src: ["src/*.ts"]
      }
    },
    ts: {
      default: {
        src: ["src/*.ts", "!node_modules/**"],
        dest: "dist/jquery.bracket.js"
      },
      options: {
        sourceMap: true,
        target: "es5",
        additionalFlags: "--strictNullChecks"
      }
    }
  });

  grunt.loadNpmTasks("grunt-sass");
  grunt.loadNpmTasks("grunt-contrib-uglify");
  grunt.loadNpmTasks("grunt-contrib-watch");
  grunt.loadNpmTasks("grunt-ts");
  grunt.loadNpmTasks("grunt-tslint");
  grunt.loadNpmTasks("grunt-css");

  grunt.registerTask("default", ["tslint", "sass", "ts", "uglify", "cssmin"]);
};
