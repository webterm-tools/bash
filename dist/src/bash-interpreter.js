const escapeStringRegexp = require("escape-string-regexp").default;
const cash = require("cash");
const bash = require("bash-parser");
const { sed } = require("sed-lite");

const { spawn } = require('child_process')
const { Readable } = require('stream');
const Module = require('module').Module

//Because cash and vorpal
process.stdin.removeAllListeners('keypress');

function uid() {
  return Array.from({ length: 128 / 16 }, () =>
    Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .substring(1)
  ).join('');
}

async function drain(readable) {
  return await new Promise((res) => {
    let text = "";
    readable.on("data", (data) => text += data.toString());
    readable.on("end", () => res(text));
  });
}

module.exports = class BashInterpreter {
  constructor(workerUrl) {
    this.workerUrl = workerUrl;
    this.env = Object.assign({}, process.env);

    //TODO God willing: interpret each section and return pipes, then execute.
    const exec = (this.exec = async (node, stdin) => {
      if (typeof node === "string") {
        node = bash(node);
      }

      const execNode = this[node.type].bind(this);
      const retVal = await execNode(node, stdin);
      return retVal;
    });

    //TODO God willing: whenever we run our first command that takes stdin, then no other gets isTTY stdin, God willing.
    //TODO God willing: whenever we have a pipe coming afterwards, then set stdout isTTY to false, God willing.
    this.combineOutputToStdout = async (arr, reduction = exec) =>
      await arr.reduce(async (stdinPromise, node, i) => {
        const stdin = await stdinPromise
        const stdout = await reduction(node);
        const isLast = arr.length - 1 === i;
        
        if (isLast) {
          return stdout;
        }

        if (stdout instanceof Readable) {
          stdout = await drain(stdout)
        } 

        const combined = `${stdin.trim()} ${stdout.trim()}`.trim();
        return combined;
      }, "");

    this.combineOutputToParams = async (arr, reduction = exec) =>
      await arr.reduce(async (stdinPromise, node, i) => {
        const stdin = await stdinPromise
        const stdout = await reduction(node);

        if (stdout instanceof Readable) {
          stdout = await drain(stdout)
        } 

        const combined = `${stdin.trim()} ${stdout.trim()}`.trim();
        return combined;
    }, "");

    this.pipeOutputToStdin = async (arr, reduction = exec) =>
      await arr.reduce(async (stdinPromise, node) => {
        const stdin = await stdinPromise
        const stdout = await reduction(node, stdin);
        return stdout;
      }, "");
  }

  async Script({ commands }) {
    //If main is script and only single command, then first in array gets stdin.isTTY and last gets stdout.isTTY and rest false.
    const val = await this.combineOutputToStdout(commands);
    return val;
  }

  async Pipeline({ commands }) {
    //If main is script and only single command, then first in array gets stdin.isTTY and last gets stdout.isTTY and rest false.
    if (!this.usedTTY) {
      this.usedTTY = true;
      commands[0].stdinIsTTY = true;
      commands[commands.length-1].stdoutIsTTY = true;
    }

    const val = await this.pipeOutputToStdin(commands);
    return val;
  }

  async LogicalExpression({ op, left, right }) {
    if (op === "or") {
      let val;

      try {
        val = await this.exec(left);
      } catch (err) {
        //TODO God willing: if fails, still do right, God willing.
        console.log(err);
      }

      if (!val) {
        val = await this.exec(right);
      }

      return val;
    }
  }

  //prefix: Array<AssignmentWord | Redirect>
  //suffix: Array<Word | Redirect>
  async Command({ name, prefix = [], suffix = [], stdinIsTTY = false, stdoutIsTTY = false }, stdin = "") {
    //If main is script and only single command, then first in array gets stdin.isTTY and last gets stdout.isTTY and rest false.
    if (!this.usedTTY) {
      this.usedTTY = true;
      stdinIsTTY = true;
      stdoutIsTTY = true;
    }
    
    const [redirect] = suffix.slice(-1);
    const hasRedirect = redirect && redirect.type === "Redirect";
    suffix = hasRedirect ? suffix.slice(0, -1) : suffix;

    //Combine to stdout doesn't work any more
    const params = await this.combineOutputToParams(suffix);

    let stdout;

    if (name) {
      const command = name.text;

      if (command === "sed") {
        
        if (stdin instanceof Readable) {
          stdin = await drain(stdin);
        }

        //TODO God willing: REGEX would be last I'd assume, God willing.
        const regexSuffix = params.split(" ").pop();
        stdout = sed(escapeStringRegexp(regexSuffix))(stdin);
      } else if (cash.hasOwnProperty(command)) {

        if (stdin instanceof Readable) {
          stdin = await drain(stdin);
        }

        //TODO God willing: basically any command could work here, God willing; possibly pass in stdin for some
        const result = cash(command + " " + params);
        
        stdout = new Readable({
          read() {}
        });
        
        stdout.push(result);
        stdout.push(null);

      } else if (command) {

        //TODO God willing: don't drain immediately, get the output as stdout to then pipe to our stdout, God willing, or next.
        //TODO God willing: however params are supposed to look, God willing.
        //TODO God willing: also check if "ipfs" resolves to a path that matches the command (if it's a path instead of command), God willing.
        const entryPath = Module._findPath(command, (process.env.PATH || "").split(";").filter(Boolean), true);
        if (!entryPath) {
          stdout = new Readable({
            read() {}
          });
          
          stdout.push("bash: " + command + ": command not found\n");
          stdout.push(null);
          return stdout
        }

        const childProcess = command === "ipfs" && this.ipfsProcess ? this.ipfsProcess : spawn(entryPath + " " + params, { 
          workerUrl: this.workerUrl,
          dimensions: { columns: process.stdout.columns, rows: process.stdout.rows },
          stdinIsTTY, 
          stdoutIsTTY,
          env: process.env,
          pid: uid(),
          onMessage: (e) => {
            const { action, payload, transferables } = e && e.data || {};

            if (action === "IPFS_COMMAND_COMPLETED" && this.ipfsProcess && this.ipfsProcess.stdoutStream) {
              this.ipfsProcess.stdoutStream.push(null);
              this.ipfsProcess.stdoutStream.destroy();
            }
            
            self.postMessage(e.data, transferables);
          }
        });
      
        //Convert stdin to tty if a string from previous command, God willing
        if (!stdin && stdinIsTTY) {
          
          stdin = process.stdin;
        
        } else if (!(stdin instanceof Readable)) {
          
          const stdinStream = new Readable({
            read() {}
          });
          
          if (stdin && stdin.toString()) {
            stdinStream.push(stdin);
            stdinStream.push(null);
          }

          stdin = stdinStream
        } 
        
        //TODO God willing: maybe default to process.stdin if no stdin
        //Stdin is previous stdout or string result converted to stream, God willing;
        stdin.pipe(childProcess.stdin, { end: false });
        stdin.on('end', (err) => { 
          if (command !== "ipfs") childProcess.stdin.destroy(err)
        });

        if (command === "ipfs") {
          const isInitialized = !!this.ipfsProcess;
          if (!isInitialized) {
            this.ipfsProcess = childProcess;
            childProcess.stdout.on("end", () => {
              this.ipfsProcess = undefined
            })
          }

          //TODO God willing: since not always creating a new process, 
          const stdoutStream = new Readable({
            read() {}
          });

          const onData = (data) => {
            stdoutStream.push(data)
          };

          childProcess.stdout.on("data", onData);
          stdoutStream.on("end", () => childProcess.stdout.removeListener("data", onData));
          
          if (isInitialized) {
            this.ipfsProcess.worker.postMessage({ 
              argv: params && typeof params === 'string' ? params.split(" ") : params,
              env: process.env
            })
          }

          stdout = this.ipfsProcess.stdoutStream = stdoutStream;

        } else {
          stdout = childProcess.stdout;
        }
      }

    } else {
      //For assignmentwords, don't think there is a name. But there is a prefix, God willing.
      //Don't think that does anything in the end though.
      //Prefix might be a redirection though -__-;;
      //Prefix with assignmentwords will probably add to state, God willing.
      await Promise.all(prefix.map(this.exec));
    }

    stdout = hasRedirect ? await this.exec(redirect, stdout) : stdout;
    return stdout || "";
  }

  Function({ name, redirections, body }) {}

  Name({ text }) {}

  CompoundList({ commands, redirections }) {}

  Subshell({ list }) {}

  For({ name, wordlist, do: doList }) {}

  Case({ clause, cases }) {}

  CaseItem({ pattern, body }) {}

  If({ clause, then, else: elseStatement }) {}

  While({ clause, do: doStatement }) {}

  Until({ clause, do: doStatement }) {}

  async Redirect({ op, file, numberIo }, stdin) {
    const content = stdin instanceof Readable ? await drain(stdin) : stdin 

    if (op.type === "great") {  
      fs.writeFileSync(file.text, content);
      return "";
    }

    if (op.type === "dgreat") {
      fs.appendFileSync(file.text, content);
      return "";
    }
  }

  async Word({ text, expansion }) {
    if (!expansion) {
      return text;
    } else {
      const expanded = await this.combineOutputToStdout(expansion, async (node) =>
        //Like raw exec except using text as "stdin"
        await this.exec(node, text)
      );

      return expanded;
    }
  }

  async AssignmentWord({ text, expansion }) {
    let expanded

    if (expansion) {
      debugger
      const combined = await this.combineOutputToStdout(expansion, async (node) =>
        //Like raw exec except using text as "stdin"
        await this.exec(node, text)
      );

      const startTemplate = text.slice(0, loc.start);
      const endTemplate = text.slice(loc.end + 1);
      expanded = `${startTemplate}${combined}${endTemplate}`;
    }

    const [varName, value] = text.split("=");
    this.env[varName] = value;
    return [varName, value];
  }

  ArithmeticExpansion({ expression, resolved, arithmeticAST, loc }, origText) {}

  async CommandExpansion({ command, resolved, commandAST, loc }, origText) {
    const val = await this.exec(commandAST);
    return val;
  }

  ParameterExpansion({ parameter, kind, word, op, loc }, origText) {
    let param = "";

    //TODO God willing: depends on how this was run? TGIMA.
    if (kind === "shell-script-name") {
      debugger;
      param = "/usr/bin/cash";
    } else if (parameter) {
      //local env take precedence
      param = this.env[parameter] || process.env[parameter]
    }

    param = param || "";

    const startTemplate = origText.slice(0, loc.start);
    const endTemplate = origText.slice(loc.end + 1);
    const val = `${startTemplate}${param}${endTemplate}`;
    return val;
  }
}