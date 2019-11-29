# Stationery
## Synopsis
Stationery is an extension that allows to load HTML templates into e-mails, aka email stationery. It also allows to edit
these HTML sources very easily.

## Motivation
I started work on the Stationery, because I needed this feature in my Thunderbird, and there was no usable extension for
this yet. Then I released it to the AMO, so everyone with similar needs could use it.

## Building
To build the Stationery extension You need only the /stationery directory, it uses Gradle as build system, embedded
version. Just enter the /stationery directory, then type `gradlew clean build` to build XPI. Build XPI will land in
/stationery/build directory. `gradlew cleanDownloads` or `gradlew cleanAll` will remove downloaded files.

## Building
Stationery uses the Gradle build system; a working Java JRE is required for Gradle.

 1. check the sources out from git
 2. enter the git repository
 3. execute `gradlew build`  
    the built XPI will land in the 'build' directory
 4. `gradlew cleanDownloads` or `gradlew cleanAll` to remove downloaded files

## License
Completely public domain, use it in any way You want.
