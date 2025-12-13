const env = require("./env.json");
const os = require("os");
const fsExtra = require("fs-extra");
const path = require("path");
const fs = require("fs");
const axios = require("axios");
const { WxPusher, Message } = require("wxpusher");
const { sendMsg } = require("../damai/utils");
const WebSocket = require("ws");
const socketURL = `ws://127.0.0.1:${env.port}/socket/`;
const crypto = require("crypto");
let { isSlave } = require(`../${env.fileName}/localConfig.json`);
const mainHostWithoutPort = require(`../${env.fileName}/mainHost`);

function getSign(data, t, token = "undefined") {
  const text = `${token}&${t}&12574478&${JSON.stringify(data)}`;
  const md5 = crypto.createHash("md5");
  md5.update(text, "utf8");
  const result = md5.digest("hex");
  return result;
}

let updateProxyWhiteIp = async (ip) => {
  if (!ip) return;
  let {
    data: { data: ips },
  } = await axios.get(
    "https://api.douyadaili.com/proxy/?service=GetWhite&authkey=APe4Ryhs0IE6DVgzIDjB&format=json"
  );
  if (ips.includes(ip)) {
    console.log("无需更新IP");
    return;
  }

  await axios.get(
    "https://api.douyadaili.com/proxy/?service=DelWhite&authkey=APe4Ryhs0IE6DVgzIDjB&format=json&white=" +
      ips.join(",")
  );
  await axios.get(
    `https://api.douyadaili.com/proxy/?service=AddWhite&authkey=APe4Ryhs0IE6DVgzIDjB&white=${ip}&format=json`
  );
  console.log("更新白名单完成");
};

let getComputerName = () => {
  let map = {
    "DESKTOP-AAKRGOM": "宏基",
    CCRPC028: "公司",
    "DESKTOP-3ML3QTF": "虚拟机4.4",
    "DESKTOP-U1N2FOL": "联想",
    "DESKTOP-STTL34E": "新电脑",
    "DESKTOP-BVI3Q54": "技嘉",
  };
  let hostname = os.hostname();
  return map[hostname] || hostname;
};

let computer = getComputerName();

let removeConfig = async (username, isNoRemove) => {
  let obj = await readFile("config.json");
  obj = JSON.parse(obj);
  if (!obj[username]) {
    sendAppMsg(
      "删除用户失败",
      "删除用户失败，用户不存在" + username + "_" + computer,
      {
        type: "error",
      }
    );
    throw new Error("删除用户失败");
  }
  // 移除电话(如果没有其他用户使用这个电话)
  let phone = obj[username].phone;
  delete obj[username];
  let hasOther = Object.keys(obj).some(
    (one) => obj[one].phone === phone && one !== username
  );
  if (!hasOther) {
    await axios({
      url: `${mainHostWithoutPort}:${env.port}/removeOnePhoneAudience`,
      method: "post",
      data: {
        phone,
      },
    });
  }
  await writeFile("config.json", JSON.stringify(obj, null, 4));

  if (!isNoRemove) {
    const dest = path.resolve(
      __dirname,
      "../" + env.fileName + "/userData/",
      username
    );
    setTimeout(() => {
      fsExtra.remove(dest);
    }, 5000);
  }
};
function readFile(name) {
  return new Promise((resolve, reject) => {
    fs.readFile(path.resolve("../" + env.fileName, name), "utf-8", (e, res) => {
      if (e) {
        reject(e);
        return;
      }
      resolve(res);
    });
  });
}
function writeFile(name, data) {
  return new Promise((resolve, reject) => {
    fs.writeFile(path.resolve("../" + env.fileName, name), data, (e) => {
      if (e) {
        reject(e);
        return;
      }
      resolve();
    });
  });
}

let formatNumber = (val) => (val < 10 ? "0" + val : val);
let getTime = (date) => {
  if (!date) {
    date = new Date();
  }
  let hour = date.getHours();
  let minute = date.getMinutes();
  let second = date.getSeconds();
  let millisecond = date.getMilliseconds();

  return `${formatNumber(hour)}:${formatNumber(minute)}:${formatNumber(
    second
  )}.${millisecond}`;
};

let sendMsgForCustomer = async (content, uid) => {
  const message = new Message();
  message.content = content;
  message.uids = [uid];
  const result = await new WxPusher("AT_s8ql37DbRNkrItpYhUK60xNNTeNE3ekp").send(
    message
  );
  // console.log(result);
};

let removeOneActivity = async (activityId, isNoRemove) => {
  let obj = await readFile("config.json");
  obj = JSON.parse(obj);

  let toRemove = [];
  Object.keys(obj).forEach((username) => {
    let cur = obj[username];
    if (Number(cur.activityId) === Number(activityId)) {
      toRemove.push(username);
      delete obj[username];
    }
  });
  await writeFile("config.json", JSON.stringify(obj, null, 4));
  if (!isNoRemove) {
    for (let username of toRemove) {
      const dest = path.resolve(
        __dirname,
        "../" + env.fileName + "/userData/",
        username
      );
      fsExtra.removeSync(dest);
    }
  }

  let checkMap = await readFile("checkMap.json");
  checkMap = JSON.parse(checkMap);
  Object.keys(checkMap).forEach((port) => {
    let cur = checkMap[port];
    if (Number(cur.activityId) === Number(activityId)) {
      delete checkMap[port];
    }
  });
  await writeFile("checkMap.json", JSON.stringify(checkMap, null, 4));

  let activityInfo = await readFile("activityInfo.json");
  activityInfo = JSON.parse(activityInfo);
  delete activityInfo[activityId];
  await writeFile("activityInfo.json", JSON.stringify(activityInfo, null, 4));
};

let waitUntilSuccess = (fn, times0 = 20, sleepTime = 5000) => {
  return async function (...args) {
    let times = times0;
    while (times) {
      try {
        let res = await fn.call(this, ...args);
        times = 0;
        return res;
      } catch (e) {
        if (sleepTime) {
          await sleep(sleepTime);
        }
        times--;
        console.log(e);
        console.log("出错重试");
      }
    }
    throw new Error("出错了");
  };
};
let sleep = (time) => new Promise((r) => setTimeout(r, time));

let myClick = async (page, selector, timeout = 6000) => {
  await page.waitForSelector(selector, { timeout });
  await page.$eval(selector, (dom) => dom.click());
};

let sendAppMsg = async (title, content, payload) => {
  try {
    await axios({
      method: "post",
      data: { title, content, payload },
      url: `${mainHostWithoutPort}:4000/sendAppMsg`,
    });
  } catch (e) {
    sendMsg("推送失败" + e.message + content);
    console.log(e);
  }
};

// let restartUser = async (user, localSocket, eventBus) => {
//   console.log(user + "启动中需要重启");
//   await axios("http://localhost:5000/stopUser/" + user);
//   await sleep(3000);

//   let promise = new Promise((r, reject) => {
//     setTimeout(reject, 10000);
//     eventBus.once("startUserDone", r);
//   });
//   localSocket.send(
//     JSON.stringify({ type: "startUser", cmd: `npm run start ${user} 1 true` })
//   );
//   await promise;
//   console.log(user + "重启完成");
// };

let getRunningUsers = async (redisClient) => {
  let pidToCmd = await redisClient.get("pidToCmd" + env.fileName);
  pidToCmd = JSON.parse(pidToCmd);
  let cmds = Object.values(pidToCmd);
  let users = cmds
    .filter((one) => one.includes(`npm run start `))
    .map((one) => one.split(/\s/)[3]);
  return users;
};

let getRunningChecks = async (redisClient) => {
  let pidToCmd = await redisClient.get("pidToCmd" + env.fileName);
  pidToCmd = JSON.parse(pidToCmd);
  let cmds = Object.values(pidToCmd);
  let ports = cmds
    .filter((one) => one.includes(`npm run check `))
    .map((one) => Number(one.split(/\s/)[3]));
  return ports;
};

let slaveDamaiHost =
  computer === "新电脑"
    ? "http://192.168.2.75:" + env.port
    : "http://192.168.2.76:" + env.port;

let isSlaveOnline = async () => {
  try {
    await axios({
      url: slaveDamaiHost + "/ping",
      method: "get",
      timeout: 50,
    });
    return true;
  } catch (e) {
    return false;
  }
};

let syncActivityInfo = async (type) => {
  let isOnline = await isSlaveOnline();
  if (isOnline) {
    try {
      await axios({
        url: slaveDamaiHost + "/syncActivityInfo/" + type,
        method: "get",
        timeout: 1000,
      });
    } catch (e) {
      console.log(e);
      sendAppMsg("同步活动信息失败", "同步信息失败:" + type + e.message, {
        type: "error",
      });
    }
  }
};

let recoverOne = async (failCmds, cmd, successMsg) => {
  try {
    await startCmdWithPidInfo({
      cmd,
      successMsg,
      isStopWhenLogin: true,
    });
  } catch (e) {
    failCmds.push(cmd);
  }
};

let recoverUser = async (userCmds, failCmds, index) => {
  let i = 0;
  for (let cmd of userCmds) {
    sendAppMsg("恢复", "恢复" + index + cmd);

    await recoverOne(failCmds, cmd, "全部打开完成");
    i++;
    let percent = Math.floor((i / userCmds.length) * 100);
    let msg = `恢复进度${index}:  ${i}/${userCmds.length}  ${percent}%`;
    sendAppMsg("恢复", msg);
    console.log(msg);
  }
};
let recoverCheck = async (checkCmds, failCmds) => {
  for (let cmd of checkCmds) {
    await recoverOne(failCmds, cmd, "开始进行");
  }
};
function splitArray(arr) {
  const n = arr.length;
  const size = Math.floor(n / 4);
  const remainder = n % 4;

  const result = [];
  let start = 0;

  for (let i = 0; i < 4; i++) {
    // 前几个子数组多一个元素（如果余数不为0）
    const extra = i < remainder ? 1 : 0;
    const end = start + size + extra;
    result.push(arr.slice(start, end));
    start = end;
  }

  return result;
}

let recover = async (redisClient) => {
  let pidToCmd = await fs.readFileSync(
    path.resolve(__dirname, "toRecover.json"),
    "utf-8"
  );
  pidToCmd = JSON.parse(pidToCmd);

  let cmds = Object.keys(pidToCmd)
    .filter((pid) => !pid.includes("slave"))
    .map((pid) => pidToCmd[pid]);

  let userCmds = cmds.filter((one) => one.includes("npm run start"));
  userCmds = userCmds.map((cmd) => cmd.replace(/ 1 true/, ""));
  userCmds = [...new Set(userCmds)];
  let fourPartCmds = splitArray(userCmds);
  let failCmds = [];

  let promises = fourPartCmds.map((cmds, index) =>
    recoverUser(cmds, failCmds, index)
  );
  await Promise.all(promises);
  if (isSlave) {
    let pidToCmd = await redisClient.get("pidToCmd" + end.fileName);
    pidToCmd = JSON.parse(pidToCmd);
    await axios({
      method: "post",
      url: mainHostWithoutPort + `:${env.port}/saveSlavePid`,
      data: {
        cmds: userCmds,
        pidToCmd,
      },
    });
  }
  return failCmds;
};

let startCmdWithPidInfo = ({
  cmd,
  successMsg = "全部打开完成",
  isSuccessClose,
  isStopWhenLogin,
}) => {
  return new Promise((resolve, reject) => {
    axios
      .get(`http://127.0.0.1:${env.port}/terminal`)
      .then((res) => res.data.data)
      .then((pid) => {
        console.log("新增进程:" + pid);
        let ws = new WebSocket(socketURL + pid);
        let closePid = () =>
          axios.get(`http://127.0.0.1:${env.port}/close/` + pid);

        ws.onmessage = ({ data }) => {
          console.log(data);
          if (data.includes(successMsg)) {
            ws.close();
            resolve({ pid });
            if (isSuccessClose) {
              closePid();
            }
          } else if (data.includes("需要手机验证码")) {
            if (isStopWhenLogin) {
              ws.close();
              closePid();
              resolve({});
            } else {
              ws.close();
              resolve({ pid });
            }
          } else {
            let res = data.match(
              /不正确|目标没对|目标为空|没有填写|没有该用户|演出结束|主动退出|Failed to launch the|没有(\d{4,})|登录不应该|Error: Attempted|请检查账号密码/
            );
            if (res) {
              ws.close();
              closePid();
              reject(new Error(cmd + res[0]));
            }
          }
        };
        ws.onopen = () => {
          ws.send(`${cmd} \r\n`);
        };
      });
  });
};

let startCmdAngGetPic = (cmd) => {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      reject(new Error("超时"));
    }, 60000);
    axios
      .get(`http://127.0.0.1:${env.port}/terminal`)
      .then((res) => res.data.data)
      .then((pid) => {
        console.log("新增进程:" + pid);
        let ws = new WebSocket(socketURL + pid);
        let allData = "";
        ws.onmessage = async ({ data }) => {
          allData += data.trim().replace(/[\b]$/, "");
          if (allData.match(/不正确/)) {
            reject(new Error("密码不正确"));
            ws.close();
            return;
          } else if (allData.match(/自动滑动失败/)) {
            reject(new Error("自动滑动失败, 请重试"));
            ws.close();
            return;
          } else if (allData.match(/滑动成功并直接登录好了/)) {
            resolve({
              pid,
              message: "不需验证码",
            });
            ws.close();
            return;
          } else if (allData.match(/全部打开完成/)) {
            if (allData.match(/没有填写观演人/)) {
              reject(new Error("没有观演人, 请先添加"));
              ws.close();
              return;
            } else if (allData.match(/没有填写收获地址/)) {
              reject(new Error("没有地址, 请先添加"));
              ws.close();
              return;
            } else if (allData.match(/信息获取完成/)) {
              resolve({
                pid,
                message: "不需验证码",
              });
              ws.close();
              return;
            }
          }
          let endPoint = "";
          let res = allData.match(/浏览器endPoint【(.*?)】/);

          if (res) {
            endPoint = res[1];
            console.log("res", endPoint);
            resolve({
              endPoint,
              pid,
            });
            ws.close();
          }
        };
        ws.onopen = () => {
          ws.send(`${cmd} \r\n`);
        };
      });
  });
};

let getUUID = () => {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    return (c === "x" ? (Math.random() * 16) | 0 : "r&0x3" | "0x8").toString(
      16
    );
  });
};

module.exports = {
  getUUID,
  recover,
  startCmdWithPidInfo,
  startCmdAngGetPic,
  updateProxyWhiteIp,
  slaveDamaiHost,
  sleep,
  sendAppMsg,
  myClick,
  removeConfig,
  readFile,
  writeFile,
  sendMsgForCustomer,
  getTime,
  removeOneActivity,
  waitUntilSuccess,
  syncActivityInfo,
  // restartUser,
  getRunningChecks,
  getRunningUsers,
  getSign,
};
