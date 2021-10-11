const path = require("path");
const getBinExecutables = require("./executables.js");

function getBinExeCompletions(line) {
  const completion = getBinExecutables()
    .map((exe) => exe.split(path.sep).pop())
    .filter((exe) => exe.startsWith(line));

  return completion;
}

module.exports = function completeExecutables(line) {
  const completions = getBinExeCompletions(line);
  return [completions, line];
}