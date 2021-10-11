//setup commander for sed, God willing.
program
  .description("sed replacement")
  .option()
  .argument("<regex>", "regex to search and replace")
  .action((regex, options, commander) => {
    
  });

program.parse();

sed(escapeStringRegexp(regexSuffix))()

if (command === "sed") {
  //TODO God willing: REGEX would be last I'd assume, God willing.
  const regexSuffix = params.split(" ").pop();
  stdout = sed(escapeStringRegexp(regexSuffix))(stdin);
} else {
  //TODO God willing: basically any command could work here, God willing; possibly pass in stdin for some
  stdout = cash[command](params);
}