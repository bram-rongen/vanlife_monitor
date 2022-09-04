import * as mqtt from "mqtt";
import { SocksClient } from "socks";
import logger from "./logger";

const getSocket = async (socketSettings: any) => {
  const connInfo = await SocksClient.createConnection({
    ...socketSettings,
    command: "connect",
  });
  return connInfo.socket;
};

export default async (
  socketSettings: any,
  mqttSettings: any,
  topicPrefix: string
) => {
  let socket = await getSocket(socketSettings);

  const mqttClient = new mqtt.Client(() => socket, {
    ...mqttSettings,
    will: {
      topic: `${topicPrefix}/online`,
      payload: "false",
      qos: 1,
      retain: true,
    },
  });

  mqttClient.on("connect", function () {
    logger.info("mqtt connection successful");
    mqttClient.publish(`${topicPrefix}/online`, "true");
  });

  mqttClient.on("reconnect", async function () {
    logger.info("reconnect");
    try {
      socket = await getSocket(socketSettings);
    } catch (error) {
      logger.info("Unable to reconnect");
    }
  });

  return mqttClient;
};
