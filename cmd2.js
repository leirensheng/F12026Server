const { exec } = require("child_process");
const path = require("path");
const env = require("./env.json");

//todo: 不用shell,直接用node可以减少一个进程
module.exports = (str, cb) => {
  let val = `cd ../${env.fileName} &&` + str;
  let child = exec(val, {
    cwd: path.resolve(__dirname, "../" + env.fileName),
  });
  if (cb) {
    child.stdout.on("data", cb);
    child.stderr.on("data", cb);
    child.stdout.on("end", () => {
      cb("done");
    });
  }
  child.close = () => {
    cmd("taskkill /T /F /PID " + child.pid);
  };
  return child;
};
