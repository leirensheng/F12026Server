let axios = require("axios");
const env = require("./env.json");
const mainHostWithoutPort = require(`../${env.fileName}/mainHost`);
let { sendAppMsg } = require("./utils");

let getPriceByUser = (user, allConfig) => {
  let { remark = "" } = allConfig[user];
  remark = remark.replace(/\d{11}/g, "");
  let res = remark.match(/(\d{1,4})/);
  let price = res ? parseInt(res[0]) : 0;
  return price;
};

let init = (successNicknames, allConfig, runningUsers) => {
  let allUsers = Object.keys(allConfig).filter(
    (user) => !runningUsers.includes(user)
  );
  let needToOpenUsers = [];
  successNicknames.forEach((nickname) => {
    let config = allConfig[nickname];

    config.targetTypes.forEach((type) => {
      let times = 3;
      let currentAudienceLength = config.orders.length;
      let direction = -1;
      while (times) {
        let currentTargetAudienceLength =
          currentAudienceLength + (3 - times) * direction;

        console.log(type + "找目标人数量", currentTargetAudienceLength);
        if (currentTargetAudienceLength === 0) {
          direction = 1;
          times = 3;
        } else {
          let targets = allUsers.filter((user) => {
            let { only, targetTypes, orders, remark } = allConfig[user];
            return (
              targetTypes.includes(type) &&
              !successNicknames.includes(user) &&
              !needToOpenUsers.includes(user) &&
              orders.length === currentTargetAudienceLength &&
              (!only || only.length === 0) &&
              (!remark || !remark.match(/密码|便宜/))
            );
          });
          targets.sort(
            (a, b) =>
              getPriceByUser(b, allConfig) - getPriceByUser(a, allConfig)
          );

          if (targets.length > 0) {
            console.log(type + "找到目标人", targets[0]);
            needToOpenUsers.push(targets[0]);
            times = 0;
          } else {
            times--;
          }
        }
      }
    });
  });
  sendAppMsg({
    title: "成功后启动新用户",
    content: "成功后启动新用户:" + needToOpenUsers.join(","),
  });
  console.log("需要启动的用户", needToOpenUsers);
  needToOpenUsers.forEach((user) => {
    axios.post(`${mainHostWithoutPort}:${env.port}/startUserFromRemote`, {
      cmd: `npm run start ${user}`,
      isUseSlave: allConfig[user].isUseSlave,
    });
  });
};

module.exports = init;
