import * as mqtt from "mqtt";
import { SocksClient } from "socks";

const getSocket = async (socketSettings: any) => {
  const connInfo = await SocksClient.createConnection({
    ...socketSettings,
    command: "connect",
  });
  return connInfo.socket;
};

export default async (socketSettings: any, mqttSettings: any) => {
  let socket = await getSocket(socketSettings);

  const mqttClient = new mqtt.Client(() => socket, {
    ...mqttSettings,
    will: {
      topic: "bolife/online",
      payload: "false",
      qos: 1,
      retain: true,
    },
  });

  mqttClient.on("connect", function () {
    console.log("mqtt connection successful");
    mqttClient.publish("bolife/online", "true");
  });

  mqttClient.on("reconnect", async function () {
    console.log("reconnect");
    try {
      socket = await getSocket(socketSettings);
    } catch (error) {
      console.log("Unable to reconnect");
    }
  });

  return mqttClient;
};
