const readline = require("readline");
const { Readable } = require("stream");
const BashInterpreter = require("./src/bash-interpreter");

//Might not be needed so can't throw
const workerUrlArgIndex = process.argv.indexOf("-worker") + 1;
const workerUrlArg = workerUrlArgIndex !== 0 && process.argv.length > workerUrlArgIndex ? process.argv[workerUrlArgIndex] : "";
const interpretter = new BashInterpreter(workerUrlArg);
const executeCommand = interpretter.exec;

async function execute(args, onEnd) {
  try {
    
    const result = await executeCommand(args);
    interpretter.usedTTY = false;
    if (typeof result === 'string') {
      
      console.log(result);
      await onEnd();
      
    } else if (result instanceof Readable) {
      
      //TODO God willing: multiiple CTRL-C force close worker
      const onExitKey = (_, key) => {
        key = key || {};
        const didExit = key.ctrl === true && key.shift === false && key.meta === false && ['c', 'C'].indexOf(key.name) > -1
        if (didExit) {
          result.destroy();
          if (interpretter.ipfsProcess) {
            interpretter.ipfsProcess.stdout.destroy();
          }
        }
      }
      
      process.stdin.on('keypress', onExitKey);
      
      result.pipe(process.stdout, { end: false });
      result.on('end', () => {
        process.stdin.removeListener('keypress', onExitKey)
        result.unpipe(process.stdout);
        onEnd();
      });
    }

  } finally {
    interpretter.usedTTY = false;
  }
}


async function setup() {
  const isCommand = process.argv.indexOf("-c") !== -1;

  if (!isCommand) {

    createPersistentBashInstance();

  } else {

    const args = process.argv.slice(2).join(" ");
    execute(args, () => process.exit());
  }
}

function createPersistentBashInstance() {

  const readlineInterface = readline.createInterface({
    input: process.stdin, 
    output: process.stdout, 
    prompt: "$ ",
    crlfDelay: Infinity,
    escapeCodeTimeout: 500,
    tabSize: 8,
    terminal: true
  })
  
  readlineInterface.on('line', async (line) => {
    //Should assume this might take some time, God willing. Only prompt after.
    try {
      readlineInterface.pause();
      process.stdin.resume();

      execute(line, () => {
        //TODO God willing: fake event loop by tracking streams/events/process/setTimeout/setInterval/process.nextTick/http/fs/async and generators?
        readlineInterface.resume();
        readlineInterface.prompt();
      }).catch(err => {
        console.log(err);
        readlineInterface.resume();
        readlineInterface.prompt();
      });

    } catch (err) {
      debugger;
      console.log(err);
    }
  })

  const closeListener = () => {
    createPersistentBashInstance();
    readlineInterface.removeListener('close', closeListener)
  };

  readlineInterface.on('close', closeListener)

  readlineInterface.prompt();
}


setup();