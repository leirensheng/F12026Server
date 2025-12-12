const { exec } = require("child_process");
const env = require("./env.json");
const path = require("path");
let execCmd = ({ cmd, successStr, failStr, isSuccessStop }) =>
  new Promise((resolve, reject) => {
    let data = "";
    let child = exec(cmd, {
      cwd: path.resolve(__dirname, "../" + env.fileName),
    });

    child.stdout.on("data", (cur) => {
      console.log(cur);
      data += cur;
      if (data.includes(failStr)) {
        reject(data);
      } else if (successStr && data.includes(successStr)) {
        resolve(data);
        if (isSuccessStop) {
          execCmd("taskkill /T /F /PID " + child.pid);
        }
      }
    });
    child.stdout.on("end", (cur) => {
      resolve(data);
    });
  });

module.exports = execCmd;
