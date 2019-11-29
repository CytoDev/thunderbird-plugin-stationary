# Reviewer note
## Building
Stationery uses the Gradle build system; a working Java JRE is required for Gradle.

 1. check the sources out from git
 2. enter the git repository
 3. execute `gradlew build`  
    the built XPI will land in the 'build' directory
 4. `gradlew cleanDownloads` or `gradlew cleanAll` to remove downloaded files

Sources are available at https://github.com/arivald/tbirdExt

## Third-party tools
Stationery uses the [Ace editor](https://ace.c9.io/), ([source](https://github.com/ajaxorg/ace)). The current version of
Stationery uses the [1.2.8 version of Ace](https://github.com/ajaxorg/ace-builds/archive/v1.2.8.zip). The JavaScript
files are already minified, I choose the "src-min-noconflict" version. The "buildAce" build task will download Ace, then
copy a small subset of required files from the 'src-min-noconflict' into 'src/chrome/content/ace' directory, modifying
the ace js files on the fly. The modifications that are made are to allow custom folds, a feature that I require to fold
images data URLs.

You can clearly see what is added, I have put ↓↓↓ over the added fragment.
