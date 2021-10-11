const fs = require("fs");
const path = require("path");
const _isExecutable = require("executable");

async function isExectuable(path) {
  try {
    return await _isExecutable(path);
  } catch (err) {
    return false;
  }
}

async function filterNonExecutables(paths) {
  //Return only executable paths and undefined if not.
  const isExecutableList = await Promise.all(
    paths.map(async (path) => {
      if (await isExectuable(path)) {
        return path;
      }
    })
  );

  //Remove falsy non-executables
  return isExecutableList.filter(Boolean);
}

async function parseExecutables(paths) {
  paths = Array.isArray(paths) ? paths : [paths];
  const existingPaths = paths.filter((path) => fs.existsSync(path));

  const allExecutables = await Promise.all(
    existingPaths.map(async (searchPath) => {
      const filenames = await new Promise((res, rej) =>
        fs.readdir(searchPath, (err, files) => (err ? rej(err) : res(files)))
      );
      const filePaths = filenames.map((filename) =>
        path.join(searchPath, filename)
      );
      return await filterNonExecutables(filePaths);
    })
  );

  return Array.prototype.concat.apply([], allExecutables);
}

let executables = [];
async function updateExecutables(paths) {
  executables = await parseExecutables(paths);
}

updateExecutables((process.env.PATH || "").split(";").filter(Boolean));

module.exports = function getBinExecutables() {
  return executables;
}