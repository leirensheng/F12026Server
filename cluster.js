const cluster = require("cluster");
const fs = require("fs");
const path = require("path");
let { createClient } = require("redis");
const { spawn } = require("child_process");
const { sleep } = require("../damai/utils");
const env = require("./env.json");
let audienceInfo = require(`../${env.fileName}/audienceInfo.json`);
const { sendAppMsg } = require("./utils");

let init = async () => {
  if (cluster.isMaster) {
    let lockKey = new Set();
    let pidToProcessInfo = {};
    let redisClient;
    try {
      redisClient = createClient();
      await redisClient.connect();
    } catch (e) {
      await sleep(13000);
      redisClient = createClient();
      await redisClient.connect();
    }
    await redisClient.set("noRecover" + env.fileName, "");
    await redisClient.set("isRecovering" + env.fileName, "");

    await redisClient.get("hasRecover" + env.fileName, "");

    await redisClient.set("pidToCmd" + env.fileName, "{}");

    await redisClient.set(
      "audienceInfoFor" + env.fileName,
      JSON.stringify(audienceInfo)
    );

    let toRecover = fs.readFileSync(path.resolve(__dirname, "toRecover.json"));
    fs.writeFileSync(path.resolve(__dirname, "toRecover2.json"), toRecover);

    toRecover = toRecover ? JSON.parse(toRecover) : {};
    if (!Object.keys(toRecover).length) {
      await redisClient.set("noRecover" + env.fileName, "1");
    }

    let workerInfo = {};
    let uuidToWorkerId = {};
    let messageHandler = async (
      { type, pid, msg, cmd, uuid, key },
      workerId
    ) => {
      // console.log("主进程收到消息", type, workerId);
      try {
        if (type === "toGetRealWorkToOpenMiddle") {
          let allNum = Object.values(workerInfo);
          let minOne = Math.min(...allNum);
          let minWorkerId = Object.keys(workerInfo).find(
            (id) => workerInfo[id] === minOne
          );
          uuidToWorkerId[uuid] = workerId;
          cluster.workers[minWorkerId].send({
            type: "realOpenMiddle",
            uuid,
          });
        } else if (type === "initProcess") {
          console.log("初始化进程:" + pid, workerId);
          workerInfo[workerId]++;
          pidToProcessInfo[pid] = {
            workerId,
            receiveWorkerId: "",
            uuid,
          };
          // console.log("【新增】目前进程状态==============>", workerInfo);
          cluster.workers[uuidToWorkerId[uuid]].send({
            type: "hasOpenGetPid",
            uuid,
            pid,
          });
        } else if (type === "processMsg") {
          if (!pidToProcessInfo[pid]) {
            console.log("没有保存pid" + pid);
            return;
          }
          let realWorker =
            cluster.workers[pidToProcessInfo[pid].receiveWorkerId];
          if (!realWorker) {
            console.log("没有找到worker", workerId);
            return;
          }
          realWorker.send({
            pid,
            type: "processMsg",
            msg: msg,
          });
        } else if (type === "openConsole") {
          let realWorker = cluster.workers[pidToProcessInfo[pid].workerId];
          if (!realWorker) {
            console.log("openConsole没有找到worker", workerId);
            return;
          }
          realWorker.send({
            type: "toggleConsole",
            pid,
          });
          pidToProcessInfo[pid].receiveWorkerId = workerId;
        } else if (type === "closeConsole") {
          let realWorker = cluster.workers[pidToProcessInfo[pid].workerId];
          if (!realWorker) {
            console.log("closeConsole没有找到worker", workerId);
            return;
          }
          realWorker.send({
            type: "toggleConsole",
            pid,
          });
          pidToProcessInfo[pid].receiveWorkerId = null;
        } else if (type === "startCmd") {
          let realWorker = cluster.workers[pidToProcessInfo[pid].workerId];
          realWorker.send({
            type: "startCmd",
            pid,
            cmd,
          });
        } else if (type === "deletePid") {
          if (!pidToProcessInfo[pid]) {
            console.log("没有保存pid" + pid);
            return;
          }
          let realWorkerId = pidToProcessInfo[pid].workerId;
          // console.log("删除pid", pid, "真workerId", realWorkerId);

          let realWorker = cluster.workers[realWorkerId];
          let uuid = pidToProcessInfo[pid].uuid;
          // console.log("删除的uuid", uuid);
          realWorker.send({
            type: "deletePid",
            pid,
          });
          workerInfo[realWorkerId]--;
          delete uuidToWorkerId[uuid];
          delete pidToProcessInfo[pid];
          // console.log("【删除】目前进程状态==============>", workerInfo);
        } else if (type === "lockKey") {
          lockKey.add(key);
          cluster.workers[workerId].send({
            type: "lockKeyDone",
            key,
          });
        } else if (type === "unlockKey") {
          lockKey.delete(key);
          Object.values(cluster.workers).forEach((worker, index) => {
            worker.send({
              type: "unlockKeyDone",
              key,
              index,
            });
          });
        } else if (type === "checkLockKey") {
          cluster.workers[workerId].send({
            type: "checkLockKeyDone",
            key,
            isLock: lockKey.has(key),
          });
        }
      } catch (e) {
        console.log("主进程报错！！！！！", e);
      }
    };

    const numCPUs = require("os").cpus().length;
    for (let i = 0; i < numCPUs; i++) {
      cluster.fork();
    }

    cluster.on("exit", (worker, code, signal) => {
      console.log(`worker ${worker.process.pid} died`);
    });

    let hasSetFirstWorker = false;
    for (const id in cluster.workers) {
      if (!hasSetFirstWorker) {
        hasSetFirstWorker = true;
        setTimeout(() => {
          cluster.workers[id].send({
            type: "setFirstWorker",
          });
        }, 1000);
      }
      console.log("workerId", id);
      workerInfo[id] = 0;
      cluster.workers[id].on("message", (msg) => {
        messageHandler(msg, id);
      });
    }

    await sendAppMsg("F1", "F1启动成功");
  } else {
    require("./server");
  }
};

init();
