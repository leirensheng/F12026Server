let timer = setInterval(() => {}, 5000);
let path = require("path");
const { spawn } = require("child_process");
const env= require('./env.json')
let isOpen = false;

let child;

process.on("message", (msg) => {
  clearInterval(timer);
  try {
    let { type, cmd } = msg;
    if (type === "startCmd") {
      let str;
      let fileName;
      if (cmd.includes("start")) {
        str = cmd.replace("npm run start", "");
        fileName = env.autoRestartFileName;
      } else {
        str = cmd.replace("npm run check", "");
        fileName = "autoRestartCheck.js";
      }

      let args = str.split(" ").filter((one) => one && one !== "\r\n");
      // console.log("参数", args);

      let dir = path.resolve(__dirname, "../" + env.fileName);
      str = `cd  ${dir} &&node ${fileName} ${args.join(" ")}`;
      console.log();

      child = spawn("node", [fileName, ...args], {
        cwd: path.resolve(__dirname, "../" + env.fileName),
      });

      child.stdout.on("data", (data) => {
        if (isOpen) {
          process.send(data.toString());
        }
      });
      child.stderr.on("data", (data) => {
        if (isOpen) {
          process.send(data.toString());
        }
      });
    } else if (type === "toggle") {
      isOpen = !isOpen;
    }
  } catch (e) {
    console.log(e);
  }
});
