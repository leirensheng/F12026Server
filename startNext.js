let axios;
let init = (successInfo, allConfig) => {
  let successNicknames = successInfo.map((obj) => obj.nickname);
  let allUsers = Object.keys(allConfig);
  let needToOpenUsers = [];
  successInfo.forEach((obj) => {
    let { nickname } = obj;
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
          let target = allUsers.find((user) => {
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
          if (target) {
            console.log(type + "找到目标人", target);
            needToOpenUsers.push(target);
            times = 0;
          } else {
            times--;
          }
        }
      }
    });
  });
  console.log("需要启动的用户", needToOpenUsers);
  needToOpenUsers.forEach((user) => {
    axios.post(`http://localhost:${env.port}/startUserFromRemote`, {
      cmd: `npm run start ${user}`,
    });
  });
};

module.exports = init;
