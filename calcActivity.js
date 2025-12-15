const { default: axios } = require("axios");
let env = require("./env.json");
let host = "http://127.0.0.1:" + env.port;
let activityInfo = require("../" + env.fileName + "/activity.json");

let start = async (ticketType, machine) => {
  let {
    data: {
      data: { config, pidToCmd },
    },
  } = await axios(host + "/getAllUserConfig");

  if (machine !== "all") {
    Object.keys(config).forEach((user) => {
      let needToRemove =
        machine === "slave"
          ? !config[user].isUseSlave
          : config[user].isUseSlave;
      if (needToRemove) {
        delete config[user];
      }
    });
  }

  let allTypes = Object.keys(activityInfo);
  allTypes.sort();
  let one = allTypes.filter((one) => one.match(/一号弯|围场/));
  let left = allTypes.filter((one) => !one.match(/一号弯|围场/));

  let chong = left.filter((one) => one.includes("冲刺"));
  let notChong = left.filter((one) => !one.includes("冲刺"));

  allTypes = [...notChong, ...chong, ...one];
  // console.log(config);
  // console.log()
  let runningUser = Object.values(pidToCmd)
    .filter((one) => one.includes("npm run start"))
    .map((one) => one.match(/npm run start ([^\s]*)/)[1])
    .filter((one) => {
      return config[one] && !config[one].hasSuccess;
    });

  // console.log("启动的用户", runningUser);

  let allUsers = Object.keys(config).filter(
    (user) =>
      (ticketType === "onlyOne"
        ? config[user].orders.length === 1
        : ticketType === "multiple"
        ? config[user].orders.length > 1
        : true) && !config[user].hasSuccess
  );

  // console.log(allTypes);

  let result = allTypes.reduce((prev, cur) => {
    prev[cur] = {
      all: [],
      running: [],
    };
    return prev;
  }, {});
  // console.log(result);

  allUsers.forEach((user) => {
    let cur = config[user];
    let isRunning = runningUser.includes(user);
    cur.targetTypes.forEach((type) => {
      if (!result[type]) {
        // throw new Error("type出错了" + type);
        console.log("type出错了" + type);
      } else {
        result[type].all.push(user);
        if (isRunning) {
          result[type].running.push(user);
        }
      }
    });
  });

  Object.keys(result).forEach((cur) => {
    let obj = result[cur];
    obj.allLength = obj.all.length;
    obj.runningLength = obj.running.length;
  });
  // console.log(result);
  return result;
};

module.exports = start;
